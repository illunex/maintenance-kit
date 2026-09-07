import { warn } from './warn'

/**
 * 값이 그대로 새면 안 되는 쿼리 파라미터 키.
 *
 * keepQueryParams가 url·route를 다루는 반면 이쪽은 문자열 어디에 있든 잡는다.
 * 실제로 새는 자리는 message와 stack이다 — "Failed to fetch /auth/verify?certData=..."
 * 처럼 URL이 통째로 에러 메시지에 들어오면 쿼리 제거는 손대지 못한다.
 *
 * 키 이름 denylist는 원래 놓치는 게 많아 쓰지 않지만, 쿼리스트링은 `key=value`
 * 형태가 고정이라 이 방식이 정확하게 동작하는 드문 자리다.
 */
const DEFAULT_KEYS: readonly string[] = [
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'idToken',
  'id_token',
  'code',
  'state',
  'secret',
  'password',
  'passwd',
  'pwd',
  'apiKey',
  'api_key',
  'sig',
  'signature',
  'session',
  'sessionId',
  'auth',
]

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 값 끝을 & # 공백 따옴표 꺾쇠로 잡는다.
 * 에러 메시지 안의 URL은 뒤에 문장이 이어붙는 경우가 많아, 구분자를 넓게 잡아야
 * 토큰만 정확히 끊어낸다.
 */
function buildPattern(keys: readonly string[]): RegExp {
  const alternation = keys.map(escapeRegExp).join('|')
  return new RegExp(`([?&](?:${alternation})=)[^&#\\s"'<>]+`, 'gi')
}

let keys: readonly string[] = DEFAULT_KEYS
let pattern: RegExp = buildPattern(DEFAULT_KEYS)

/** 앱이 준 키를 기본 목록에 더한다 (덮어쓰지 않는다 — 기본 보호를 끄게 두면 안 된다) */
export function setRedactQueryParams(raw: unknown): void {
  if (raw === undefined) {
    keys = DEFAULT_KEYS
    pattern = buildPattern(keys)
    return
  }
  if (!Array.isArray(raw)) {
    warn('redactQueryParams가 배열이 아니어서 기본 목록만 씁니다.')
    keys = DEFAULT_KEYS
    pattern = buildPattern(keys)
    return
  }
  const extra = raw.filter(
    (key): key is string => typeof key === 'string' && key !== '',
  )
  if (extra.length !== raw.length) {
    warn('redactQueryParams의 문자열이 아닌 값은 무시합니다.')
  }
  keys = [...DEFAULT_KEYS, ...extra]
  pattern = buildPattern(keys)
}

export function redactQueryValues(value: string): string {
  // 전역 정규식은 lastIndex가 남으므로 매번 초기화한다
  pattern.lastIndex = 0
  return value.replace(pattern, '$1[redacted]')
}

export { DEFAULT_KEYS as DEFAULT_REDACT_QUERY_KEYS }
