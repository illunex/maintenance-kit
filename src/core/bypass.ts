/** dev bypass 플래그를 저장하는 localStorage 기본 키 */
export const DEFAULT_BYPASS_KEY = 'maintenance-kit:bypass'

/**
 * MaintenanceProvider의 dev bypass 설정.
 * - 생략/true: 활성(기본 키), false: 비활성, 객체: 활성 + 키 커스텀
 */
export type MaintenanceBypassOption = boolean | { storageKey?: string }

/** bypass 설정에서 localStorage 키를 결정한다. null이면 비활성. */
export function resolveBypassStorageKey(
  bypass?: MaintenanceBypassOption,
): string | null {
  if (bypass === false) return null
  if (bypass === undefined || bypass === true) return DEFAULT_BYPASS_KEY
  return bypass.storageKey ?? DEFAULT_BYPASS_KEY
}

/** 저장된 값이 bypass 활성으로 인정되는지 판정한다 (''/'0'/'false'는 비활성) */
export function isBypassActiveValue(raw: string | null): boolean {
  return raw !== null && raw !== '' && raw !== '0' && raw !== 'false'
}
