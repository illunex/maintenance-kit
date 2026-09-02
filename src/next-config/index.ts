import {
  resolveBuildInfo,
  toDefine,
  type BuildInfoOverrides,
} from '../build-info'

export type { BuildInfo, BuildInfoOverrides } from '../build-info'
export {
  defaultResolveEnv,
  resolveBranch,
  resolveBuildInfo,
  resolveRelease,
  resolveService,
} from '../build-info'

/** next의 설정 타입에 의존하지 않도록 필요한 부분만 선언한다 */
interface WebpackConfigLike {
  plugins: unknown[]
}

interface WebpackContextLike {
  webpack: { DefinePlugin: new (definitions: Record<string, string>) => unknown }
}

interface NextConfigLike {
  productionBrowserSourceMaps?: boolean
  webpack?: (
    config: WebpackConfigLike,
    context: WebpackContextLike,
  ) => WebpackConfigLike
  [key: string]: unknown
}

export interface WithErrorLoggerOptions extends BuildInfoOverrides {
  /**
   * 소스맵 생성 여부 (기본 false).
   *
   * Next에는 Vite의 hidden에 해당하는 옵션이 없어, 켜면 번들에
   * sourceMappingURL 주석까지 붙어 .map이 공개된다. CI에서 .map을 비공개
   * 저장소로 옮기고 배포 산출물에서 지우는 절차를 갖춘 뒤에만 켜야 하므로,
   * 한 줄만 적용한 사용자가 모르는 사이 소스가 공개되지 않도록 기본은 끈다.
   */
  sourcemap?: boolean
}

/**
 * next.config를 감싸 빌드 값을 주입한다.
 *
 * ```js
 * const { withErrorLogger } = require('@illunex-front/maintenance-kit/next/config')
 * module.exports = withErrorLogger(existingConfig)
 * ```
 */
export function withErrorLogger(
  nextConfig: NextConfigLike = {},
  options: WithErrorLoggerOptions = {},
): NextConfigLike {
  const { sourcemap = false, ...overrides } = options
  return {
    ...nextConfig,
    productionBrowserSourceMaps:
      nextConfig.productionBrowserSourceMaps ?? sourcemap,
    webpack(config, context) {
      // 사용자 webpack이 새 config 객체를 반환하면 먼저 넣은 플러그인이 사라진다.
      // 반환값을 받은 뒤에 주입해야 어느 쪽이든 빌드 값이 남는다.
      const patched = nextConfig.webpack?.(config, context) ?? config
      const info = resolveBuildInfo(overrides)
      patched.plugins.push(new context.webpack.DefinePlugin(toDefine(info)))
      return patched
    },
  }
}
