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
   * 소스맵 생성 여부 (기본 true).
   * Next에는 Vite의 hidden에 해당하는 옵션이 없어서, 생성만 켜고
   * CI에서 .map을 비공개 저장소로 옮긴 뒤 sourceMappingURL 주석을 제거해야 한다.
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
  const { sourcemap = true, ...overrides } = options
  return {
    ...nextConfig,
    productionBrowserSourceMaps:
      nextConfig.productionBrowserSourceMaps ?? sourcemap,
    webpack(config, context) {
      const info = resolveBuildInfo(overrides)
      config.plugins.push(new context.webpack.DefinePlugin(toDefine(info)))
      return nextConfig.webpack?.(config, context) ?? config
    },
  }
}
