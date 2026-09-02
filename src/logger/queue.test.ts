import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildEvent } from './event'
import { resolveLimits } from './limits'
import { ErrorLogQueue } from './queue'
import type { ErrorLogPayload, Transport, TransportResult } from './types'

interface Recorder {
  transport: Transport
  payloads: ErrorLogPayload[]
}

function recorder(results: TransportResult[] = []): Recorder {
  const payloads: ErrorLogPayload[] = []
  let call = 0
  return {
    payloads,
    transport: {
      send(payload) {
        payloads.push(payload)
        const result = results[call] ?? { ok: true, retryable: false }
        call += 1
        return Promise.resolve(result)
      },
    },
  }
}

function makeQueue(
  transport: Transport,
  overrides: Partial<ReturnType<typeof resolveLimits>> = {},
) {
  return new ErrorLogQueue({
    service: 'em-stock-front',
    env: 'production',
    release: '0f3ab21',
    sessionId: 'SESSION',
    transport,
    limits: resolveLimits(overrides),
  })
}

const error = (message: string) => buildEvent({ error: new Error(message) })

describe('ErrorLogQueue', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('배치 크기가 차면 즉시 전송한다', async () => {
    const { transport, payloads } = recorder()
    const queue = makeQueue(transport, { batchSize: 2 })
    queue.add(error('a'))
    queue.add(error('b'))
    await vi.waitFor(() => expect(payloads).toHaveLength(1))
    expect(payloads[0]?.events).toHaveLength(2)
  })

  it('봉투에 공통 메타를 담는다', async () => {
    const { transport, payloads } = recorder()
    const queue = makeQueue(transport, { batchSize: 1 })
    queue.add(error('a'))
    await vi.waitFor(() => expect(payloads).toHaveLength(1))
    expect(payloads[0]).toMatchObject({
      schemaVersion: 1,
      service: 'em-stock-front',
      env: 'production',
      release: '0f3ab21',
      sessionId: 'SESSION',
    })
  })

  it('세션당 이벤트 상한을 넘으면 버린다', () => {
    const { transport } = recorder()
    const queue = makeQueue(transport, {
      maxEventsPerSession: 2,
      batchSize: 100,
      maxPerFingerprint: 100,
    })
    queue.add(error('a'))
    queue.add(error('b'))
    queue.add(error('c'))
    expect(queue.size).toBe(2)
  })

  it('동일 지문이 상한을 넘으면 새 이벤트 대신 count만 올린다', () => {
    const { transport } = recorder()
    const queue = makeQueue(transport, { maxPerFingerprint: 2, batchSize: 100 })
    const make = () => buildEvent({ error: new Error('같은 에러') })
    queue.add(make())
    queue.add(make())
    queue.add(make())
    queue.add(make())
    expect(queue.size).toBe(2)
  })

  it('재시도 가능한 실패는 다시 보낸다', async () => {
    const { transport, payloads } = recorder([
      { ok: false, retryable: true, retryAfterMs: 0 },
      { ok: true, retryable: false },
    ])
    const queue = makeQueue(transport, { batchSize: 1 })
    queue.add(error('a'))
    await vi.waitFor(() => expect(payloads).toHaveLength(2))
  })

  it('5xx가 이어져도 기본값으로 한 번만 다시 보낸다', async () => {
    const { transport, payloads } = recorder([
      { ok: false, retryable: true },
      { ok: false, retryable: true },
      { ok: false, retryable: true },
    ])
    // 대기만 0으로 두고 재시도 횟수는 기본값(1회)을 그대로 검증한다
    const queue = makeQueue(transport, { batchSize: 1, retryBackoffMs: [0] })
    queue.add(error('a'))
    await vi.waitFor(() => expect(payloads).toHaveLength(2))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(payloads).toHaveLength(2)
  })

  it('4xx처럼 재시도 불가한 실패는 다시 보내지 않는다', async () => {
    const { transport, payloads } = recorder([{ ok: false, retryable: false }])
    const queue = makeQueue(transport, { batchSize: 1 })
    queue.add(error('a'))
    await vi.waitFor(() => expect(payloads).toHaveLength(1))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(payloads).toHaveLength(1)
  })

  it('세션당 요청 상한을 넘으면 큐를 비우고 보내지 않는다', async () => {
    const { transport, payloads } = recorder()
    const queue = makeQueue(transport, {
      batchSize: 1,
      maxRequestsPerSession: 1,
      maxPerFingerprint: 100,
    })
    queue.add(error('a'))
    await vi.waitFor(() => expect(payloads).toHaveLength(1))
    queue.add(error('b'))
    await queue.flush()
    expect(payloads).toHaveLength(1)
  })

  it('요청 크기 상한을 넘으면 배치를 쪼갠다', async () => {
    const { transport, payloads } = recorder()
    const queue = makeQueue(transport, {
      batchSize: 10,
      maxRequestBytes: 1024,
      maxPerFingerprint: 100,
      maxRequestsPerSession: 10,
    })
    for (let index = 0; index < 4; index += 1) {
      queue.add(error(`에러 ${index} ${'x'.repeat(400)}`))
    }
    await queue.flush()
    expect(payloads).toHaveLength(1)
    expect(payloads[0]?.events.length).toBeLessThan(4)
    expect(queue.size).toBeGreaterThan(0)
  })

  it('flushSync는 타이머를 기다리지 않고 보낸다', () => {
    const { transport, payloads } = recorder()
    const queue = makeQueue(transport, { batchSize: 100 })
    queue.add(error('a'))
    expect(payloads).toHaveLength(0)
    queue.flushSync()
    expect(payloads).toHaveLength(1)
  })

  it('flushSync는 이탈 전용 경로(sendSync)를 먼저 쓴다', () => {
    const { transport, payloads } = recorder()
    const sendSync = vi.fn(() => true)
    const queue = makeQueue({ ...transport, sendSync }, { batchSize: 100 })
    queue.add(error('a'))
    queue.flushSync()
    expect(sendSync).toHaveBeenCalledTimes(1)
    // beacon이 받아줬으면 fetch로 두 번 보내지 않는다
    expect(payloads).toHaveLength(0)
  })

  it('sendSync가 받아주지 않으면 send로 폴백한다', () => {
    const { transport, payloads } = recorder()
    const queue = makeQueue(
      { ...transport, sendSync: () => false },
      { batchSize: 100 },
    )
    queue.add(error('a'))
    queue.flushSync()
    expect(payloads).toHaveLength(1)
  })

  it('평시 전송은 sendSync를 쓰지 않는다', async () => {
    // beacon으로 보내면 429·5xx를 볼 수 없어 재시도 정책이 통째로 죽는다
    const { transport, payloads } = recorder()
    const sendSync = vi.fn(() => true)
    const queue = makeQueue({ ...transport, sendSync }, { batchSize: 1 })
    queue.add(error('a'))
    await vi.waitFor(() => expect(payloads).toHaveLength(1))
    expect(sendSync).not.toHaveBeenCalled()
  })

  it('transport가 던져도 큐 밖으로 새지 않는다', async () => {
    // 밖으로 새면 unhandledrejection 핸들러가 로거 자신의 에러를 다시 수집한다
    let calls = 0
    const transport: Transport = {
      send() {
        calls += 1
        return Promise.reject(new Error('transport 폭발'))
      },
    }
    const queue = makeQueue(transport, { batchSize: 100, retryBackoffMs: [0] })
    queue.add(error('a'))
    await expect(queue.flush()).resolves.toBeUndefined()
    // 던진 것도 재시도 가능한 실패로 취급한다 (기본 1회 재시도)
    expect(calls).toBe(2)
  })

  it('flushSync에서 transport가 던져도 예외가 새지 않는다', () => {
    const transport: Transport = {
      send: () => Promise.reject(new Error('transport 폭발')),
      sendSync: () => {
        throw new Error('beacon 폭발')
      },
    }
    const queue = makeQueue(transport, { batchSize: 100 })
    queue.add(error('a'))
    expect(() => queue.flushSync()).not.toThrow()
  })

  it('억제된 횟수를 대기 중인 같은 지문 이벤트에 합산한다', async () => {
    const { transport, payloads } = recorder()
    const queue = makeQueue(transport, { maxPerFingerprint: 2, batchSize: 100 })
    const make = () => buildEvent({ error: new Error('같은 에러') })
    queue.add(make())
    queue.add(make())
    queue.add(make())
    queue.add(make())
    await queue.flush()
    expect(payloads[0]?.events).toHaveLength(2)
    const total = payloads[0]?.events.reduce((sum, event) => sum + event.count, 0)
    expect(total).toBe(4)
  })

  it('이미 전송된 지문의 억제 횟수도 다음 전송에 집계로 실어 보낸다', async () => {
    const { transport, payloads } = recorder()
    const queue = makeQueue(transport, {
      maxPerFingerprint: 1,
      batchSize: 1,
      maxRequestsPerSession: 5,
    })
    const make = () => buildEvent({ error: new Error('반복 에러') })
    queue.add(make())
    await vi.waitFor(() => expect(payloads).toHaveLength(1))
    // 자동 전송이 끝나야 다음 flush가 겹치지 않는다
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(queue.size).toBe(0)

    queue.add(make())
    queue.add(make())
    queue.add(make())
    await queue.flush()

    expect(payloads).toHaveLength(2)
    const first = payloads[0]?.events[0]
    const aggregated = payloads[1]?.events[0]
    expect(aggregated?.count).toBe(3)
    expect(aggregated?.fingerprint).toBe(first?.fingerprint)
    // 서버가 중복으로 지우지 않도록 집계 건은 새 id를 가진다
    expect(aggregated?.id).not.toBe(first?.id)
  })

  it('빈 큐에서는 아무것도 보내지 않는다', async () => {
    const { transport, payloads } = recorder()
    const queue = makeQueue(transport)
    await queue.flush()
    queue.flushSync()
    expect(payloads).toHaveLength(0)
  })
})
