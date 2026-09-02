import type { ErrorLoggerLimits } from './types'
import { warn } from './warn'

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
 * 요청 1건의 하드 상한.
 * sendBeacon 할당량과 fetch keepalive 본문 상한이 모두 64KB라
 * 이 위로 잡으면 브라우저가 전송 자체를 거부한다.
 */
export const MAX_REQUEST_BYTES = 64 * 1024

/**
 * 전송 상한 기본값.
 * 세션 1개가 만들 수 있는 최악값을 구조적으로 못 넘게 막는 것이 목적이다.
 */
export const DEFAULT_LIMITS: ErrorLoggerLimits = {
  batchSize: 20,
  flushIntervalMs: 5000,
  // 64KB 하드 상한에 봉투·재시도 여유를 남긴 값
  maxRequestBytes: 48 * 1024,
  maxEventsPerSession: 50,
  maxRequestsPerSession: 3,
  maxPerFingerprint: 5,
  // 에러 로그는 유실돼도 되는 데이터다. 5xx를 붙잡고 재시도하면
  // 이미 힘든 서버를 더 때리게 되므로 한 번만 더 시도하고 포기한다
  maxRetries: 1,
  retryBackoffMs: [2000],
}

/**
 * 허용 범위.
 * batchSize: 0처럼 얼핏 무해해 보이는 값이 들어오면 큐가 영원히 비워지지 않으므로
 * 병합 전에 범위를 강제한다.
 */
const RANGES = {
  batchSize: [1, 200],
  flushIntervalMs: [250, 60 * 1000],
  maxRequestBytes: [1024, MAX_REQUEST_BYTES],
  maxEventsPerSession: [1, 1000],
  maxRequestsPerSession: [1, 100],
  maxPerFingerprint: [1, 100],
  maxRetries: [0, 5],
} as const

type RangedKey = keyof typeof RANGES

function resolveNumber(key: RangedKey, raw: unknown): number {
  const fallback = DEFAULT_LIMITS[key]
  if (raw === undefined) return fallback
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    warn(`limits.${key} 값이 숫자가 아니어서 기본값(${fallback})을 씁니다.`)
    return fallback
  }
  const [min, max] = RANGES[key]
  const clamped = Math.min(Math.max(Math.round(raw), min), max)
  if (clamped !== raw) {
    warn(`limits.${key}=${raw}는 허용 범위(${min}~${max})를 벗어나 ${clamped}로 조정합니다.`)
  }
  return clamped
}

function resolveBackoff(raw: unknown): readonly number[] {
  if (raw === undefined) return DEFAULT_LIMITS.retryBackoffMs
  const values = Array.isArray(raw) ? (raw as unknown[]) : []
  const cleaned = values.filter(
    (ms): ms is number => typeof ms === 'number' && Number.isFinite(ms) && ms >= 0,
  )
  if (cleaned.length === 0) {
    warn('limits.retryBackoffMs에 쓸 수 있는 값이 없어 기본값을 씁니다.')
    return DEFAULT_LIMITS.retryBackoffMs
  }
  return cleaned
}

/** 외부에서 넘어온 값은 범위를 강제하고, 조정한 사실은 경고로 남긴다 */
export function resolveLimits(
  overrides: Partial<ErrorLoggerLimits> = {},
): ErrorLoggerLimits {
  return {
    batchSize: resolveNumber('batchSize', overrides.batchSize),
    flushIntervalMs: resolveNumber('flushIntervalMs', overrides.flushIntervalMs),
    maxRequestBytes: resolveNumber('maxRequestBytes', overrides.maxRequestBytes),
    maxEventsPerSession: resolveNumber(
      'maxEventsPerSession',
      overrides.maxEventsPerSession,
    ),
    maxRequestsPerSession: resolveNumber(
      'maxRequestsPerSession',
      overrides.maxRequestsPerSession,
    ),
    maxPerFingerprint: resolveNumber(
      'maxPerFingerprint',
      overrides.maxPerFingerprint,
    ),
    maxRetries: resolveNumber('maxRetries', overrides.maxRetries),
    retryBackoffMs: resolveBackoff(overrides.retryBackoffMs),
  }
}
