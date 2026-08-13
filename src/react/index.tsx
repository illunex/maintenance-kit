'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  checkMaintenance,
  isBypassActiveValue,
  resolveBypassStorageKey,
  type CheckMaintenanceOptions,
  type MaintenanceBypassOption,
  type MaintenanceInfo,
} from '../core'
import { DefaultMaintenanceScreen } from './default-screen'

export type {
  CheckMaintenanceOptions,
  MaintenanceBypassOption,
  MaintenanceInfo,
} from '../core'
export {
  checkMaintenance,
  isMaintenanceInfo,
  formatMaintenancePeriod,
  DEFAULT_BYPASS_KEY,
  isBypassActiveValue,
  resolveBypassStorageKey,
} from '../core'
export { DefaultMaintenanceScreen } from './default-screen'

export type MaintenanceStatus = 'loading' | 'up' | 'maintenance' | 'error'

export interface MaintenanceContextValue {
  status: MaintenanceStatus
  info: MaintenanceInfo | null
  /** dev bypass 플래그로 점검 화면을 통과 중인지 여부 */
  bypassed: boolean
}

export interface MaintenanceProviderProps extends CheckMaintenanceOptions {
  children: ReactNode
  /** 점검 중일 때 children 대신 렌더링할 화면 (미지정 시 기본 화면) */
  fallback?: ReactNode
  /** 상태 확인 중(loading)에 렌더링할 화면 (기본 null — 아무것도 표시하지 않음) */
  loading?: ReactNode
  /** 상태 확인 중 빈 화면의 배경색 — 다크 모드 등 서비스 테마와 통일용 (loading 미지정 시에만 사용) */
  loadingBackground?: string
  /**
   * 개발자 통과(dev bypass) 설정.
   * - 생략/true: 기본 활성(기본 키), false: 비활성, { storageKey }: 키 커스텀
   */
  bypass?: MaintenanceBypassOption
}

const MaintenanceContext = createContext<MaintenanceContextValue>({
  status: 'loading',
  info: null,
  bypassed: false,
})

/** 브라우저에서만 localStorage를 읽어 bypass 활성 여부를 판정한다 (SSR/저장소 오류 시 false) */
function readBypassActive(storageKey: string | null): boolean {
  if (storageKey === null || typeof window === 'undefined') return false
  try {
    return isBypassActiveValue(window.localStorage.getItem(storageKey))
  } catch {
    // 프라이버시 모드 등 저장소 접근 불가 시 통과 아님으로 처리
    return false
  }
}

export function useMaintenance(): MaintenanceContextValue {
  return useContext(MaintenanceContext)
}

export function MaintenanceProvider({
  url,
  cacheBuster,
  fetchOptions,
  fallback,
  loading,
  loadingBackground,
  bypass,
  children,
}: MaintenanceProviderProps) {
  const [value, setValue] = useState<MaintenanceContextValue>({
    status: 'loading',
    info: null,
    bypassed: false,
  })

  useEffect(() => {
    let cancelled = false
    // 렌더 중 localStorage 접근을 피하기 위해 effect에서 1회만 판정한다
    const bypassed = readBypassActive(resolveBypassStorageKey(bypass))
    checkMaintenance({ url, cacheBuster, fetchOptions })
      .then((info) => {
        if (!cancelled) {
          setValue({
            status: info.isMaintenance ? 'maintenance' : 'up',
            info,
            bypassed,
          })
        }
      })
      .catch(() => {
        // 상태 확인 실패 시에는 서비스를 막지 않는다 (fail-open)
        if (!cancelled) {
          setValue({ status: 'error', info: null, bypassed })
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  const loadingFallback =
    loading ??
    (loadingBackground !== undefined ? (
      <div
        aria-hidden="true"
        // body 기본 마진·부모 레이아웃과 무관하게 뷰포트 전체를 덮는 오버레이
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: loadingBackground,
        }}
      />
    ) : null)

  return (
    <MaintenanceContext.Provider value={value}>
      {value.status === 'loading'
        ? loadingFallback
        : value.status === 'maintenance' && !value.bypassed
          ? (fallback ?? <DefaultMaintenanceScreen info={value.info} />)
          : children}
    </MaintenanceContext.Provider>
  )
}
