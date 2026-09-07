import { warn } from './warn'

/**
 * URL에서 남길 쿼리 파라미터 키.
 *
 * 쿼리스트링은 개인정보가 딸려 들어오는 가장 흔한 경로라 기본은 전부 버린다.
 * 다만 /insight?tab=momentum 처럼 탭·모드가 쿼리에 있는 화면은 그걸 버리면
 * 어느 화면에서 난 에러인지 알 수 없다. 그래서 앱이 키를 콕 집어 남기게 한다.
 *
 * 모듈 상태로 두는 이유는 url과 context.route를 만드는 자리가 서로 떨어져 있어
 * 설정을 인자로 흘려보내면 호출 경로가 전부 바뀌기 때문이다.
 */
let kept: readonly string[] = []

export function setKeptQueryParams(raw: unknown): void {
  if (raw === undefined) {
    kept = []
    return
  }
  if (!Array.isArray(raw)) {
    warn('keepQueryParams가 배열이 아니어서 무시합니다.')
    kept = []
    return
  }
  const cleaned = raw.filter(
    (key): key is string => typeof key === 'string' && key !== '',
  )
  if (cleaned.length !== raw.length) {
    warn('keepQueryParams의 문자열이 아닌 값은 무시합니다.')
  }
  kept = cleaned
}

export function keptQueryParams(): readonly string[] {
  return kept
}
