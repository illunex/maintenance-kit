'use client'

// Next.js 진입점. 현재는 React Provider를 그대로 노출하며,
// SSR/미들웨어 등 Next.js 전용 어댑터는 기능 확정 후 이 파일에 추가한다.
export {
  MaintenanceProvider,
  useMaintenance,
  DefaultMaintenanceScreen,
  checkMaintenance,
  isMaintenanceInfo,
  formatMaintenancePeriod,
} from '../react'
export type {
  MaintenanceProviderProps,
  MaintenanceContextValue,
  MaintenanceStatus,
  CheckMaintenanceOptions,
  MaintenanceInfo,
} from '../react'
