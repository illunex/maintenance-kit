import { createFingerprint } from './fingerprint'
import { FIELD_LIMITS } from './limits'
import { sanitizeContext, scrub, stripQuery, truncate } from './mask'
import { createEventId } from './session'
import type { CaptureInput, ErrorLogEvent } from './types'

interface NormalizedError {
  name: string
  message: string
  stack?: string
}

/**
 * 형태만 남길 때 값까지 함께 싣는 키 (allowlist).
 * Error.message·name과 같은 급이고, HTTP 상태 코드는 원인 파악에 꼭 필요하다.
 */
const SHAPE_VALUE_KEYS = ['name', 'message', 'code', 'status'] as const

/** 키 목록이 길어져도 메시지 상한을 잡아먹지 않게 앞쪽만 남긴다 */
const SHAPE_KEY_LIMIT = 20

function constructorName(error: object): string {
  const name = error.constructor?.name
  return typeof name === 'string' && name !== '' ? name : 'Object'
}

/**
 * Error가 아닌 객체는 값이 아니라 형태만 남긴다.
 * 통째로 직렬화하면 { password: '...' }나 API 응답 body처럼 키에 의미가 있는
 * 비밀값이 값 패턴 스크러버(scrub)를 그대로 통과한다. 값 패턴 denylist로는
 * 이런 키를 다 못 잡으므로, context와 같은 allowlist 방식으로 맞춘다.
 * 값이 더 필요하면 앱이 context로 명시해 올리는 쪽이 안전하다.
 */
function describeShape(error: object): string {
  if (Array.isArray(error)) return `Array(${error.length}) 값이 throw됨`

  const record = error as Record<string, unknown>
  const values: string[] = []
  SHAPE_VALUE_KEYS.forEach((key) => {
    const value = record[key]
    if (typeof value === 'string' && value !== '') values.push(`${key}=${value}`)
    else if (typeof value === 'number' || typeof value === 'boolean') {
      values.push(`${key}=${String(value)}`)
    }
  })

  const keys = Object.keys(record)
  const shown = keys.slice(0, SHAPE_KEY_LIMIT)
  const rest = keys.length - shown.length
  const keyList =
    shown.length === 0
      ? '없음'
      : `${shown.join(', ')}${rest > 0 ? ` 외 ${rest}개` : ''}`

  const head = `${constructorName(error)} 객체가 throw됨`
  const detail = values.length === 0 ? '' : `: ${values.join(', ')}`
  return `${head}${detail} (keys: ${keyList})`
}

/** throw된 값은 Error가 아닐 수도 있다 (문자열·객체·null 전부 가능) */
function normalizeError(error: unknown): NormalizedError {
  if (error instanceof Error) {
    return {
      name: error.name || 'Error',
      message: error.message,
      stack: error.stack,
    }
  }
  if (typeof error === 'string') {
    return { name: 'Error', message: error }
  }
  // 함수는 String()이 본문 전체를 뱉어 소스가 그대로 실린다
  if (typeof error === 'function') {
    return { name: 'Error', message: `function ${error.name || '(anonymous)'} 값이 throw됨` }
  }
  if (error === null || typeof error !== 'object') {
    return { name: 'Error', message: String(error) }
  }
  try {
    return { name: 'Error', message: describeShape(error) }
  } catch {
    // getter가 던지거나 프록시가 막는 경우
    return { name: 'Error', message: '형태를 읽을 수 없는 값이 throw됨' }
  }
}

/**
 * 발생 페이지.
 * 쿼리스트링을 자른 뒤에도 /users/hong@example.com 처럼 path에 개인정보가 남으므로
 * context.route와 같은 처리(scrub)를 거친다.
 */
function currentUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined
  return scrub(stripQuery(window.location.href)).slice(0, FIELD_LIMITS.url)
}

function currentUserAgent(): string | undefined {
  if (typeof navigator === 'undefined') return undefined
  return navigator.userAgent.slice(0, FIELD_LIMITS.userAgent)
}

/**
 * 잡힌 에러를 전송 가능한 이벤트로 만든다.
 * 마스킹과 길이 상한을 여기서 한 번에 적용해, 큐에는 이미 안전한 값만 들어간다.
 */
export function buildEvent(input: CaptureInput): ErrorLogEvent {
  const { name, message, stack } = normalizeError(input.error)

  const scrubbedMessage = truncate(scrub(message), FIELD_LIMITS.message)
  const scrubbedStack =
    stack === undefined
      ? undefined
      : truncate(scrub(stack), FIELD_LIMITS.stack)

  return {
    id: createEventId(),
    timestamp: new Date().toISOString(),
    level: input.level ?? 'error',
    type: input.type ?? 'error',
    name: scrub(name).slice(0, 128),
    message: scrubbedMessage.value,
    stack: scrubbedStack?.value,
    url: currentUrl(),
    userAgent: currentUserAgent(),
    fingerprint: createFingerprint(name, message, stack),
    count: 1,
    truncated:
      scrubbedMessage.truncated || scrubbedStack?.truncated === true
        ? true
        : undefined,
    context: sanitizeContext(input.context),
  }
}

/**
 * 이벤트 1건이 상한을 넘으면 stack부터 줄인다.
 * JSON 이스케이프 때문에 문자 수와 직렬화 길이가 어긋나므로 맞을 때까지 반복한다.
 */
export function fitEvent(event: ErrorLogEvent): ErrorLogEvent {
  if (JSON.stringify(event).length <= FIELD_LIMITS.event) return event
  if (event.stack === undefined) return event

  const marked = { ...event, truncated: true }
  let stack = marked.stack ?? ''
  let size = JSON.stringify({ ...marked, stack }).length
  while (stack.length > 0 && size > FIELD_LIMITS.event) {
    const excess = Math.max(size - FIELD_LIMITS.event, 1)
    stack = stack.slice(0, Math.max(0, stack.length - excess))
    size = JSON.stringify({ ...marked, stack }).length
  }
  return { ...marked, stack }
}
