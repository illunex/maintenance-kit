/** 원격 JSON이 내려주는 점검 상태 정보 */
export interface MaintenanceInfo {
  /** 점검 중 여부 (점검 화면 표시 여부는 이 값만으로 판정) */
  isMaintenance: boolean
  /** 점검 안내 제목 */
  title?: string
  /** 점검 시작 시각 ("YYYY-MM-DD HH:mm:ss", 안내 표시용) */
  startTime?: string
  /** 점검 종료 예정 시각 ("YYYY-MM-DD HH:mm:ss", 안내 표시용) */
  endTime?: string
}

export interface CheckMaintenanceOptions {
  /** 점검 상태 JSON의 URL */
  url: string
  /** false면 t= 캐시 버스터 파라미터를 붙이지 않는다 (기본 true) */
  cacheBuster?: boolean
  /** fetch에 그대로 전달할 추가 옵션 */
  fetchOptions?: RequestInit
}
