// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildEvent } from './event'

describe('buildEvent (브라우저)', () => {
  it('url의 쿼리스트링을 제거한다', () => {
    window.history.replaceState(null, '', '/orders?token=abc')
    expect(buildEvent({ error: new Error('x') }).url).not.toContain('token')
  })

  it('url path에 남은 개인정보도 마스킹한다', () => {
    // 쿼리만 잘라내면 /users/hong@example.com 같은 path PII가 그대로 남는다
    window.history.replaceState(null, '', '/users/hong@example.com')
    const event = buildEvent({ error: new Error('x') })
    expect(event.url).toContain('/users/[email]')
    expect(event.url).not.toContain('hong@example.com')
  })
})
