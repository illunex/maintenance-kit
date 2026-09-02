import type { ErrorLoggerLimits } from './types'

export const SCHEMA_VERSION = 1

/**
 * 필드별 길이 상한.
 * 수집 스택이 필드 크기를 잡을 수 있도록 클라이언트가 먼저 보장하는 값이다.
 */
export const FIELD_LIMITS = {
  stack: 8 * 1024,
  message: 1024,
  url: 512,
  userAgent: 512,
  /** 이벤트 1건 직렬화 상한 — 초과 시 stack을 추가로 줄인다 */
  event: 16 * 1024,
} as const

/**
 * 전송 상한 기본값.
 * 세션 1개가 만들 수 있는 최악값을 구조적으로 못 넘게 막는 것이 목적이다.
 */
export const DEFAULT_LIMITS: ErrorLoggerLimits = {
  batchSize: 20,
  flushIntervalMs: 5000,
  maxRequestBytes: 256 * 1024,
  maxEventsPerSession: 50,
  maxRequestsPerSession: 3,
  maxPerFingerprint: 5,
  // 에러 로그는 유실돼도 되는 데이터다. 5xx를 붙잡고 재시도하면
  // 이미 힘든 서버를 더 때리게 되므로 한 번만 더 시도하고 포기한다
  maxRetries: 1,
  retryBackoffMs: [2000],
}

export function resolveLimits(
  overrides?: Partial<ErrorLoggerLimits>,
): ErrorLoggerLimits {
  return { ...DEFAULT_LIMITS, ...overrides }
}
