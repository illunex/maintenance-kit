import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureError,
  flushErrorLogs,
  initErrorLogger,
  pendingErrorLogCount,
  resetErrorLogger,
} from './index'
import type { ErrorLogPayload, Transport } from './types'

function recorder(): { transport: Transport; payloads: ErrorLogPayload[] } {
  const payloads: ErrorLogPayload[] = []
  return {
    payloads,
    transport: {
      send(payload) {
        payloads.push(payload)
        return Promise.resolve({ ok: true, retryable: false })
      },
    },
  }
}

const base = { service: 'em-stock-front', env: 'production' }

afterEach(() => {
  resetErrorLogger()
  vi.restoreAllMocks()
})

describe('initErrorLogger', () => {
  it('service·env가 있으면 시작한다', () => {
    const { transport } = recorder()
    expect(initErrorLogger({ ...base, transport })).toBe(true)
  })

  it('service가 없으면 시작하지 않고 경고를 남긴다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(initErrorLogger({ env: 'production' })).toBe(false)
    expect(warn).toHaveBeenCalled()
  })

  it('env가 없으면 시작하지 않는다', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(initErrorLogger({ service: 'a' })).toBe(false)
  })

  it('enabled가 false면 시작하지 않는다', () => {
    expect(initErrorLogger({ ...base, enabled: false })).toBe(false)
  })

  it('endpoint가 없으면 console transport로 떨어지고 경고를 남긴다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(initErrorLogger(base)).toBe(true)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('console transport'),
    )
  })

  it('두 번째 호출은 무시한다', () => {
    const { transport } = recorder()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    initErrorLogger({ ...base, transport })
    expect(initErrorLogger({ ...base, transport })).toBe(false)
    expect(warn).toHaveBeenCalled()
  })
})

describe('captureError', () => {
  it('초기화 전 호출은 터지지 않고 큐에도 쌓이지 않는다', () => {
    expect(() => captureError({ error: new Error('x') })).not.toThrow()
    expect(pendingErrorLogCount()).toBe(0)
  })

  it('초기화 전 이벤트는 버퍼에 담겼다가 초기화 시점에 합류한다', () => {
    // ErrorLogBoundary가 Provider의 useEffect보다 먼저 도는 경우를 재현한다
    const { transport } = recorder()
    captureError({ error: new Error('첫 렌더 실패') })
    initErrorLogger({ ...base, transport })
    expect(pendingErrorLogCount()).toBe(1)
  })

  it('초기화 후에는 큐에 쌓인다', () => {
    const { transport } = recorder()
    initErrorLogger({ ...base, transport })
    captureError({ error: new Error('x') })
    expect(pendingErrorLogCount()).toBe(1)
  })

  it('sampleRate 0이면 아무것도 담지 않는다', () => {
    const { transport } = recorder()
    initErrorLogger({ ...base, transport, sampleRate: 0 })
    captureError({ error: new Error('x') })
    expect(pendingErrorLogCount()).toBe(0)
  })
})

describe('flushErrorLogs', () => {
  it('대기 중인 이벤트를 즉시 보낸다', () => {
    const { transport, payloads } = recorder()
    initErrorLogger({ ...base, transport })
    captureError({ error: new Error('x') })
    flushErrorLogs()
    expect(payloads).toHaveLength(1)
    expect(payloads[0]?.events[0]?.message).toBe('x')
  })

  it('초기화 전 호출해도 터지지 않는다', () => {
    expect(() => flushErrorLogs()).not.toThrow()
  })
})
