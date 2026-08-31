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
      maxRequestBytes: 400,
      maxPerFingerprint: 100,
      maxRequestsPerSession: 10,
    })
    for (let index = 0; index < 4; index += 1) {
      queue.add(error(`에러 ${index} ${'x'.repeat(150)}`))
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

  it('빈 큐에서는 아무것도 보내지 않는다', async () => {
    const { transport, payloads } = recorder()
    const queue = makeQueue(transport)
    await queue.flush()
    queue.flushSync()
    expect(payloads).toHaveLength(0)
  })
})
