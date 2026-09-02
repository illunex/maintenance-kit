import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LIMITS, MAX_REQUEST_BYTES, resolveLimits } from './limits'

describe('resolveLimits', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('생략한 값은 기본값을 쓴다', () => {
    expect(resolveLimits()).toEqual(DEFAULT_LIMITS)
    expect(resolveLimits({ batchSize: 5 }).flushIntervalMs).toBe(
      DEFAULT_LIMITS.flushIntervalMs,
    )
  })

  it('batchSize 0은 1로 올린다', () => {
    // 0이면 takeBatch가 항상 빈 배열을 돌려줘 이벤트가 영원히 전송되지 않는다
    expect(resolveLimits({ batchSize: 0 }).batchSize).toBe(1)
  })

  it('음수 재시도 횟수는 0으로 맞춘다', () => {
    expect(resolveLimits({ maxRetries: -3 }).maxRetries).toBe(0)
  })

  it('요청 크기는 브라우저 전송 상한을 넘지 못한다', () => {
    expect(resolveLimits({ maxRequestBytes: 5 * 1024 * 1024 }).maxRequestBytes).toBe(
      MAX_REQUEST_BYTES,
    )
  })

  it('숫자가 아닌 값은 기본값으로 되돌리고 경고한다', () => {
    const warn = vi.spyOn(console, 'warn')
    const limits = resolveLimits({
      flushIntervalMs: Number.NaN,
      maxEventsPerSession: undefined,
    })
    expect(limits.flushIntervalMs).toBe(DEFAULT_LIMITS.flushIntervalMs)
    expect(limits.maxEventsPerSession).toBe(DEFAULT_LIMITS.maxEventsPerSession)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('쓸 수 있는 백오프 값이 없으면 기본값을 쓴다', () => {
    expect(resolveLimits({ retryBackoffMs: [] }).retryBackoffMs).toEqual(
      DEFAULT_LIMITS.retryBackoffMs,
    )
    expect(resolveLimits({ retryBackoffMs: [-1, 500] }).retryBackoffMs).toEqual([500])
  })
})
