import { FIELD_LIMITS } from './limits'
import type { ErrorLogClient } from './types'

/**
 * 브라우저 판별 규칙 — 순서가 곧 우선순위다.
 * Edge·Opera·삼성인터넷은 UA에 Chrome을 함께 싣고 Chrome은 Safari를 싣기 때문에,
 * 파생 브라우저를 먼저 걸러내지 않으면 전부 Chrome·Safari로 뭉개진다.
 */
const BROWSER_RULES: readonly (readonly [string, RegExp])[] = [
  ['Edge', /Edg(?:[AiOS]{1,3})?\/(\d+)/],
  ['Samsung Internet', /SamsungBrowser\/(\d+)/],
  ['Opera', /OPR\/(\d+)/],
  ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
  ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
  // Safari만 버전을 Version/에 싣는다
  ['Safari', /Version\/(\d+)[\d.]*\s+(?:Mobile\/\S+\s+)?Safari/],
]

/**
 * OS 판별 규칙.
 * 값은 UA가 실제로 보장하는 범위까지만 적는다 —
 * Windows 11은 UA에서 10과 구분되지 않고(둘 다 NT 10.0),
 * macOS는 Safari가 10_15_7로 고정해 보고하므로 버전을 믿을 수 없다.
 */
const OS_RULES: readonly (readonly [RegExp, (match: RegExpMatchArray) => string])[] = [
  [/Windows NT 10\.0/, () => 'Windows 10+'],
  [/Windows NT ([\d.]+)/, (m) => `Windows NT ${m[1] ?? ''}`.trim()],
  [/iPhone OS (\d+)[._](\d+)/, (m) => `iOS ${m[1]}.${m[2]}`],
  [/iPad;.*OS (\d+)[._](\d+)/, (m) => `iPadOS ${m[1]}.${m[2]}`],
  [/Android (\d+)/, (m) => `Android ${m[1]}`],
  [/Mac OS X/, () => 'macOS'],
  [/CrOS/, () => 'ChromeOS'],
  [/Linux/, () => 'Linux'],
]

/** "Chrome 153" — 메이저 버전까지만 남긴다. 마이너까지는 분류에 쓸 일이 없다 */
export function parseBrowser(userAgent: string): string | undefined {
  for (const [name, pattern] of BROWSER_RULES) {
    const match = userAgent.match(pattern)
    if (match !== null) return `${name} ${match[1] ?? ''}`.trim()
  }
  return undefined
}

export function parseOs(userAgent: string): string | undefined {
  for (const [pattern, format] of OS_RULES) {
    const match = userAgent.match(pattern)
    if (match !== null) return format(match)
  }
  return undefined
}

/**
 * 세션 내내 변하지 않는 클라이언트 정보.
 * 이벤트마다 반복해 실으면 요청 예산만 먹으므로 봉투에 한 번만 담는다.
 * 파싱 결과와 함께 원문을 남겨, 규칙이 못 잡은 UA도 서버에서 다시 볼 수 있게 한다.
 */
export function readClient(): ErrorLogClient | undefined {
  if (typeof navigator === 'undefined') return undefined
  const userAgent = navigator.userAgent
  if (typeof userAgent !== 'string' || userAgent === '') return undefined
  return {
    userAgent: userAgent.slice(0, FIELD_LIMITS.userAgent),
    browser: parseBrowser(userAgent),
    os: parseOs(userAgent),
  }
}

/**
 * 에러 발생 시점의 표시 영역.
 * 같은 에러가 모바일 폭에서만 터지는지 가르는 값이라 세션이 아니라 이벤트에 붙인다
 * (회전·리사이즈로 세션 중에도 바뀐다).
 */
export function readViewport(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const { innerWidth, innerHeight } = window
  if (typeof innerWidth !== 'number' || typeof innerHeight !== 'number') {
    return undefined
  }
  if (innerWidth <= 0 || innerHeight <= 0) return undefined
  return `${Math.round(innerWidth)}x${Math.round(innerHeight)}`
}
