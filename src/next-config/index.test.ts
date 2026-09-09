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

  it('next dev에서는 값 판별 없이 dev 표식만 심는다', () => {
    // 로컬 에러가 배포 환경 로그에 섞이면 안 되고, git 호출 비용도 없어야 한다
    const config = { plugins: [] as unknown[] }
    withErrorLogger({}, overrides).webpack?.(config, { ...context, dev: true })
    expect((config.plugins[0] as FakeDefinePlugin).definitions).toEqual({
      __MK_LOGGER_BUILD__: JSON.stringify({ dev: true }),
    })
  })

  it('next build에서는 표식이 아니라 빌드 값을 심는다', () => {
    const config = { plugins: [] as unknown[] }
    withErrorLogger({}, overrides).webpack?.(config, { ...context, dev: false })
    const { definitions } = config.plugins[0] as FakeDefinePlugin
    const raw = definitions.__MK_LOGGER_BUILD__
    expect(raw).toBeDefined()
    expect(JSON.parse(raw as string)).toMatchObject(overrides)
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
