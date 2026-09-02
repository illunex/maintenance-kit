import { describe, expect, it, vi } from 'vitest'
import { withErrorLogger } from './index'

class FakeDefinePlugin {
  constructor(public readonly definitions: Record<string, string>) {}
}

const context = { webpack: { DefinePlugin: FakeDefinePlugin } }

const overrides = { service: 'em-stock-front', env: 'production', release: 'abc1234' }

describe('withErrorLogger', () => {
  it('빌드 값을 DefinePlugin으로 주입한다', () => {
    const config = { plugins: [] as unknown[] }
    withErrorLogger({}, overrides).webpack?.(config, context)
    expect(config.plugins).toHaveLength(1)
  })

  it('사용자 webpack이 새 config를 반환해도 주입이 살아남는다', () => {
    // 먼저 push하면 사용자가 만든 새 객체로 교체되면서 define이 통째로 사라진다
    const replaced = { plugins: [] as unknown[] }
    const userWebpack = vi.fn(() => replaced)
    const result = withErrorLogger({ webpack: userWebpack }, overrides).webpack?.(
      { plugins: [] },
      context,
    )
    expect(userWebpack).toHaveBeenCalled()
    expect(result).toBe(replaced)
    expect(replaced.plugins).toHaveLength(1)
  })

  it('사용자 webpack이 config를 그대로 반환해도 한 번만 주입한다', () => {
    const config = { plugins: [] as unknown[] }
    withErrorLogger({ webpack: (given) => given }, overrides).webpack?.(config, context)
    expect(config.plugins).toHaveLength(1)
  })

  it('소스맵은 기본으로 켜지 않는다', () => {
    // Next에는 hidden이 없어 켜면 sourceMappingURL까지 붙어 .map이 공개된다
    expect(withErrorLogger({}).productionBrowserSourceMaps).toBe(false)
    expect(withErrorLogger({}, { sourcemap: true }).productionBrowserSourceMaps).toBe(
      true,
    )
  })

  it('기존 설정의 소스맵 지정이 우선한다', () => {
    expect(
      withErrorLogger({ productionBrowserSourceMaps: true }).productionBrowserSourceMaps,
    ).toBe(true)
  })
})
