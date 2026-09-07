import { afterEach, describe, expect, it, vi } from 'vitest'
import { scrub } from './mask'
import { setRedactQueryParams } from './redact-query'

afterEach(() => {
  setRedactQueryParams(undefined)
  vi.restoreAllMocks()
})

describe('쿼리 파라미터 값 치환', () => {
  /**
   * 실제로 새는 자리는 message다. 쿼리 제거는 url·route만 다루므로
   * URL이 통째로 에러 메시지에 들어오면 손대지 못한다.
   */
  it('에러 메시지 안의 토큰 값을 지운다', () => {
    expect(scrub('Failed to fetch /auth/verify?code=abc123&state=xyz')).toBe(
      'Failed to fetch /auth/verify?code=[redacted]&state=[redacted]',
    )
  })

  it('키 이름은 대소문자를 가리지 않는다', () => {
    expect(scrub('/cb?AccessToken=abc')).toBe('/cb?AccessToken=[redacted]')
  })

  // certData처럼 회사 고유 이름은 기본 목록에 없어 앱이 넣어야 한다
  it('앱이 추가한 키도 지운다', () => {
    expect(scrub('/auth?certData=SOMEOPAQUEVALUE')).toBe(
      '/auth?certData=SOMEOPAQUEVALUE',
    )
    setRedactQueryParams(['certData'])
    expect(scrub('/auth?certData=SOMEOPAQUEVALUE')).toBe(
      '/auth?certData=[redacted]',
    )
  })

  // 기본 보호를 앱이 끌 수 있으면 안 된다
  it('앱이 넘긴 목록은 기본 목록을 덮어쓰지 않는다', () => {
    setRedactQueryParams(['certData'])
    expect(scrub('/cb?code=abc')).toBe('/cb?code=[redacted]')
  })

  it('값 뒤에 문장이 이어져도 토큰만 끊어낸다', () => {
    expect(scrub('GET /cb?token=abc123 실패했습니다')).toBe(
      'GET /cb?token=[redacted] 실패했습니다',
    )
  })

  // key= 앞부분만 같은 다른 파라미터를 건드리면 안 된다
  it('이름이 겹치는 다른 키는 건드리지 않는다', () => {
    expect(scrub('/search?keyword=삼성전자')).toBe('/search?keyword=삼성전자')
    expect(scrub('/list?stateCd=MST0002')).toBe('/list?stateCd=MST0002')
  })

  it('배열이 아니면 경고하고 기본 목록만 쓴다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    setRedactQueryParams('certData')
    expect(warn).toHaveBeenCalled()
    expect(scrub('/cb?code=abc')).toBe('/cb?code=[redacted]')
  })
})
