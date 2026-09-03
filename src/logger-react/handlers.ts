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

/**
 * 청크 로드 실패는 CHUNK_PATTERNS로 못 잡는다.
 * stale chunk는 대부분 <script>·<link>의 로드 실패로 나타나 리소스 경로를 타는데,
 * 그때 메시지는 이 파일이 직접 만든 문자열이라 위 패턴과 매치될 여지가 없다.
 * 그래서 태그와 오리진으로 따로 판정한다 — 오리진까지 보는 이유는
 * 서드파티 스크립트(애널리틱스·광고) 실패를 청크로 섞지 않기 위해서다.
 */
function isChunkResource(tag: string, src: string): boolean {
  if (tag !== 'script' && tag !== 'link') return false
  // src를 못 읽으면 자기 산출물인지 판단할 수 없다
  if (src === '') return false
  try {
    return new URL(src, window.location.href).origin === window.location.origin
  } catch {
    return false
  }
}

function currentRoute(): string | undefined {
  return typeof window === 'undefined' ? undefined : window.location.pathname
}

export interface GlobalHandlerOptions {
  /**
   * 리소스 로드 실패(<img> 등)를 수집할지 (기본 true).
   * 깨진 이미지가 많은 서비스에서는 이미지 404가 세션 전송 예산을 먼저
   * 소진해 정작 봐야 할 에러를 놓친다. 그럴 때 끄는 스위치다.
   * 청크 로드 실패는 이 값과 무관하게 항상 수집한다.
   */
  captureResource?: boolean
  /** 매치되는 URL은 수집하지 않는다 — 특정 CDN·버킷만 걸러낼 때 */
  ignoreResource?: readonly RegExp[]
}

function shouldCaptureResource(
  src: string,
  options: GlobalHandlerOptions,
): boolean {
  if (options.captureResource === false) return false
  const { ignoreResource } = options
  if (ignoreResource === undefined) return true
  // test()는 g 플래그가 붙은 정규식에서 lastIndex를 물고 가 호출마다 결과가 달라진다.
  // search()는 lastIndex를 쓰지 않아 호출자가 어떤 플래그를 넘겨도 안전하다.
  return !ignoreResource.some((pattern) => src.search(pattern) !== -1)
}

/**
 * 전역 에러 핸들러를 붙이고 해제 함수를 돌려준다.
 * ErrorBoundary와 window.onerror만으로는 절반만 잡히므로
 * 프로미스 거절·리소스 로드 실패까지 함께 본다.
 */
export function installGlobalHandlers(
  options: GlobalHandlerOptions = {},
): () => void {
  if (typeof window === 'undefined') return () => undefined

  const onError = (event: ErrorEvent): void => {
    // target이 window가 아니면 <img>·<script> 같은 리소스 로드 실패다
    const target = event.target
    if (target !== window && target instanceof Element) {
      // src 쿼리스트링에 토큰·개인정보가 붙어 오는 경우가 있어 메시지에 담기 전에 자른다
      const src = stripQuery(
        target.getAttribute('src') ?? target.getAttribute('href') ?? '',
      )
      const tag = target.tagName.toLowerCase()
      // 청크 로드 실패는 화면이 통째로 안 뜨는 에러다.
      // 리소스 수집을 꺼도 이건 계속 봐야 하므로 필터보다 먼저 판정한다.
      const chunk = isChunkResource(tag, src)
      if (!chunk && !shouldCaptureResource(src, options)) return
      captureError({
        error: `리소스 로드 실패: ${tag} ${src}`,
        type: chunk ? 'chunkload' : 'resource',
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
