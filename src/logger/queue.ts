import { fitEvent } from './event'
import { SCHEMA_VERSION } from './limits'
import { createEventId } from './session'
import type {
  ErrorLogEvent,
  ErrorLogPayload,
  ErrorLoggerLimits,
  Transport,
  TransportResult,
} from './types'

/**
 * 대기 시간을 기준값의 100~150%로 흩는다.
 * 지터가 없으면 서버가 회복하는 순간 접속자 전원이 같은 타이밍에 재시도해
 * 회복 중인 서버를 다시 밀어버린다. 기준값보다 줄이지는 않으므로
 * Retry-After에 그대로 적용해도 서버가 요구한 시간을 어기지 않는다.
 */
function withJitter(ms: number): number {
  return Math.round(ms * (1 + Math.random() * 0.5))
}

export interface QueueOptions {
  service: string
  env: string
  release?: string
  sessionId: string
  transport: Transport
  limits: ErrorLoggerLimits
}

/**
 * 배치 큐.
 * 세션 상한·중복 억제·재시도를 한곳에서 관리해, 에러가 폭주해도
 * 요청 수와 전송량이 구조적으로 정해진 값을 넘지 못하게 한다.
 */
export class ErrorLogQueue {
  private pending: ErrorLogEvent[] = []
  private fingerprintCounts = new Map<string, number>()
  /** 지문별로 억제된 발생 횟수 — 전송 직전에 이벤트 count로 합산한다 */
  private suppressedCounts = new Map<string, number>()
  /** 지문별 마지막 이벤트 — 큐가 비었을 때 억제분을 실어 보낼 틀 */
  private samples = new Map<string, ErrorLogEvent>()
  private sessionEventCount = 0
  private sessionRequestCount = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private flushing = false
  /** 전송 경로에서 난 에러를 다시 로깅하면 무한 루프가 된다 */
  private sending = false

  constructor(private readonly options: QueueOptions) {}

  /** 로거 자신의 전송 중에는 새 이벤트를 받지 않는다 */
  get isSending(): boolean {
    return this.sending
  }

