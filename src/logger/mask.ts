import { keptQueryParams } from './keep-query'
import { redactQueryValues } from './redact-query'
import { FIELD_LIMITS } from './limits'
import { warn } from './warn'
import type { ErrorLogContext } from './types'

/**
 * 문자열에서 걸러낼 개인정보 패턴.
 * 키 이름 denylist는 놓치는 게 많아, 값 자체를 훑는 스크러버를 함께 쓴다.
 */
const PII_PATTERNS: readonly (readonly [RegExp, string])[] = [
  // JWT·Bearer를 먼저 지워야 뒤의 숫자 패턴이 토큰 일부를 건드리지 않는다
  [/Bearer\s+[\w.~+/=-]+/gi, 'Bearer [redacted]'],
  [/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[jwt]'],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]'],
  // 프로필 이미지 URL처럼 경로에 이메일이 인코딩돼 들어오면 위 패턴을 그냥 통과한다
  [/[\w.+-]+%40[\w-]+\.[\w.-]+/gi, '[email]'],
  [/\b\d{6}[-\s]?[1-4]\d{6}\b/g, '[rrn]'],
  [/\b(?:\d{4}[-\s]?){3}\d{4}\b/g, '[card]'],
  [/\b01[016-9][-\s]?\d{3,4}[-\s]?\d{4}\b/g, '[phone]'],
]

/**
 * 값에 섞여 들어온 개인정보를 치환한다.
 *
 * 쿼리 파라미터 치환을 먼저 돌린다. 자체 토큰은 값 패턴으로는 못 잡고
 * key=value 형태로만 식별되는데, 뒤의 패턴들이 먼저 값을 건드리면 그 형태가 깨진다.
 */
export function scrub(value: string): string {
  return PII_PATTERNS.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    redactQueryValues(value),
  )
}

/**
 * URL에서 쿼리스트링·해시를 제거한다.
 * 프론트 에러 컨텍스트에 개인정보가 딸려 들어오는 가장 흔한 경로가 쿼리스트링이다.
 *
 * keep에 준 키만 남긴다. 탭·모드처럼 화면을 가르는 값이 쿼리에 있는 경우
 * 통째로 버리면 어느 화면에서 난 에러인지 알 수 없어서다.
 * 남긴 값도 뒤이어 scrub을 거치므로, 그 안에 개인정보가 섞여도 치환된다.
 */
export function stripQuery(url: string, keep: readonly string[] = []): string {
  const cut = url.search(/[?#]/)
  if (cut === -1) return url

  const base = url.slice(0, cut)
  if (keep.length === 0) return base

  const queryStart = url.indexOf('?')
  // '#'이 '?'보다 앞이면 쿼리가 아니라 해시 안의 문자다
  if (queryStart === -1 || queryStart !== cut) return base

  const hashCut = url.indexOf('#', queryStart)
  const query = url.slice(queryStart + 1, hashCut === -1 ? url.length : hashCut)

  let source: URLSearchParams
  try {
    source = new URLSearchParams(query)
  } catch {
    return base
  }

  // keep에 준 순서를 따른다 — 같은 화면이 매번 같은 문자열이 되어야 비교가 된다
  const picked = new URLSearchParams()
  keep.forEach((key) => {
    source.getAll(key).forEach((value) => picked.append(key, value))
  })

  const rebuilt = picked.toString()
  return rebuilt === '' ? base : `${base}?${rebuilt}`
}

export interface TruncateResult {
  value: string
  truncated: boolean
}

/** 상한을 넘으면 뒤에서 자른다 */
export function truncate(value: string, max: number): TruncateResult {
  if (value.length <= max) return { value, truncated: false }
  return { value: value.slice(0, max), truncated: true }
}

/** context는 정해진 키만 통과시킨다 (allowlist) */
export function sanitizeContext(raw: unknown): ErrorLogContext | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  const context: ErrorLogContext = {}
  if (typeof record.route === 'string') {
    context.route = scrub(
      stripQuery(record.route, keptQueryParams()),
    ).slice(0, FIELD_LIMITS.url)
  }
  if (typeof record.component === 'string') {
    context.component = scrub(record.component).slice(0, 128)
  }
  return context.route === undefined && context.component === undefined
    ? undefined
    : context
}

/**
 * 회원 식별자로 통과시킬 형태.
 * 숫자 member index·UUID·"user_123" 같은 대체 식별자는 통과하고,
 * 이메일(@·.)이나 하이픈 없는 전화번호처럼 그 자체가 개인정보인 값은 걸린다.
 *
 * scrub을 태우지 않고 allowlist로 막는 이유는 두 가지다.
 * 하나는 scrub의 카드번호 패턴이 16자리 숫자 ID를 [card]로 바꿔버려 식별자가 망가지고,
 * 다른 하나는 걸러진 사실을 앱이 알아야 다른 값을 넣을 수 있기 때문이다(조용히 마스킹하면 모른다).
 */
const USER_ID_PATTERN = /^[A-Za-z0-9_-]+$/

/**
 * 형태는 식별자를 닮았지만 실제로는 개인정보인 값.
 * `-`를 허용해야 UUID를 받을 수 있는데, 그 틈으로 010-1234-5678이 함께 들어온다.
 * PII_PATTERNS를 그대로 쓰지 않는 이유는 카드번호 패턴이 16자리 회원 번호를 잡아버리기 때문이다.
 */
const USER_ID_DENY: readonly RegExp[] = [
  /\b01[016-9][-\s]?\d{3,4}[-\s]?\d{4}\b/,
  /\b\d{6}-[1-4]\d{6}\b/,
]

/**
 * getUser()가 돌려준 값을 이벤트에 실을 수 있는 형태로 만든다.
 * 통과하지 못한 값은 싣지 않고 경고만 남긴다 — 로그가 비는 편이 개인정보가 새는 것보다 낫다.
 */
export function sanitizeUserId(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined

  if (typeof raw !== 'string' && typeof raw !== 'number') {
    warn(`getUser()가 ${typeof raw}를 돌려줘 회원 식별자를 싣지 않습니다.`)
    return undefined
  }
  if (typeof raw === 'number' && !Number.isFinite(raw)) {
    warn('getUser()가 유한한 수가 아닌 값을 돌려줘 회원 식별자를 싣지 않습니다.')
    return undefined
  }

  const value = String(raw)
  if (value.length > FIELD_LIMITS.user) {
    warn(
      `getUser() 반환값이 ${FIELD_LIMITS.user}자를 넘어 회원 식별자를 싣지 않습니다.`,
    )
    return undefined
  }
  if (!USER_ID_PATTERN.test(value)) {
    // 값 자체를 경고에 담으면 콘솔로 개인정보가 새므로 형태만 알린다
    warn(
      'getUser() 반환값에 영숫자·_·- 외의 문자가 있어 회원 식별자를 싣지 않습니다. 이메일 대신 회원 번호를 넘기세요.',
    )
    return undefined
  }
  if (USER_ID_DENY.some((pattern) => pattern.test(value))) {
    warn(
      'getUser() 반환값이 전화번호·주민등록번호 형태여서 회원 식별자를 싣지 않습니다.',
    )
    return undefined
  }
  return value
}

/**
 * 요금제·라이선스 등급.
 * 개인정보가 아니라 분류값이라 id처럼 형태를 강제하지 않고, 값 스크러버와 길이 상한만 건다
 * (등급명에 한글·공백이 들어가는 게 정상이다).
 */
export function sanitizePlan(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || raw === '') return undefined
  return scrub(raw).slice(0, FIELD_LIMITS.plan)
}
