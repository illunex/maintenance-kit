import { describe, expect, it } from 'vitest'
import { formatMaintenancePeriod } from './format'

describe('formatMaintenancePeriod', () => {
  it('같은 연도면 종료 쪽 연도를 생략한다', () => {
    expect(
      formatMaintenancePeriod('2026-08-15 12:00:00', '2026-08-17 12:00:00'),
    ).toBe('26년 8월 15일 12:00 ~ 8월 17일 12:00')
  })

  it('연도가 다르면 양쪽 모두 연도를 표기한다', () => {
    expect(
      formatMaintenancePeriod('2026-12-31 23:00:00', '2027-01-01 06:00:00'),
    ).toBe('26년 12월 31일 23:00 ~ 27년 1월 1일 06:00')
  })

  it('하나라도 없으면 null을 반환한다', () => {
    expect(formatMaintenancePeriod('2026-08-15 12:00:00', undefined)).toBeNull()
    expect(formatMaintenancePeriod(undefined, undefined)).toBeNull()
  })

  it('형식이 다르면 원본을 그대로 이어 붙인다', () => {
    expect(formatMaintenancePeriod('8월 15일', '8월 17일')).toBe('8월 15일 ~ 8월 17일')
  })
})
