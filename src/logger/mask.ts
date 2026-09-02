import { FIELD_LIMITS } from './limits'
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
  [/\b\d{6}[-\s]?[1-4]\d{6}\b/g, '[rrn]'],
  [/\b(?:\d{4}[-\s]?){3}\d{4}\b/g, '[card]'],
  [/\b01[016-9][-\s]?\d{3,4}[-\s]?\d{4}\b/g, '[phone]'],
]

/** 값에 섞여 들어온 개인정보를 치환한다 */
export function scrub(value: string): string {
  return PII_PATTERNS.reduce(
    (acc, [pattern, replacement]) => acc.replace(pattern, replacement),
    value,
  )
}

/**
 * URL에서 쿼리스트링·해시를 제거한다.
 * 프론트 에러 컨텍스트에 개인정보가 딸려 들어오는 가장 흔한 경로가 쿼리스트링이다.
 */
export function stripQuery(url: string): string {
  const cut = url.search(/[?#]/)
  return cut === -1 ? url : url.slice(0, cut)
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
    context.route = scrub(stripQuery(record.route)).slice(0, FIELD_LIMITS.url)
  }
  if (typeof record.component === 'string') {
    context.component = scrub(record.component).slice(0, 128)
  }
  return context.route === undefined && context.component === undefined
    ? undefined
    : context
}
