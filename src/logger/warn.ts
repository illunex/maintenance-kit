const PREFIX = '@illunex-front/maintenance-kit:logger'

/**
 * 설정 문제는 반드시 콘솔에 남긴다.
 * 조용히 비활성되거나 값이 조정되면 수집이 멈춘 걸 한참 뒤에 알게 된다.
 */
export function warn(message: string): void {
  // eslint-disable-next-line no-console
  console.warn(`${PREFIX}: ${message}`)
}
