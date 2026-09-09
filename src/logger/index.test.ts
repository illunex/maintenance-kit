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
  // restoreAllMocks는 stubGlobal을 되돌리지 않아 다음 테스트로 표식이 샌다
  vi.unstubAllGlobals()
})

describe('initErrorLogger', () => {
  it('0~1 밖의 sampleRate는 전량 전송으로 되돌린다', () => {
    // 음수면 Math.random()이 항상 그 이상이라 아무것도 안 보내진다
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { transport, payloads } = recorder()
    initErrorLogger({ ...base, transport, sampleRate: -1 })
    captureError({ error: new Error('a') })
    flushErrorLogs()
    expect(payloads).toHaveLength(1)
    expect(warn).toHaveBeenCalled()
  })

  it('service·env가 있으면 시작한다', () => {
    const { transport } = recorder()
    expect(initErrorLogger({ ...base, transport })).toBe(true)
  })

  it('플러그인이 심은 값이 비어 있으면 시작하지 않고 경고를 남긴다', () => {
    // 도커 빌드처럼 git이 없어 판별에 실패한 경우 — 배포 설정 실수라 알려야 한다
    vi.stubGlobal('__MK_LOGGER_BUILD__', { service: '', env: '' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(initErrorLogger({ env: 'production' })).toBe(false)
    expect(warn).toHaveBeenCalled()
  })

  it('빌드 값 자체가 없으면 조용히 시작하지 않는다', () => {
    // Vite dev 서버는 로거를 사전 번들해 define이 닿지 않으므로 상수가 없는 게 정상이다.
    // 여기서 경고하면 로컬을 켤 때마다 뜬다
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(initErrorLogger({ env: 'production' })).toBe(false)
    expect(warn).not.toHaveBeenCalled()
  })

  it('dev 표식이 있으면 조용히 시작하지 않는다', () => {
    // next dev가 심는 표식 — 로컬 에러가 배포 환경 로그에 섞이지 않게 한다
    vi.stubGlobal('__MK_LOGGER_BUILD__', { dev: true })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { transport } = recorder()
    expect(initErrorLogger({ ...base, transport })).toBe(false)
    expect(warn).not.toHaveBeenCalled()
  })

  it('enabled가 true면 dev 표식이 있어도 시작한다', () => {
    // 로거 자체를 로컬에서 확인할 때의 탈출구
    vi.stubGlobal('__MK_LOGGER_BUILD__', { dev: true })
    const { transport } = recorder()
    expect(initErrorLogger({ ...base, transport, enabled: true })).toBe(true)
  })

  it('enabled가 true인데 service가 없으면 경고를 남긴다', () => {
    // 명시적으로 켜달라고 했으므로 왜 안 켜졌는지 알려줘야 한다
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(initErrorLogger({ env: 'production', enabled: true })).toBe(false)
    expect(warn).toHaveBeenCalled()
  })

  it('env가 없으면 시작하지 않는다', () => {
    vi.stubGlobal('__MK_LOGGER_BUILD__', { service: 'a', env: '' })
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

describe('회원 식별자', () => {
  it('getUser()로 넘긴 회원 식별자를 이벤트에 싣는다', async () => {
    const { transport, payloads } = recorder()
    initErrorLogger({ ...base, transport, getUser: () => 10482 })

    captureError({ error: new Error('boom') })
    flushErrorLogs()
    await vi.waitFor(() => expect(payloads).toHaveLength(1))

    expect(payloads[0]?.events[0]?.user).toBe('10482')
  })

  /**
   * 초기화는 앱 진입 시 1회인데 로그인은 그 뒤에 일어난다.
   * 캡처 시점에 읽지 않으면 로그인 이후 이벤트의 식별자가 통째로 빈다.
   */
  it('로그인 시점이 초기화보다 늦어도 식별자가 잡힌다', async () => {
    const { transport, payloads } = recorder()
    let memberIndex: number | null = null
    initErrorLogger({ ...base, transport, getUser: () => memberIndex })

    captureError({ error: new Error('로그인 전') })
    memberIndex = 10482
    captureError({ error: new Error('로그인 후') })
    flushErrorLogs()
    await vi.waitFor(() => expect(payloads).toHaveLength(1))

    expect(payloads[0]?.events[0]?.user).toBeUndefined()
    expect(payloads[0]?.events[1]?.user).toBe('10482')
  })

  // 여기서 던지면 전역 핸들러가 그 에러를 다시 잡아 무한 루프가 된다
  it('getUser()가 던져도 이벤트는 수집한다', async () => {
    const { transport, payloads } = recorder()
    initErrorLogger({
      ...base,
      transport,
      getUser: () => {
        throw new Error('스토어 초기화 전')
      },
    })

    captureError({ error: new Error('boom') })
    flushErrorLogs()
    await vi.waitFor(() => expect(payloads).toHaveLength(1))

    expect(payloads[0]?.events[0]?.user).toBeUndefined()
    expect(payloads[0]?.events[0]?.message).toBe('boom')
  })
})

describe('요금제·라이선스 등급', () => {
  it('객체로 넘기면 식별자와 등급을 함께 싣는다', async () => {
    const { transport, payloads } = recorder()
    initErrorLogger({
      ...base,
      transport,
      getUser: () => ({ id: 10482, plan: '프리미엄' }),
    })

    captureError({ error: new Error('boom') })
    flushErrorLogs()
    await vi.waitFor(() => expect(payloads).toHaveLength(1))

    expect(payloads[0]?.events[0]?.user).toBe('10482')
    expect(payloads[0]?.events[0]?.plan).toBe('프리미엄')
  })

  // 등급명은 개인정보가 아닌 분류값이라 id와 달리 한글·공백을 막지 않는다
  it('등급만 넘겨도 되고, 식별자만 넘겨도 된다', async () => {
    const { transport, payloads } = recorder()
    initErrorLogger({ ...base, transport, getUser: () => ({ plan: 'FREE 체험' }) })

    captureError({ error: new Error('boom') })
    flushErrorLogs()
    await vi.waitFor(() => expect(payloads).toHaveLength(1))

    expect(payloads[0]?.events[0]?.plan).toBe('FREE 체험')
    expect(payloads[0]?.events[0]?.user).toBeUndefined()
  })
})

/**
 * 새 필드는 전부 선택이다.
 * 앱이 준비된 값만 넘기고 나머지는 그냥 두면 되도록, 값이 없으면 키째로 빠져야 한다
 * (null이 남으면 수집 쪽에서 "없음"과 "빈 값"을 구분해야 한다).
 */
describe('넘기지 않은 필드', () => {
  it('getUser를 설정하지 않으면 user·plan 키 자체가 없다', async () => {
    const { transport, payloads } = recorder()
    initErrorLogger({ ...base, transport })

    captureError({ error: new Error('boom') })
    flushErrorLogs()
    await vi.waitFor(() => expect(payloads).toHaveLength(1))

    const [event] = JSON.parse(JSON.stringify(payloads[0])).events
    expect(event).not.toHaveProperty('user')
    expect(event).not.toHaveProperty('plan')
  })

  it('일부만 넘기면 넘긴 것만 실리고 경고도 남기지 않는다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { transport, payloads } = recorder()
    initErrorLogger({ ...base, transport, getUser: () => ({ plan: '프리미엄' }) })

    captureError({ error: new Error('boom') })
    flushErrorLogs()
    await vi.waitFor(() => expect(payloads).toHaveLength(1))

    const [event] = JSON.parse(JSON.stringify(payloads[0])).events
    expect(event.plan).toBe('프리미엄')
    expect(event).not.toHaveProperty('user')
    expect(warn).not.toHaveBeenCalled()
  })
})
