/** 이벤트가 어떤 경로로 잡혔는지 (문서 5-3 확정 열거값) */
export type ErrorLogType =
  | 'error'
  | 'unhandledrejection'
  | 'chunkload'
  | 'resource'
  | 'boundary'

/** 심각도 — fatal은 화면이 뚫린 경우(ErrorBoundary 진입)에만 */
export type ErrorLogLevel = 'error' | 'fatal'

/**
 * 이벤트에 함께 담는 부가 정보.
 * 자유 객체로 두면 수집 스택에서 필드 매핑이 폭발하므로 키를 고정한다.
 */
export interface ErrorLogContext {
  route?: string
  component?: string
}

/** 수집 서버로 보내는 에러 이벤트 1건 */
export interface ErrorLogEvent {
  id: string
  timestamp: string
  level: ErrorLogLevel
  type: ErrorLogType
  name: string
  message: string
  stack?: string
  /** 쿼리스트링을 제거한 발생 페이지 */
  url?: string
  userAgent?: string
  /** 동일 에러를 묶는 키 */
  fingerprint: string
  /** 같은 fingerprint가 합산된 횟수 */
  count: number
  /** 길이 상한에 걸려 잘려나간 필드가 있으면 true */
  truncated?: boolean
  context?: ErrorLogContext
}

/** 배치 1회 전송 단위 — 공통 메타(봉투) + 이벤트 배열 */
export interface ErrorLogPayload {
  schemaVersion: number
  service: string
  env: string
  release?: string
  sessionId: string
  events: ErrorLogEvent[]
}

/** 전송 결과 — 재시도 여부 판정에 사용 */
export interface TransportResult {
  ok: boolean
  /** 5xx·429처럼 다시 보내도 되는 실패인지 (4xx는 false) */
  retryable: boolean
  /** 429 Retry-After가 있으면 그 값(ms) */
  retryAfterMs?: number
}

/**
 * 전송 경로 추상화.
 * 인프라 엔드포인트 스펙이 확정되지 않아도 코어를 완성할 수 있도록 분리했다.
 */
export interface Transport {
  send(payload: ErrorLogPayload, body: string): Promise<TransportResult>
}

/** 큐·재시도·상한 값 (기본값은 limits.ts) */
export interface ErrorLoggerLimits {
  batchSize: number
  flushIntervalMs: number
  maxRequestBytes: number
  maxEventsPerSession: number
  maxRequestsPerSession: number
  maxPerFingerprint: number
  maxRetries: number
  retryBackoffMs: readonly number[]
}

export interface ErrorLoggerConfig {
  /** 수집 엔드포인트. 생략 시 빌드 플러그인이 주입한 값 → 기본 엔드포인트 순으로 결정 */
  endpoint?: string
  /** 제품/리포 식별자. 생략 시 빌드 플러그인이 주입한 값 */
  service?: string
  /** 빌드 환경. 생략 시 빌드 플러그인이 주입한 값 */
  env?: string
  /** 배포본 식별자(commit sha). 소스맵 심볼화의 조인 키 */
  release?: string
  /** 전송 경로 교체 (테스트·개발용) */
  transport?: Transport
  /** 0~1. 기본 1(전량 전송) — 상한이 이미 강해서 초기부터 줄일 이유가 없다 */
  sampleRate?: number
  limits?: Partial<ErrorLoggerLimits>
  /** false면 수집을 완전히 끈다 */
  enabled?: boolean
}

/** 앱이 직접 이벤트를 올릴 때 쓰는 입력 형태 */
export interface CaptureInput {
  error: unknown
  type?: ErrorLogType
  level?: ErrorLogLevel
  context?: unknown
}
