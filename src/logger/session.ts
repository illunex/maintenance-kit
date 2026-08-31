const SESSION_KEY = 'maintenance-kit-log-session'

/** 충돌 가능성이 낮으면 충분하므로 crypto 의존 없이 만든다 */
function randomId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  ).toUpperCase()
}

/**
 * 한 번의 방문(탭) 단위 식별자.
 * user id가 아니며 계정과 연결되지 않는다. 방문 간 추적이 되지 않도록
 * localStorage가 아닌 sessionStorage에만 보관한다.
 */
export function resolveSessionId(): string {
  if (typeof window === 'undefined') return randomId()
  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY)
    if (stored !== null && stored !== '') return stored
    const created = randomId()
    window.sessionStorage.setItem(SESSION_KEY, created)
    return created
  } catch {
    // 프라이버시 모드 등 저장소 접근 불가 시에는 메모리 값으로 대체
    return randomId()
  }
}

/** 이벤트 개별 식별자 — 재전송이 겹쳤을 때 서버가 중복을 지우는 키 */
export function createEventId(): string {
  return randomId()
}
