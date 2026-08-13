import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BYPASS_KEY,
  isBypassActiveValue,
  resolveBypassStorageKey,
} from './bypass'

describe('resolveBypassStorageKey', () => {
  it('기본 키는 쿠키 이름으로도 쓸 수 있는 형태다', () => {
    expect(DEFAULT_BYPASS_KEY).toBe('maintenance-kit-bypass')
  })

  it('생략하거나 true면 기본 키를 반환한다', () => {
    expect(resolveBypassStorageKey(undefined)).toBe(DEFAULT_BYPASS_KEY)
    expect(resolveBypassStorageKey(true)).toBe(DEFAULT_BYPASS_KEY)
  })

  it('false면 null(비활성)을 반환한다', () => {
    expect(resolveBypassStorageKey(false)).toBeNull()
  })

  it('객체면 storageKey를 사용하고, 없으면 기본 키를 쓴다', () => {
    expect(resolveBypassStorageKey({ storageKey: 'my-key' })).toBe('my-key')
    expect(resolveBypassStorageKey({})).toBe(DEFAULT_BYPASS_KEY)
  })
})

describe('isBypassActiveValue', () => {
  it('저장 값이 없거나 부정 값이면 비활성이다', () => {
    expect(isBypassActiveValue(null)).toBe(false)
    expect(isBypassActiveValue('')).toBe(false)
    expect(isBypassActiveValue('0')).toBe(false)
    expect(isBypassActiveValue('false')).toBe(false)
  })

  it('그 외 값이면 활성이다', () => {
    expect(isBypassActiveValue('1')).toBe(true)
    expect(isBypassActiveValue('true')).toBe(true)
    expect(isBypassActiveValue('아무 값')).toBe(true)
  })
})
