import { describe, expect, it } from 'vitest'
import { defaultResolveEnv, resolveBuildInfo, toDefine } from './index'

describe('defaultResolveEnv', () => {
  it('main·master는 production', () => {
    expect(defaultResolveEnv('main')).toBe('production')
    expect(defaultResolveEnv('master')).toBe('production')
  })

  it('dev·develop은 development', () => {
    expect(defaultResolveEnv('dev')).toBe('development')
    expect(defaultResolveEnv('develop')).toBe('development')
  })

  it('release/*는 staging', () => {
    expect(defaultResolveEnv('release/2026-09')).toBe('staging')
  })

  it('그 외 브랜치는 이름을 그대로 남긴다', () => {
    expect(defaultResolveEnv('psy/feature/error-logger')).toBe(
      'psy/feature/error-logger',
    )
  })
})

describe('resolveBuildInfo', () => {
  it('명시 값이 자동 판별보다 우선한다', () => {
    const info = resolveBuildInfo({
      service: 'em-stock-front',
      env: 'staging',
      release: 'abc1234',
      endpoint: 'https://logs.example.com/ingest',
    })
    expect(info).toEqual({
      service: 'em-stock-front',
      env: 'staging',
      release: 'abc1234',
      endpoint: 'https://logs.example.com/ingest',
    })
  })

  it('resolveEnv로 브랜치 매핑을 바꿀 수 있다', () => {
    const info = resolveBuildInfo({
      service: 'a',
      resolveEnv: () => 'custom',
    })
    expect(info.env).toBe('custom')
  })

  it('번들에 심을 define 맵을 만든다', () => {
    const define = toDefine({ service: 'a', env: 'production' })
    expect(define.__MK_LOGGER_BUILD__).toBe('{"service":"a","env":"production"}')
  })
})
