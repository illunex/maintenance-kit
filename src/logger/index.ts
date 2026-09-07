import { readBuildValues } from './build-values'
import { readClient } from './client'
import { setKeptQueryParams } from './keep-query'
import { buildEvent } from './event'
import { resolveLimits } from './limits'
import { ErrorLogQueue } from './queue'
import { resolveSessionId } from './session'
import { consoleTransport, httpTransport } from './transport'
import type {
  CaptureInput,
  ErrorLogEvent,
  ErrorLoggerConfig,
  ErrorLogUser,
} from './types'
import { warn } from './warn'

export type {
  CaptureInput,
  ErrorLogClient,
  ErrorLogContext,
  ErrorLogEvent,
  ErrorLogLevel,
  ErrorLogPayload,
  ErrorLogType,
  ErrorLogUser,
  ErrorLoggerConfig,
  ErrorLoggerLimits,
  Transport,
  TransportResult,
} from './types'
export { DEFAULT_LIMITS, FIELD_LIMITS, SCHEMA_VERSION } from './limits'
export { consoleTransport, httpTransport } from './transport'
export { createFingerprint } from './fingerprint'
export {
  sanitizeContext,
  sanitizePlan,
  sanitizeUserId,
  scrub,
  stripQuery,
  truncate,
} from './mask'
export { buildEvent } from './event'
export { parseBrowser, parseOs, readClient, readViewport } from './client'
export { keptQueryParams } from './keep-query'

/**
 * 초기화 전에 잡힌 이벤트를 잠시 담아두는 버퍼.
 * ErrorLogBoundary의 componentDidCatch는 Provider의 useEffect보다 먼저 돌기 때문에,
 * 버리면 첫 렌더에서 터진 에러를 놓친다.
 */
const PRE_INIT_LIMIT = 20
let preInit: ErrorLogEvent[] = []

let queue: ErrorLogQueue | null = null

/**
 * 0~1 밖의 값은 되돌린다.
 * 음수가 들어오면 Math.random()이 항상 그 이상이라 전량 드롭되는데,
 * 조용히 그렇게 되면 수집이 멈춘 걸 알아챌 방법이 없다.
 */
function resolveSampleRate(raw: number | undefined): number {
  if (raw === undefined) return 1
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw > 1) {
    warn(`sampleRate=${String(raw)}는 0~1 범위가 아니어서 1(전량 전송)로 되돌립니다.`)
    return 1
  }
  return raw
}

/**
 * 로거를 초기화한다.
 * service·env·release는 빌드 플러그인이 주입한 값을 기본으로 쓰고,
 * 명시 설정이 있으면 그쪽이 우선한다.
 */
export function initErrorLogger(config: ErrorLoggerConfig = {}): boolean {
  if (config.enabled === false) return false
  if (queue !== null) {
    warn('이미 초기화되어 있습니다. 두 번째 호출은 무시합니다.')
    return false
  }

  const build = readBuildValues()
  const service = config.service ?? build.service
  const env = config.env ?? build.env
  const endpoint = config.endpoint ?? build.endpoint

  if (service === undefined || service === '') {
    warn('service를 확인할 수 없어 수집을 시작하지 않습니다. 빌드 플러그인을 추가했는지 확인하세요.')
    return false
  }
  if (env === undefined || env === '') {
    warn('env를 확인할 수 없어 수집을 시작하지 않습니다. 빌드 플러그인을 추가했는지 확인하세요.')
    return false
  }

  const transport =
    config.transport ??
    (endpoint === undefined || endpoint === ''
      ? (warn('endpoint가 없어 개발용 console transport로 동작합니다.'),
        consoleTransport())
      : httpTransport(endpoint))

  queue = new ErrorLogQueue({
    service,
    env,
    release: config.release ?? build.release,
    sessionId: resolveSessionId(),
    client: readClient(),
    transport,
    limits: resolveLimits(config.limits),
  })
  sampleRate = resolveSampleRate(config.sampleRate)
  getUser = typeof config.getUser === 'function' ? config.getUser : null
  setKeptQueryParams(config.keepQueryParams)

  // 초기화 전에 쌓인 이벤트를 큐로 옮긴다
  const buffered = preInit
  preInit = []
  buffered.forEach((event) => queue?.add(event))
  return true
}

let sampleRate = 1
let getUser: NonNullable<ErrorLoggerConfig['getUser']> | null = null

/**
 * 캡처 시점의 사용자 속성을 읽는다.
 * 식별자만 넘기는 흔한 경우를 위해 값 하나(`() => 10482`)도 객체와 같이 받는다.
 *
 * 앱 코드가 던지더라도 에러 수집 자체가 멈추면 안 되므로 삼킨다 —
 * 여기서 던지면 그 에러를 전역 핸들러가 다시 잡아 무한 루프가 된다.
 */
function currentUser(): ErrorLogUser | undefined {
  if (getUser === null) return undefined
  try {
    const raw = getUser()
    if (raw === null || raw === undefined) return undefined
    if (typeof raw === 'object') return raw
    return { id: raw }
  } catch {
    return undefined
  }
}

/** 에러 1건을 큐에 넣는다. 초기화 전 이벤트는 버퍼에 담았다가 초기화 시점에 합류시킨다 */
export function captureError(input: CaptureInput): void {
  if (queue === null) {
    // 초기화 전에는 설정을 모르므로 식별자 없이 담는다 (로그인 이전 시점이기도 하다)
    if (preInit.length < PRE_INIT_LIMIT) preInit.push(buildEvent(input))
    return
  }
  // 전송 중 발생한 에러를 다시 담으면 무한 루프가 된다
  if (queue.isSending) return
  if (sampleRate < 1 && Math.random() >= sampleRate) return
  queue.add(buildEvent(input, currentUser()))
}

/** 남은 이벤트를 즉시 보낸다 (페이지 이탈 시점용) */
export function flushErrorLogs(): void {
  queue?.flushSync()
}

/** 대기 중인 이벤트 수 — 테스트·디버깅용 */
export function pendingErrorLogCount(): number {
  return queue?.size ?? 0
}

/** 테스트에서 모듈 상태를 초기화한다 */
export function resetErrorLogger(): void {
  queue = null
  preInit = []
  sampleRate = 1
  getUser = null
  setKeptQueryParams(undefined)
}
