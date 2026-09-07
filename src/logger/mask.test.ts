import { describe, expect, it } from 'vitest'
import {
  sanitizeContext,
  sanitizePlan,
  sanitizeUserId,
  scrub,
  stripQuery,
  truncate,
} from './mask'

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

describe('sanitizeUserId', () => {
  it('회원 번호는 숫자로 받아도 문자열로 싣는다', () => {
    expect(sanitizeUserId(10482)).toBe('10482')
    expect(sanitizeUserId('10482')).toBe('10482')
  })

  it('UUID·대체 식별자도 통과시킨다', () => {
    expect(sanitizeUserId('9f2c-4d1e-a77b')).toBe('9f2c-4d1e-a77b')
    expect(sanitizeUserId('user_123')).toBe('user_123')
  })

  // 16자리 회원 번호가 scrub의 카드번호 패턴에 걸려 [card]로 바뀌면 식별자가 망가진다
  it('긴 숫자 식별자를 카드번호로 오인해 마스킹하지 않는다', () => {
    expect(sanitizeUserId('1234567812345678')).toBe('1234567812345678')
  })

  it('그 자체가 개인정보인 값은 싣지 않는다', () => {
    expect(sanitizeUserId('hong@example.com')).toBeUndefined()
    expect(sanitizeUserId('010-1234-5678')).toBeUndefined()
  })

  it('식별자로 보기 어려운 값은 싣지 않는다', () => {
    expect(sanitizeUserId('a'.repeat(65))).toBeUndefined()
    expect(sanitizeUserId({ id: 1 })).toBeUndefined()
    expect(sanitizeUserId(Number.NaN)).toBeUndefined()
  })

  it('식별자가 없는 상태는 경고 없이 넘어간다', () => {
    expect(sanitizeUserId(undefined)).toBeUndefined()
    expect(sanitizeUserId(null)).toBeUndefined()
    expect(sanitizeUserId('')).toBeUndefined()
  })
})

describe('sanitizePlan', () => {
  it('한글·공백이 섞인 등급명을 그대로 통과시킨다', () => {
    expect(sanitizePlan('프리미엄 연간')).toBe('프리미엄 연간')
  })

  it('등급명에 개인정보가 섞여 들어오면 마스킹한다', () => {
    expect(sanitizePlan('hong@example.com 전용')).toBe('[email] 전용')
  })

  it('문자열이 아니면 싣지 않는다', () => {
    expect(sanitizePlan(3)).toBeUndefined()
    expect(sanitizePlan(undefined)).toBeUndefined()
    expect(sanitizePlan('')).toBeUndefined()
  })
})

describe('stripQuery 허용 키', () => {
  it('기본은 쿼리를 전부 버린다', () => {
    expect(stripQuery('https://a.com/insight?tab=momentum&q=x')).toBe(
      'https://a.com/insight',
    )
  })

  // /insight?tab=momentum 처럼 탭이 쿼리에 있는 화면을 구분하기 위한 것이다
  it('허용한 키만 남긴다', () => {
    expect(
      stripQuery('https://a.com/insight?tab=momentum&token=secret', ['tab']),
    ).toBe('https://a.com/insight?tab=momentum')
  })

  it('허용 키가 없으면 경로만 남는다', () => {
    expect(stripQuery('https://a.com/insight?token=secret', ['tab'])).toBe(
      'https://a.com/insight',
    )
  })

  it('해시는 남기지 않는다', () => {
    expect(stripQuery('https://a.com/insight?tab=a#section', ['tab'])).toBe(
      'https://a.com/insight?tab=a',
    )
    // '#'이 '?'보다 앞이면 쿼리가 아니다
    expect(stripQuery('https://a.com/p#x?tab=a', ['tab'])).toBe('https://a.com/p')
  })

  // 같은 화면이 매번 같은 문자열이 되어야 로그를 묶어 볼 수 있다
  it('남기는 순서는 허용 키 순서를 따른다', () => {
    expect(stripQuery('https://a.com/p?b=2&a=1', ['a', 'b'])).toBe(
      'https://a.com/p?a=1&b=2',
    )
  })
})

describe('scrub 인코딩된 이메일', () => {
  // 프로필 이미지 URL에 이메일이 %40으로 인코딩돼 들어온다
  it('URL 인코딩된 이메일도 치환한다', () => {
    expect(
      scrub('https://s3/prod/Member/breadsy94%40illunex.com/a.jpeg'),
    ).toBe('https://s3/prod/Member/[email]/a.jpeg')
  })

  it('평문 이메일은 그대로 치환한다', () => {
    expect(scrub('hong@example.com 실패')).toBe('[email] 실패')
  })
})