  add(event: ErrorLogEvent): void {
    const { limits } = this.options
    if (this.sessionEventCount >= limits.maxEventsPerSession) return

    const seen = this.fingerprintCounts.get(event.fingerprint) ?? 0
    if (seen >= limits.maxPerFingerprint) {
      // 상한을 넘으면 새 이벤트를 만들지 않고 횟수만 누적한다.
      // 합산을 전송 직전으로 미뤄야 이미 전송이 끝난 지문의 횟수도 살아남는다
      // 누적분만 따로 전송하면 요청 예산을 먼저 써버려 뒤에 난 다른 에러를 놓친다.
      // 다음 전송이나 페이지 이탈 시점에 함께 실어 보낸다
      const suppressed = this.suppressedCounts.get(event.fingerprint) ?? 0
      this.suppressedCounts.set(event.fingerprint, suppressed + 1)
      return
    }

    this.fingerprintCounts.set(event.fingerprint, seen + 1)
    this.sessionEventCount += 1
    const fitted = fitEvent(event)
    this.samples.set(event.fingerprint, fitted)
    this.pending.push(fitted)

    if (this.pending.length >= limits.batchSize) {
      this.flushInBackground()
      return
    }
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.timer !== null) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.flushInBackground()
    }, this.options.limits.flushIntervalMs)
  }

  private clearTimer(): void {
    if (this.timer === null) return
    clearTimeout(this.timer)
    this.timer = null
  }

  /**
   * 억제된 횟수를 전송 대기 이벤트에 합산한다.
   * 같은 지문이 큐에 남아 있지 않으면 마지막 이벤트를 틀로 집계 1건을 만든다 —
   * 그러지 않으면 첫 전송 이후에 억제된 횟수가 통째로 사라진다.
   * 집계 건은 새 표본이 아니므로 세션 이벤트 수에는 넣지 않는다.
   */
  private drainSuppressed(): void {
    if (this.suppressedCounts.size === 0) return
    this.suppressedCounts.forEach((count, fingerprint) => {
      const existing = this.pending.find(
        (item) => item.fingerprint === fingerprint,
      )
      if (existing !== undefined) {
        existing.count += count
        return
      }
      const sample = this.samples.get(fingerprint)
      if (sample === undefined) return
      this.pending.push({
        ...sample,
        id: createEventId(),
        timestamp: new Date().toISOString(),
        count,
      })
    })
    this.suppressedCounts.clear()
  }

  /**
   * 요청 크기 상한에 맞춰 앞에서부터 담을 수 있는 만큼만 꺼낸다.
   * 상한은 브라우저의 전송 상한(64KB)에서 온 값이라 봉투와 구분자까지 세야
   * 실제 본문 크기와 어긋나지 않는다.
   */
  private takeBatch(): ErrorLogEvent[] {
    const { limits } = this.options
    const batch: ErrorLogEvent[] = []
    let size = JSON.stringify(this.buildPayload([])).length
    while (this.pending.length > 0 && batch.length < limits.batchSize) {
      const next = this.pending[0]
      if (next === undefined) break
      // 두 번째 이벤트부터는 구분자 콤마 1바이트가 더 붙는다
      const nextSize = JSON.stringify(next).length + (batch.length > 0 ? 1 : 0)
      if (batch.length > 0 && size + nextSize > limits.maxRequestBytes) break
      this.pending.shift()
      batch.push(next)
      size += nextSize
    }
    return batch
  }

  private buildPayload(events: ErrorLogEvent[]): ErrorLogPayload {
    return {
      schemaVersion: SCHEMA_VERSION,
      service: this.options.service,
      env: this.options.env,
      release: this.options.release,
      sessionId: this.options.sessionId,
      events,
    }
  }

  /**
   * 전송 호출 구간에만 가드를 건다.
   * 백오프 대기까지 막으면 그 사이 앱에서 난 에러를 통째로 잃는다.
   *
   * 커스텀 transport가 던지면 결과로 바꿔 삼킨다. 밖으로 새면
   * unhandledrejection 핸들러가 그 에러를 다시 수집하는데, 그때는 이미
   * sending 가드가 풀린 뒤라 로거가 자기 에러로 요청 예산을 태운다.
   */
  private async sendOnce(
    payload: ErrorLogPayload,
    body: string,
  ): Promise<TransportResult> {
    this.sending = true
    try {
      return await this.options.transport.send(payload, body)
    } catch {
      return { ok: false, retryable: true }
    } finally {
      this.sending = false
    }
  }

  /** 타이머·배치 상한에서 부르는 전송 — 어떤 경우에도 reject하지 않는다 */
  private flushInBackground(): void {
    void this.flush().catch(() => undefined)
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async flush(): Promise<void> {
    const { limits } = this.options
    if (this.flushing) return
    this.clearTimer()
    this.drainSuppressed()
    if (this.pending.length === 0) return
    if (this.sessionRequestCount >= limits.maxRequestsPerSession) {
      this.pending = []
      return
    }

    this.flushing = true
    try {
      const batch = this.takeBatch()
      if (batch.length === 0) return
      const payload = this.buildPayload(batch)
      const body = JSON.stringify(payload)
      this.sessionRequestCount += 1

      for (let attempt = 0; attempt <= limits.maxRetries; attempt += 1) {
        const result = await this.sendOnce(payload, body)
        if (result.ok || !result.retryable) return
        if (attempt === limits.maxRetries) return
        const fallback =
          limits.retryBackoffMs[limits.retryBackoffMs.length - 1] ?? 1000
        const backoff =
          result.retryAfterMs ?? limits.retryBackoffMs[attempt] ?? fallback
        await this.wait(withJitter(backoff))
      }
    } finally {
      this.flushing = false
      // 크기 상한 때문에 남은 이벤트가 있으면 다음 주기에 이어 보낸다
      if (this.pending.length > 0) this.scheduleFlush()
    }
  }

  /**
   * 페이지 이탈 시점 — 타이머를 기다리지 않고 즉시 보낸다.
   * 이탈 중에는 응답을 기다릴 수 없으므로 beacon 경로를 쓰고,
   * 브라우저가 받아주지 않을 때만 fetch로 폴백한다.
   */
  flushSync(): void {
    this.clearTimer()
    this.drainSuppressed()
    if (this.pending.length === 0) return
    const { limits, transport } = this.options
    if (this.sessionRequestCount >= limits.maxRequestsPerSession) return
    const batch = this.takeBatch()
    if (batch.length === 0) return
    this.sessionRequestCount += 1
    const payload = this.buildPayload(batch)
    const body = JSON.stringify(payload)
    let queued = false
    try {
      queued = transport.sendSync?.(payload, body) ?? false
    } catch {
      queued = false
    }
    if (queued) return
    void transport.send(payload, body).catch(() => undefined)
  }

  /** 테스트용 — 내부 상태 확인 */
  get size(): number {
    return this.pending.length
  }
}
