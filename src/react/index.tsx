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
  type CheckMaintenanceOptions,
  type MaintenanceInfo,
} from '../core'
import { DefaultMaintenanceScreen } from './default-screen'

export type { CheckMaintenanceOptions, MaintenanceInfo } from '../core'
export { checkMaintenance, isMaintenanceInfo, formatMaintenancePeriod } from '../core'
export { DefaultMaintenanceScreen } from './default-screen'

export type MaintenanceStatus = 'loading' | 'up' | 'maintenance' | 'error'

export interface MaintenanceContextValue {
  status: MaintenanceStatus
  info: MaintenanceInfo | null
}

export interface MaintenanceProviderProps extends CheckMaintenanceOptions {
  children: ReactNode
  /** 점검 중일 때 children 대신 렌더링할 화면 (미지정 시 기본 화면) */
  fallback?: ReactNode
}

const MaintenanceContext = createContext<MaintenanceContextValue>({
  status: 'loading',
  info: null,
})

export function useMaintenance(): MaintenanceContextValue {
  return useContext(MaintenanceContext)
}

export function MaintenanceProvider({
  url,
  cacheBuster,
  fetchOptions,
  fallback,
  children,
}: MaintenanceProviderProps) {
  const [value, setValue] = useState<MaintenanceContextValue>({
    status: 'loading',
    info: null,
  })

  useEffect(() => {
    let cancelled = false
    checkMaintenance({ url, cacheBuster, fetchOptions })
      .then((info) => {
        if (!cancelled) {
          setValue({ status: info.isMaintenance ? 'maintenance' : 'up', info })
        }
      })
      .catch(() => {
        // 상태 확인 실패 시에는 서비스를 막지 않는다 (fail-open)
        if (!cancelled) {
          setValue({ status: 'error', info: null })
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  return (
    <MaintenanceContext.Provider value={value}>
      {value.status === 'maintenance'
        ? (fallback ?? <DefaultMaintenanceScreen info={value.info} />)
        : children}
    </MaintenanceContext.Provider>
  )
}
