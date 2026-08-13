import type { ReactElement, ReactNode } from 'react'
import {
  checkMaintenance,
  isBypassActiveValue,
  resolveBypassStorageKey,
  type CheckMaintenanceOptions,
  type MaintenanceBypassOption,
  type MaintenanceInfo,
} from '../core'
import { DefaultMaintenanceScreen } from '../react/default-screen'

export type {
  CheckMaintenanceOptions,
  MaintenanceBypassOption,
  MaintenanceInfo,
} from '../core'
export { checkMaintenance, isMaintenanceInfo, DEFAULT_BYPASS_KEY } from '../core'

export interface MaintenanceGateProps extends CheckMaintenanceOptions {
  children: ReactNode
  /** 점검 중일 때 children 대신 렌더링할 화면 (미지정 시 기본 화면) */
  fallback?: ReactNode
  /** dev bypass 설정 — 키는 쿠키 이름으로 사용 (기본 'maintenance-kit-bypass') */
  bypass?: MaintenanceBypassOption
}

/** 요청 쿠키에서 bypass 활성 여부를 판정한다 (요청 컨텍스트 밖·Next 아닌 환경에서는 false) */
async function readBypassCookie(cookieName: string | null): Promise<boolean> {
  if (cookieName === null) return false
  try {
    const { cookies } = await import('next/headers')
    const store = await cookies()
    return isBypassActiveValue(store.get(cookieName)?.value ?? null)
  } catch {
    return false
  }
}

/**
 * 서버에서 점검 상태를 판정해 점검 화면 또는 children을 렌더하는 게이트.
 * HTML 자체가 점검 화면으로 내려가므로 클라이언트 플래시가 없고 CORS 설정도 불필요하다.
 */
export async function MaintenanceGate({
  url,
  cacheBuster,
  fetchOptions,
  fallback,
  bypass,
  children,
}: MaintenanceGateProps): Promise<ReactElement> {
  let info: MaintenanceInfo
  try {
    info = await checkMaintenance({
      url,
      cacheBuster,
      // 요청마다 최신 상태를 읽도록 Next fetch 캐시를 끈다 (사용자 fetchOptions가 우선)
      fetchOptions: { cache: 'no-store', ...fetchOptions },
    })
  } catch {
    // 상태 확인 실패 시에는 서비스를 막지 않는다 (fail-open)
    return <>{children}</>
  }
  if (!info.isMaintenance) {
    return <>{children}</>
  }
  const bypassed = await readBypassCookie(resolveBypassStorageKey(bypass))
  if (bypassed) {
    return <>{children}</>
  }
  return <>{fallback ?? <DefaultMaintenanceScreen info={info} />}</>
}
