import { fitEvent } from './event'
import { SCHEMA_VERSION } from './limits'
import type {
  ErrorLogEvent,
  ErrorLogPayload,
  ErrorLoggerLimits,
  Transport,
} from './types'

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
      // 상한을 넘으면 새 이벤트를 만들지 않고 기존 건의 count만 올린다
      const existing = this.pending.find(
        (item) => item.fingerprint === event.fingerprint,
      )
      if (existing !== undefined) existing.count += 1
      return
    }

    this.fingerprintCounts.set(event.fingerprint, seen + 1)
    this.sessionEventCount += 1
    this.pending.push(fitEvent(event))

    if (this.pending.length >= limits.batchSize) {
      void this.flush()
      return
    }
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.timer !== null) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, this.options.limits.flushIntervalMs)
  }

  private clearTimer(): void {
    if (this.timer === null) return
    clearTimeout(this.timer)
    this.timer = null
  }

  /** 요청 크기 상한에 맞춰 앞에서부터 담을 수 있는 만큼만 꺼낸다 */
  private takeBatch(): ErrorLogEvent[] {
    const { limits } = this.options
    const batch: ErrorLogEvent[] = []
    let size = 0
    while (this.pending.length > 0 && batch.length < limits.batchSize) {
      const next = this.pending[0]
      if (next === undefined) break
      const nextSize = JSON.stringify(next).length
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

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async flush(): Promise<void> {
    const { limits, transport } = this.options
    if (this.flushing) return
    this.clearTimer()
    if (this.pending.length === 0) return
    if (this.sessionRequestCount >= limits.maxRequestsPerSession) {
      this.pending = []
      return
    }

    this.flushing = true
    this.sending = true
    try {
      const batch = this.takeBatch()
      if (batch.length === 0) return
      const payload = this.buildPayload(batch)
      const body = JSON.stringify(payload)
      this.sessionRequestCount += 1

      for (let attempt = 0; attempt <= limits.maxRetries; attempt += 1) {
        const result = await transport.send(payload, body)
        if (result.ok || !result.retryable) return
        if (attempt === limits.maxRetries) return
        const fallback =
          limits.retryBackoffMs[limits.retryBackoffMs.length - 1] ?? 1000
        const backoff =
          result.retryAfterMs ?? limits.retryBackoffMs[attempt] ?? fallback
        await this.wait(backoff)
      }
    } finally {
      this.flushing = false
      this.sending = false
      // 크기 상한 때문에 남은 이벤트가 있으면 다음 주기에 이어 보낸다
      if (this.pending.length > 0) this.scheduleFlush()
    }
  }

  /** 페이지 이탈 시점 — 타이머를 기다리지 않고 즉시 보낸다 */
  flushSync(): void {
    this.clearTimer()
    if (this.pending.length === 0) return
    const { limits, transport } = this.options
    if (this.sessionRequestCount >= limits.maxRequestsPerSession) return
    const batch = this.takeBatch()
    if (batch.length === 0) return
    this.sessionRequestCount += 1
    const payload = this.buildPayload(batch)
    void transport.send(payload, JSON.stringify(payload))
  }

  /** 테스트용 — 내부 상태 확인 */
  get size(): number {
    return this.pending.length
  }
}
