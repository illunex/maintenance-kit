import { captureError, flushErrorLogs, stripQuery } from '../logger'
import type { ErrorLogType } from '../logger'

/** 배포 후 stale chunk — 실제 프론트 에러 중 가장 흔하다 */
const CHUNK_PATTERNS = [
  /Loading chunk \S+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /Loading CSS chunk \S+ failed/i,
]

function isChunkError(message: string): boolean {
  return CHUNK_PATTERNS.some((pattern) => pattern.test(message))
}

function classify(message: string, fallback: ErrorLogType): ErrorLogType {
  return isChunkError(message) ? 'chunkload' : fallback
}

function currentRoute(): string | undefined {
  return typeof window === 'undefined' ? undefined : window.location.pathname
}

/**
 * 전역 에러 핸들러를 붙이고 해제 함수를 돌려준다.
 * ErrorBoundary와 window.onerror만으로는 절반만 잡히므로
 * 프로미스 거절·리소스 로드 실패까지 함께 본다.
 */
export function installGlobalHandlers(): () => void {
  if (typeof window === 'undefined') return () => undefined

  const onError = (event: ErrorEvent): void => {
    // target이 window가 아니면 <img>·<script> 같은 리소스 로드 실패다
    const target = event.target
    if (target !== window && target instanceof Element) {
      // src 쿼리스트링에 토큰·개인정보가 붙어 오는 경우가 있어 메시지에 담기 전에 자른다
      const src = stripQuery(
        target.getAttribute('src') ?? target.getAttribute('href') ?? '',
      )
      captureError({
        error: `리소스 로드 실패: ${target.tagName.toLowerCase()} ${src}`,
        type: 'resource',
        context: { route: currentRoute() },
      })
      return
    }
    const message = event.message ?? ''
    captureError({
      error: event.error ?? message,
      type: classify(message, 'error'),
      context: { route: currentRoute() },
    })
  }

  const onRejection = (event: PromiseRejectionEvent): void => {
    const reason: unknown = event.reason
    const message = reason instanceof Error ? reason.message : String(reason)
    captureError({
      error: reason,
      type: classify(message, 'unhandledrejection'),
      context: { route: currentRoute() },
    })
  }

  const onHidden = (): void => {
    if (document.visibilityState === 'hidden') flushErrorLogs()
  }

  // 리소스 에러는 버블링되지 않아 캡처 단계에서만 잡힌다
  window.addEventListener('error', onError, true)
  window.addEventListener('unhandledrejection', onRejection)
  // pagehide가 더 안정적이지만 일부 브라우저에서 누락돼 둘 다 건다
  window.addEventListener('pagehide', flushErrorLogs)
  document.addEventListener('visibilitychange', onHidden)

  return () => {
    window.removeEventListener('error', onError, true)
    window.removeEventListener('unhandledrejection', onRejection)
    window.removeEventListener('pagehide', flushErrorLogs)
    document.removeEventListener('visibilitychange', onHidden)
  }
}
