import { readBuildValues } from './build-values'
import { buildEvent } from './event'
import { resolveLimits } from './limits'
import { ErrorLogQueue } from './queue'
import { resolveSessionId } from './session'
import { beaconTransport, consoleTransport } from './transport'
import type { CaptureInput, ErrorLogEvent, ErrorLoggerConfig } from './types'

export type {
  CaptureInput,
  ErrorLogContext,
  ErrorLogEvent,
  ErrorLogLevel,
  ErrorLogPayload,
  ErrorLogType,
  ErrorLoggerConfig,
  ErrorLoggerLimits,
  Transport,
  TransportResult,
} from './types'
export { DEFAULT_LIMITS, FIELD_LIMITS, SCHEMA_VERSION } from './limits'
export { beaconTransport, consoleTransport } from './transport'
export { createFingerprint } from './fingerprint'
export { sanitizeContext, scrub, stripQuery, truncate } from './mask'
export { buildEvent } from './event'

const PREFIX = '@illunex-front/maintenance-kit:logger'

/**
 * 초기화 전에 잡힌 이벤트를 잠시 담아두는 버퍼.
 * ErrorLogBoundary의 componentDidCatch는 Provider의 useEffect보다 먼저 돌기 때문에,
 * 버리면 첫 렌더에서 터진 에러를 놓친다.
 */
const PRE_INIT_LIMIT = 20
let preInit: ErrorLogEvent[] = []

let queue: ErrorLogQueue | null = null

function warn(message: string): void {
  // 값이 비었을 때 조용히 비활성되면 발견이 늦는다 — 반드시 남긴다
  // eslint-disable-next-line no-console
  console.warn(`${PREFIX}: ${message}`)
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
      : beaconTransport(endpoint))

  queue = new ErrorLogQueue({
    service,
    env,
    release: config.release ?? build.release,
    sessionId: resolveSessionId(),
    transport,
    limits: resolveLimits(config.limits),
  })
  sampleRate = config.sampleRate ?? 1

  // 초기화 전에 쌓인 이벤트를 큐로 옮긴다
  const buffered = preInit
  preInit = []
  buffered.forEach((event) => queue?.add(event))
  return true
}

let sampleRate = 1

/** 에러 1건을 큐에 넣는다. 초기화 전 이벤트는 버퍼에 담았다가 초기화 시점에 합류시킨다 */
export function captureError(input: CaptureInput): void {
  if (queue === null) {
    if (preInit.length < PRE_INIT_LIMIT) preInit.push(buildEvent(input))
    return
  }
  // 전송 중 발생한 에러를 다시 담으면 무한 루프가 된다
  if (queue.isSending) return
  if (sampleRate < 1 && Math.random() >= sampleRate) return
  queue.add(buildEvent(input))
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
}
