import type { ErrorLogPayload, Transport, TransportResult } from './types'

/** Retry-After는 초 단위 또는 HTTP-date로 온다 */
function parseRetryAfter(header: string | null): number | undefined {
  if (header === null) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return seconds * 1000
  const date = Date.parse(header)
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}

/** 개발용 — 엔드포인트 없이도 로컬에서 전 구간을 검증할 수 있다 */
export function consoleTransport(): Transport {
  return {
    send(payload) {
      // eslint-disable-next-line no-console
      console.info('[maintenance-kit:logger]', payload)
      return Promise.resolve({ ok: true, retryable: false })
    },
    sendSync(payload) {
      // eslint-disable-next-line no-console
      console.info('[maintenance-kit:logger]', payload)
      return true
    },
  }
}

/** preflight를 피하려고 text/plain으로 보낸다 (서버가 허용해야 함) */
const CONTENT_TYPE = 'text/plain;charset=UTF-8'

/**
 * 평시에는 fetch, 페이지 이탈 시점에는 sendBeacon.
 *
 * beacon은 이탈 중에도 전송이 보장되지만 응답을 볼 수 없어
 * "브라우저 큐에 넣었다"까지만 알 수 있다. 평시 전송까지 beacon으로 보내면
 * 서버가 429·5xx를 내도 성공으로 판정돼 재시도와 Retry-After 정책이 통째로 죽는다.
 * 그래서 상태 코드를 볼 수 있는 경로와 이탈 전용 경로를 나눈다.
 */
export function httpTransport(endpoint: string): Transport {
  return {
    async send(_payload: ErrorLogPayload, body: string): Promise<TransportResult> {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          body,
          // 전송 도중 이탈해도 요청이 살아남는다
          keepalive: true,
          headers: { 'Content-Type': CONTENT_TYPE },
        })
        if (response.ok) return { ok: true, retryable: false }
        return {
          ok: false,
          // 4xx는 다시 보내도 같은 결과라 재시도하지 않는다
          retryable: response.status >= 500 || response.status === 429,
          retryAfterMs: parseRetryAfter(response.headers.get('Retry-After')),
        }
      } catch {
        // 네트워크 단절 — 복구될 수 있으므로 재시도 대상
        return { ok: false, retryable: true }
      }
    },

    sendSync(_payload: ErrorLogPayload, body: string): boolean {
      if (
        typeof navigator === 'undefined' ||
        typeof navigator.sendBeacon !== 'function'
      ) {
        return false
      }
      try {
        const blob = new Blob([body], { type: CONTENT_TYPE })
        return navigator.sendBeacon(endpoint, blob)
      } catch {
        // 큐가 가득 찼거나 blob 생성 실패 — 큐가 fetch로 폴백한다
        return false
      }
    },
  }
}
