interface ParsedDateTime {
  year: number
  month: number
  day: number
  hour: string
  minute: string
}

function parseDateTime(value: string): ParsedDateTime | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) return null
  const [, year = '', month = '', day = '', hour = '', minute = ''] = m
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour,
    minute,
  }
}

function formatKorean(dt: ParsedDateTime, withYear: boolean): string {
  const yearPart = withYear ? `${String(dt.year).slice(2)}년 ` : ''
  return `${yearPart}${dt.month}월 ${dt.day}일 ${dt.hour}:${dt.minute}`
}

/**
 * startTime/endTime("YYYY-MM-DD HH:mm:ss")을 점검 화면 표기용 문자열로 변환한다.
 * 예: "26년 8월 15일 12:00 ~ 8월 17일 12:00" (연도가 다르면 종료 쪽에도 연도 표기)
 * 둘 중 하나라도 없으면 null, 형식이 다르면 원본을 그대로 이어 붙여 반환한다.
 */
export function formatMaintenancePeriod(
  startTime?: string,
  endTime?: string,
): string | null {
  if (startTime === undefined || endTime === undefined) return null
  const start = parseDateTime(startTime)
  const end = parseDateTime(endTime)
  if (start === null || end === null) return `${startTime} ~ ${endTime}`
  return `${formatKorean(start, true)} ~ ${formatKorean(end, end.year !== start.year)}`
}
