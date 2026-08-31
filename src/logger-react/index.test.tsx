// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ErrorLogPayload, Transport } from '../logger'
import { ErrorLogBoundary, ErrorLogProvider } from './index'

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

/** 모든 이벤트를 한 요청에 모으지 않고 바로 보내도록 배치 크기를 1로 둔다 */
const eager = { limits: { batchSize: 1 } }

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ErrorLogProvider', () => {
  it('children을 그대로 렌더한다', () => {
    const { transport } = recorder()
    render(
      <ErrorLogProvider {...base} transport={transport}>
        <p>본문</p>
      </ErrorLogProvider>,
    )
    expect(screen.getByText('본문')).toBeTruthy()
  })

  it('전역 error 이벤트를 수집한다', async () => {
    const { transport, payloads } = recorder()
    render(
      <ErrorLogProvider {...base} {...eager} transport={transport}>
        <p>본문</p>
      </ErrorLogProvider>,
    )
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'boom', error: new Error('boom') }),
    )
    await waitFor(() => expect(payloads).toHaveLength(1))
    expect(payloads[0]?.events[0]?.type).toBe('error')
  })

  it('청크 로드 실패를 chunkload로 분류한다', async () => {
    const { transport, payloads } = recorder()
    render(
      <ErrorLogProvider {...base} {...eager} transport={transport}>
        <p>본문</p>
      </ErrorLogProvider>,
    )
    const message = 'Loading chunk 42 failed.'
    window.dispatchEvent(
      new ErrorEvent('error', { message, error: new Error(message) }),
    )
    await waitFor(() => expect(payloads).toHaveLength(1))
    expect(payloads[0]?.events[0]?.type).toBe('chunkload')
  })

  it('unhandledrejection을 수집한다', async () => {
    const { transport, payloads } = recorder()
    render(
      <ErrorLogProvider {...base} {...eager} transport={transport}>
        <p>본문</p>
      </ErrorLogProvider>,
    )
    // jsdom은 PromiseRejectionEvent 생성자를 제공하지 않아 Event로 대체한다
    const event = new Event('unhandledrejection') as Event & { reason: unknown }
    event.reason = new Error('거절됨')
    window.dispatchEvent(event)
    await waitFor(() => expect(payloads).toHaveLength(1))
    expect(payloads[0]?.events[0]?.type).toBe('unhandledrejection')
  })

  it('언마운트하면 핸들러를 제거한다', async () => {
    const { transport, payloads } = recorder()
    const view = render(
      <ErrorLogProvider {...base} {...eager} transport={transport}>
        <p>본문</p>
      </ErrorLogProvider>,
    )
    view.unmount()
    // error 객체를 실으면 jsdom이 uncaught로 다시 던진다 — 메시지만 보낸다
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(payloads).toHaveLength(0)
  })
})

function Broken(): never {
  throw new Error('렌더 실패')
}

describe('ErrorLogBoundary', () => {
  it('렌더 에러를 fallback으로 대체하고 fatal로 수집한다', async () => {
    const { transport, payloads } = recorder()
    // React가 콘솔에 남기는 에러 로그를 테스트 출력에서 감춘다
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <ErrorLogProvider {...base} {...eager} transport={transport}>
        <ErrorLogBoundary fallback={<p>문제가 발생했습니다</p>} component="Broken">
          <Broken />
        </ErrorLogBoundary>
      </ErrorLogProvider>,
    )
    expect(screen.getByText('문제가 발생했습니다')).toBeTruthy()
    await waitFor(() => expect(payloads).toHaveLength(1))
    const event = payloads[0]?.events[0]
    expect(event?.level).toBe('fatal')
    expect(event?.type).toBe('boundary')
    expect(event?.context?.component).toBe('Broken')
  })
})
