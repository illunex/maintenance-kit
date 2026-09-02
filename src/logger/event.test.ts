import { describe, expect, it } from 'vitest'
import { buildEvent, fitEvent } from './event'
import { FIELD_LIMITS } from './limits'

describe('buildEvent', () => {
  it('Error에서 name·message·stack을 뽑는다', () => {
    const event = buildEvent({ error: new TypeError('boom') })
    expect(event.name).toBe('TypeError')
    expect(event.message).toBe('boom')
    expect(event.fingerprint).toMatch(/^[0-9a-f]{8}$/)
    expect(event.count).toBe(1)
  })

  it('Error가 아닌 값도 처리한다', () => {
    expect(buildEvent({ error: '문자열 에러' }).message).toBe('문자열 에러')
    expect(buildEvent({ error: null }).message).toBe('null')
  })

  it('객체가 throw되면 값 대신 형태만 남긴다', () => {
    // 통째로 직렬화하면 키에 의미가 있는 비밀값이 값 패턴 스크러버를 그대로 통과한다
    const event = buildEvent({
      error: { password: 'hunter2', accessToken: 'plain-secret' },
    })
    expect(event.message).not.toContain('hunter2')
    expect(event.message).not.toContain('plain-secret')
    expect(event.message).toContain('keys: password, accessToken')
  })

  it('객체 중 에러 형태의 키만 값까지 남긴다', () => {
    const event = buildEvent({
      error: { message: '주문 조회 실패', status: 500, body: { ssn: '900101-1234567' } },
    })
    expect(event.message).toContain('message=주문 조회 실패')
    expect(event.message).toContain('status=500')
    expect(event.message).not.toContain('900101')
  })

  it('함수가 throw되면 본문을 싣지 않는다', () => {
    const secret = function withSecret() {
      return 'hunter2'
    }
    expect(buildEvent({ error: secret }).message).not.toContain('hunter2')
  })

  it('getter가 던지는 객체도 이벤트를 만든다', () => {
    const hostile = {
      get message(): string {
        throw new Error('읽을 수 없음')
      },
    }
    expect(buildEvent({ error: hostile }).message).toBe(
      '형태를 읽을 수 없는 값이 throw됨',
    )
  })

  it('메시지의 개인정보를 마스킹한다', () => {
    const event = buildEvent({ error: new Error('hong@example.com 실패') })
    expect(event.message).toBe('[email] 실패')
  })

  it('message 상한을 넘으면 잘라내고 truncated를 표시한다', () => {
    const event = buildEvent({ error: new Error('a'.repeat(FIELD_LIMITS.message + 10)) })
    expect(event.message).toHaveLength(FIELD_LIMITS.message)
    expect(event.truncated).toBe(true)
  })

  it('같은 위치에서 난 에러는 숫자만 달라도 같은 지문으로 묶인다', () => {
    // 같은 throw 지점이어야 스택 프레임이 같으므로 헬퍼로 생성한다
    const make = (message: string) => buildEvent({ error: new Error(message) })
    expect(make('id 123 없음').fingerprint).toBe(make('id 456 없음').fingerprint)
  })

  it('다른 에러는 다른 지문을 갖는다', () => {
    const a = buildEvent({ error: new Error('없음') })
    const b = buildEvent({ error: new RangeError('범위 초과') })
    expect(a.fingerprint).not.toBe(b.fingerprint)
  })

  it('context는 allowlist만 담는다', () => {
    const event = buildEvent({
      error: new Error('x'),
      context: { route: '/a', component: 'B', token: 'secret' },
    })
    expect(event.context).toEqual({ route: '/a', component: 'B' })
  })
})

describe('fitEvent', () => {
  it('이벤트 상한을 넘으면 stack부터 줄인다', () => {
    const event = buildEvent({ error: new Error('x') })
    const oversized = { ...event, stack: 'a'.repeat(FIELD_LIMITS.event + 500) }
    const fitted = fitEvent(oversized)
    expect(JSON.stringify(fitted).length).toBeLessThanOrEqual(FIELD_LIMITS.event)
    expect(fitted.truncated).toBe(true)
  })
})
