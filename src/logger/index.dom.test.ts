// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureError,
  flushErrorLogs,
  initErrorLogger,
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

describe('클라이언트 정보 (브라우저)', () => {
  it('브라우저 정보를 봉투에 한 번만 담는다', async () => {
    const { transport, payloads } = recorder()
    initErrorLogger({ ...base, transport })

    captureError({ error: new Error('첫 번째') })
    captureError({ error: new Error('두 번째') })
    flushErrorLogs()
    await vi.waitFor(() => expect(payloads).toHaveLength(1))

    const [payload] = payloads
    expect(payload?.client?.userAgent).toBeTypeOf('string')
    // 이벤트마다 반복해 실으면 요청 예산만 먹는다
    expect(payload?.events).toHaveLength(2)
  })

  it('세션 중에 바뀌는 viewport는 이벤트마다 담는다', async () => {
    const { transport, payloads } = recorder()
    initErrorLogger({ ...base, transport })

    window.innerWidth = 1920
    window.innerHeight = 1080
    captureError({ error: new Error('데스크톱') })
    window.innerWidth = 390
    window.innerHeight = 844
    captureError({ error: new Error('모바일 폭') })
    flushErrorLogs()
    await vi.waitFor(() => expect(payloads).toHaveLength(1))

    expect(payloads[0]?.events[0]?.viewport).toBe('1920x1080')
    expect(payloads[0]?.events[1]?.viewport).toBe('390x844')
  })
})
