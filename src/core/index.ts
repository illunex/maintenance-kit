import type { CheckMaintenanceOptions, MaintenanceInfo } from './types'

export type { CheckMaintenanceOptions, MaintenanceInfo } from './types'
export { formatMaintenancePeriod } from './format'

/** 응답 JSON이 MaintenanceInfo 형태인지 검사하는 타입 가드 */
export function isMaintenanceInfo(value: unknown): value is MaintenanceInfo {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  if (typeof record.isMaintenance !== 'boolean') {
    return false
  }
  return ['title', 'startTime', 'endTime'].every(
    (key) => record[key] === undefined || typeof record[key] === 'string',
  )
}

/** S3/CDN 캐시를 우회하도록 t=현재시각 파라미터를 붙인다 */
function appendCacheBuster(url: string): string {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}t=${Date.now()}`
}

/** 원격 JSON URL에서 점검 상태를 가져온다 */
export async function checkMaintenance(
  options: CheckMaintenanceOptions,
): Promise<MaintenanceInfo> {
  const requestUrl =
    options.cacheBuster === false ? options.url : appendCacheBuster(options.url)
  const response = await fetch(requestUrl, options.fetchOptions)
  if (!response.ok) {
    throw new Error(
      `@illunex-front/maintenance-kit: 점검 상태 JSON 요청에 실패했습니다 (HTTP ${response.status})`,
    )
  }
  const data: unknown = await response.json()
  if (!isMaintenanceInfo(data)) {
    throw new Error(
      '@illunex-front/maintenance-kit: 응답 JSON이 MaintenanceInfo 형식이 아닙니다 (isMaintenance: boolean 필수)',
    )
  }
  return data
}
