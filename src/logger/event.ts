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
  try {
    return { name: 'Error', message: JSON.stringify(error) ?? String(error) }
  } catch {
    // 순환 참조 등으로 직렬화가 안 되는 경우
    return { name: 'Error', message: String(error) }
  }
}

function currentUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined
  return stripQuery(window.location.href).slice(0, FIELD_LIMITS.url)
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
