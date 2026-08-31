import { execFileSync } from 'node:child_process'

export interface BuildInfo {
  service: string
  env: string
  release?: string
  endpoint?: string
}

export interface BuildInfoOverrides {
  service?: string
  env?: string
  release?: string
  endpoint?: string
  /** 브랜치명 → env 매핑을 바꾸고 싶을 때 */
  resolveEnv?: (branch: string) => string
}

/** 빌드 환경에서만 도는 코드라 실패해도 빌드를 막지 않는다 */
function run(command: string, args: string[]): string | undefined {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return undefined
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value
}

/**
 * 리포명.
 * package.json의 name은 템플릿에서 복사된 채로 남아 있는 경우가 많아 쓰지 않는다.
 */
export function resolveService(): string | undefined {
  const fromActions = nonEmpty(process.env.GITHUB_REPOSITORY)
  if (fromActions !== undefined) {
    const parts = fromActions.split('/')
    return parts[parts.length - 1]
  }
  const remote = nonEmpty(run('git', ['config', '--get', 'remote.origin.url']))
  if (remote === undefined) return undefined
  const matched = /([^/:]+?)(?:\.git)?$/.exec(remote)
  return matched?.[1]
}

/** Amplify는 AWS_BRANCH를 자동으로 준다 — 콘솔 등록이 필요 없다 */
export function resolveBranch(): string | undefined {
  return (
    nonEmpty(process.env.AWS_BRANCH) ??
    nonEmpty(process.env.GITHUB_REF_NAME) ??
    nonEmpty(process.env.VERCEL_GIT_COMMIT_REF) ??
    nonEmpty(run('git', ['rev-parse', '--abbrev-ref', 'HEAD']))
  )
}

/** 배포본 식별자 — 소스맵 심볼화의 조인 키 */
export function resolveRelease(): string | undefined {
  const full =
    nonEmpty(process.env.AWS_COMMIT_ID) ??
    nonEmpty(process.env.GITHUB_SHA) ??
    nonEmpty(process.env.VERCEL_GIT_COMMIT_SHA) ??
    nonEmpty(run('git', ['rev-parse', 'HEAD']))
  return full?.slice(0, 7)
}

/** 브랜치명을 수집 환경 이름으로 바꾼다 */
export function defaultResolveEnv(branch: string): string {
  if (branch === 'main' || branch === 'master') return 'production'
  if (branch === 'dev' || branch === 'develop') return 'development'
  if (branch.startsWith('release/')) return 'staging'
  // 프리뷰 빌드는 브랜치명을 그대로 남겨야 어느 빌드인지 알 수 있다
  return branch
}

/**
 * 빌드 시점에 service·env·release를 확정한다.
 * 값을 못 찾으면 경고만 남기고 빈 값으로 둔다 — 런타임에서 다시 경고한다.
 */
export function resolveBuildInfo(overrides: BuildInfoOverrides = {}): BuildInfo {
  const service = overrides.service ?? resolveService() ?? ''
  const branch = resolveBranch()
  const toEnv = overrides.resolveEnv ?? defaultResolveEnv
  const env =
    overrides.env ?? (branch === undefined ? '' : toEnv(branch))

  if (service === '' || env === '') {
    // eslint-disable-next-line no-console
    console.warn(
      '[maintenance-kit] service 또는 env를 빌드 환경에서 확인하지 못했습니다. ' +
        'Docker 빌드라면 --build-arg로 값을 넘기거나 플러그인 옵션으로 직접 지정하세요.',
    )
  }

  return {
    service,
    env,
    release: overrides.release ?? resolveRelease(),
    endpoint: overrides.endpoint,
  }
}

/** 번들에 심을 define 맵 */
export function toDefine(info: BuildInfo): Record<string, string> {
  return { __MK_LOGGER_BUILD__: JSON.stringify(info) }
}
