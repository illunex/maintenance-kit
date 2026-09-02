import { describe, expect, it } from 'vitest'
import { sanitizeContext, scrub, stripQuery, truncate } from './mask'

describe('scrub', () => {
  it('이메일을 치환한다', () => {
    expect(scrub('문의: hong@example.com 로 연락')).toBe('문의: [email] 로 연락')
  })

  it('휴대폰 번호를 치환한다', () => {
    expect(scrub('010-1234-5678')).toBe('[phone]')
    expect(scrub('01012345678')).toBe('[phone]')
  })

  it('주민등록번호를 치환한다', () => {
    expect(scrub('900101-1234567')).toBe('[rrn]')
  })

  it('카드번호를 치환한다', () => {
    expect(scrub('4111 1111 1111 1111')).toBe('[card]')
  })

  it('JWT와 Bearer 토큰을 치환한다', () => {
    expect(scrub('Bearer abc.def-ghi')).toBe('Bearer [redacted]')
    expect(scrub('eyJhbGci.eyJzdWIi.SflKxwRJ')).toBe('[jwt]')
  })

  it('개인정보가 없으면 그대로 둔다', () => {
    const message = "Cannot read properties of undefined (reading 'id')"
    expect(scrub(message)).toBe(message)
  })
})

describe('stripQuery', () => {
  it('쿼리스트링과 해시를 제거한다', () => {
    expect(stripQuery('https://a.com/orders?token=abc')).toBe('https://a.com/orders')
    expect(stripQuery('https://a.com/orders#section')).toBe('https://a.com/orders')
  })

  it('쿼리가 없으면 그대로 둔다', () => {
    expect(stripQuery('https://a.com/orders')).toBe('https://a.com/orders')
  })
})

describe('truncate', () => {
  it('상한을 넘으면 자르고 표시한다', () => {
    expect(truncate('abcdef', 3)).toEqual({ value: 'abc', truncated: true })
  })

  it('상한 이내면 그대로 둔다', () => {
    expect(truncate('abc', 3)).toEqual({ value: 'abc', truncated: false })
  })
})

describe('sanitizeContext', () => {
  it('허용된 키만 통과시킨다', () => {
    const result = sanitizeContext({
      route: '/orders',
      component: 'OrderDetail',
      userEmail: 'hong@example.com',
    })
    expect(result).toEqual({ route: '/orders', component: 'OrderDetail' })
  })

  it('route의 쿼리스트링을 제거한다', () => {
    expect(sanitizeContext({ route: '/orders?token=abc' })).toEqual({
      route: '/orders',
    })
  })

  it('허용 키가 하나도 없으면 undefined를 돌려준다', () => {
    expect(sanitizeContext({ userId: 1 })).toBeUndefined()
    expect(sanitizeContext(null)).toBeUndefined()
  })
})
