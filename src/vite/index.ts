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

interface ViteConfigPatch {
  define: Record<string, string>
  build?: { sourcemap: 'hidden' }
}

/** vite의 Plugin 타입을 가져오지 않으려고 필요한 모양만 선언한다 */
interface VitePluginLike {
  name: string
  apply: 'build'
  config: () => ViteConfigPatch
}

export interface ErrorLoggerEnvOptions extends BuildInfoOverrides {
  /**
   * 소스맵을 hidden으로 생성할지 여부 (기본 true).
   * hidden은 .map을 만들되 번들에 sourceMappingURL 주석을 남기지 않는다.
   * CI에서 .map을 비공개 저장소로 옮기고 배포 산출물에서 지워야 완성된다.
   */
  sourcemap?: boolean
}

/**
 * 빌드 시점에 service·env·release를 확정해 번들에 심는 Vite 플러그인.
 *
 * ```ts
 * import { errorLoggerEnv } from '@illunex-front/maintenance-kit/vite'
 * export default defineConfig({ plugins: [react(), errorLoggerEnv()] })
 * ```
 */
export function errorLoggerEnv(
  options: ErrorLoggerEnvOptions = {},
): VitePluginLike {
  const { sourcemap = true, ...overrides } = options
  return {
    name: 'maintenance-kit:error-logger-env',
    // dev 서버에서는 브랜치가 의미 없고 git 호출 비용만 든다
    apply: 'build',
    config: () => {
      const info = resolveBuildInfo(overrides)
      const patch: ViteConfigPatch = { define: toDefine(info) }
      if (sourcemap) patch.build = { sourcemap: 'hidden' }
      return patch
    },
  }
}
