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

/**
 * 앱이 getUser로 넘기는 사용자 속성.
 * 식별자만 필요하면 객체 대신 값 하나(`() => 10482`)를 돌려줘도 된다.
 */
export interface ErrorLogUser {
  /** 회원 식별자 — 이메일이 아니라 회원 번호처럼 그 자체로는 개인정보가 아닌 값 */
  id?: string | number | null
  /**
   * 요금제·라이선스 등급.
   * 특정 등급에서만 나는 에러(권한 분기·기능 제한)를 가르는 데 쓴다.
   */
  plan?: string | null
}

/**
 * 세션 단위로 고정인 클라이언트 정보.
 * 파싱값과 원문을 함께 두는 이유는 client.ts의 readClient 주석에 있다.
 */
export interface ErrorLogClient {
  /** UA 원문 — 규칙이 못 잡은 브라우저를 서버에서 다시 볼 때 쓴다 */
  userAgent?: string
  /** "Chrome 153" */
  browser?: string
  /** "Windows 10+", "iOS 17.5" */
  os?: string
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
  /** 에러 시점의 표시 영역 "1920x1080" — 모바일 폭에서만 나는 에러를 가른다 */
  viewport?: string
  /**
   * 앱이 넘긴 회원 식별자(getUser). 설정하지 않으면 없다.
   * 봉투가 아니라 이벤트에 두는 이유는 한 세션 안에서 로그인·로그아웃으로 바뀌기 때문이다.
   */
  user?: string
  /** 앱이 넘긴 요금제·라이선스 등급(getUser().plan) */
  plan?: string
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
  client?: ErrorLogClient
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
  /**
   * 페이지 이탈 시점 전송 (sendBeacon 등).
   * 응답을 볼 수 없으므로 "전송을 넘겼는지"만 돌려준다.
   * 없거나 false를 돌려주면 큐가 send()로 폴백한다.
   */
  sendSync?(payload: ErrorLogPayload, body: string): boolean
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
  /**
   * 수집 엔드포인트. 생략하면 빌드 플러그인이 주입한 값을 쓰고,
   * 그것도 없으면 개발용 console transport로 동작한다.
   * 공개 저장소이므로 이 패키지에 기본 주소를 두지 않는다 — 주소는 앱 빌드 설정에서 넘긴다.
   */
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
  /**
   * 에러가 난 사용자가 누구인지를 돌려준다. 로그인 전이면 undefined·null을 돌려주면 된다.
   * 식별자만 넘길 때는 값 하나(`() => 10482`)로 줄여 쓸 수 있다.
   *
   * 프로젝트마다 식별자를 두는 곳(스토어·쿠키·응답 필드)이 달라 킷이 직접 읽지 않고
   * 앱이 넘기게 뒀다. 값이 아니라 함수를 받는 이유는, 초기화는 앱 진입 시 1회인데
   * 로그인은 그 뒤에 일어나서 정적 값으로 받으면 로그인 이후 이벤트에 식별자가 비기 때문이다.
   *
   * `id`는 개인정보가 로그로 새지 않도록 `[A-Za-z0-9_-]` 64자 이내만 통과시킨다.
   * 이메일·전화번호처럼 그 자체로 개인정보인 값은 통과하지 못하고 경고로 남는다.
   */
  getUser?: () => ErrorLogUser | string | number | null | undefined
  /**
   * url·context.route에서 남길 쿼리 파라미터 키.
   *
   * 쿼리스트링은 개인정보가 딸려 들어오는 가장 흔한 경로라 기본은 전부 버린다.
   * 다만 `/insight?tab=momentum`처럼 탭·모드가 쿼리에 있는 화면은 통째로 버리면
   * 어느 화면에서 난 에러인지 알 수 없어, 앱이 키를 콕 집어 남길 수 있게 한다.
   *
   * 남긴 값도 개인정보 치환을 거치지만, 애초에 개인정보가 들어갈 수 있는 키는
   * 넣지 않는 편이 안전하다.
   */
  keepQueryParams?: string[]
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
