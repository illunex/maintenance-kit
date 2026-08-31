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
  }
}

/**
 * sendBeacon 우선, 실패 시 fetch keepalive로 폴백.
 * beacon은 페이지 이탈 시점에도 전송이 보장되지만 커스텀 헤더를 붙일 수 없어
 * 응답 코드도 알 수 없다. 그래서 성공/실패만 판정한다.
 */
export function beaconTransport(endpoint: string): Transport {
  return {
    async send(_payload: ErrorLogPayload, body: string): Promise<TransportResult> {
      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        try {
          // preflight를 피하려고 text/plain으로 보낸다 (서버가 허용해야 함)
          const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' })
          if (navigator.sendBeacon(endpoint, blob)) {
            return { ok: true, retryable: false }
          }
        } catch {
          // 큐가 가득 찼거나 blob 생성 실패 — fetch로 넘어간다
        }
      }

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          body,
          keepalive: true,
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
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
  }
}
