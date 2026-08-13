# SSR 어댑터 + 로딩 차단 설계 (v0.2.0)

- 상태: 승인됨 (2026-08-13)
- 대상 패키지: `@illunex-front/maintenance-kit`
- 선행 spec: `2026-08-13-dev-bypass-design.md`

## 1. 목적 · 배경

두 가지 문제를 해결한다.

1. **점검 플래시**: 클라이언트 Provider는 JSON을 불러오는 동안(`loading`) children을 렌더하므로, 점검 중에도 응답이 오기 전까지 실제 앱이 노출된다. 점검 중 앱 노출은 허용되지 않아야 한다.
2. **SSR 미지원**: `/next` 진입점이 클라이언트 Provider 재노출에 그친다. 서버에서 JSON을 읽고 HTML 자체를 점검 화면으로 내려보내는 어댑터가 필요하다 (플래시 원천 차단 + CORS 불필요).

## 2. 결정 사항 (사용자 확인 완료)

1. **클라이언트 로딩 기본 차단**: `loading` 동안 children 대신 대기 화면(기본 빈 화면) 렌더.
2. **SSR bypass는 쿠키 + 키 통일**: 쿠키 이름에 `:`가 허용되지 않으므로(RFC 6265) 기본 키를 `'maintenance-kit-bypass'`로 변경, localStorage·쿠키 공용. npm 미배포라 마이그레이션 부담 없음.

## 3. 키 통일

- `src/core/bypass.ts`의 `DEFAULT_BYPASS_KEY`를 `'maintenance-kit-bypass'`로 변경.
- 계약 고정을 위해 테스트에 `expect(DEFAULT_BYPASS_KEY).toBe('maintenance-kit-bypass')` 명시.
- README·노션 문서의 키 표기 전부 갱신.

## 4. 클라이언트 Provider — 로딩 차단

`MaintenanceProviderProps`에 추가:

```ts
/** 상태 확인 중(loading)에 렌더링할 화면 (기본 null — 아무것도 표시하지 않음) */
loading?: ReactNode
```

렌더 로직:

- `status === 'loading'` → `loading ?? null`
- `status === 'maintenance' && !bypassed` → `fallback ?? DefaultMaintenanceScreen`
- 그 외(`up`, `error`) → children (fail-open 유지)

트레이드오프: 모든 사용자의 첫 렌더가 JSON 응답 시간만큼 지연된다. 점검 노출 0 보장이 우선이며, 근본 해결은 SSR 게이트(§5).

## 5. SSR 어댑터 — `@illunex-front/maintenance-kit/next/server`

### 5.1 공개 API

```tsx
// app/layout.tsx (서버 컴포넌트)
import { MaintenanceGate } from '@illunex-front/maintenance-kit/next/server'

<MaintenanceGate url="https://.../maintenance.json">{children}</MaintenanceGate>
```

```ts
export interface MaintenanceGateProps extends CheckMaintenanceOptions {
  children: ReactNode
  /** 점검 중일 때 children 대신 렌더링할 화면 (미지정 시 기본 화면) */
  fallback?: ReactNode
  /** dev bypass 설정 — 클라이언트 Provider와 동일 union, 키는 쿠키 이름으로 사용 */
  bypass?: MaintenanceBypassOption
}

export async function MaintenanceGate(props: MaintenanceGateProps): Promise<ReactElement>
```

### 5.2 동작

1. 서버에서 `checkMaintenance({ url, cacheBuster, fetchOptions: { cache: 'no-store', ...fetchOptions } })` 실행.
   - `cache: 'no-store'`로 Next fetch 캐시를 무효화해 요청마다 최신 상태를 읽는다. 사용자가 `fetchOptions`로 덮어쓸 수 있다(스프레드 순서상 사용자 값 우선).
2. 조회 실패 → children 렌더 (fail-open, 클라이언트와 동일 원칙).
3. `isMaintenance: false` → children.
4. `isMaintenance: true` → 쿠키 bypass 판정:
   - `next/headers`의 `cookies()`를 **동적 import + try/catch**로 읽는다 (요청 컨텍스트 밖·Next 아닌 환경에서는 조용히 false). Next 15의 async `cookies()` 호환을 위해 `await cookies()` 사용.
   - 쿠키 이름은 `resolveBypassStorageKey(bypass)`, 값 판정은 `isBypassActiveValue` 재사용.
   - bypass 활성 → children, 아니면 `fallback ?? <DefaultMaintenanceScreen info={info} />`.
5. `DefaultMaintenanceScreen`은 훅이 없는 순수 컴포넌트라 서버에서 그대로 렌더 가능 (`src/react/default-screen.tsx`에는 `'use client'` 지시어가 없음).

개발자 사용법 (devtools 콘솔):

```js
// SSR bypass 켜기
document.cookie = 'maintenance-kit-bypass=1; path=/'
// 끄기
document.cookie = 'maintenance-kit-bypass=; path=/; max-age=0'
```

### 5.3 빌드 구성

- 기존 `/next` 번들은 `'use client'` 배너가 붙어 서버 컴포넌트를 담을 수 없다 → **새 소스 디렉터리 `src/next-server/`, 새 tsup 엔트리 `next-server`(배너 없음)**.
- `next`는 tsup `external` 유지(이미 포함), `next/headers`는 동적 import.
- `package.json` exports에 `"./next/server"` 추가 (dist/next-server.*).
- `next`를 devDependency로 추가 (`next/headers` 타입체크·테스트용). peerDependency는 기존 그대로 optional.

### 5.4 범위 제한 (비목표)

- SSR 게이트 모드에서는 `useMaintenance()` 컨텍스트를 제공하지 않는다 (서버 게이트가 children을 직접 렌더). 배너가 필요하면 클라이언트 Provider를 병용할 수 있다고 문서화.
- App Router 전용. Pages Router는 기존 `checkMaintenance`를 `getServerSideProps`에서 직접 사용.
- 미들웨어 기반 차단은 이번 범위 아님 (로드맵 유지).

## 6. 테스트 계획

- `src/core/bypass.test.ts`: `DEFAULT_BYPASS_KEY === 'maintenance-kit-bypass'` 계약 고정 추가.
- `src/react/index.test.tsx` 추가 케이스:
  - 로딩 중(fetch 미해결)에는 children을 렌더하지 않는다 (기본 빈 화면)
  - `loading` prop 지정 시 로딩 중 해당 화면을 렌더한다
- `src/next-server/index.test.tsx` (jsdom, `vi.mock('next/headers')`로 쿠키 스토어 모킹):
  - 점검 중 → 점검 화면 렌더, children 미노출
  - 점검 중 + bypass 쿠키 → children 렌더
  - 점검 아님 → children 렌더
  - 조회 실패 → children 렌더 (fail-open)
  - fetch에 `cache: 'no-store'`가 전달된다

## 7. 문서 (README · 노션)

- bypass 키 표기 전부 `maintenance-kit-bypass`로 갱신 (localStorage + 쿠키).
- Next.js 섹션 개편: `MaintenanceGate` 사용법(layout.tsx), CORS 불필요·플래시 원천 차단 설명, "개발 중" 문구 제거.
- `loading` prop 문서화 + 로딩 기본 동작 변경 안내.
- API 목록에 `MaintenanceGate` 추가.

## 8. 버전

- `0.2.0`으로 범프. 배포(`pnpm publish`)는 구현·검증 완료 후 별도 진행.

## 9. 부록: loadingBackground (배포 전 추가, 2026-08-13)

다크 모드 서비스에서 로딩 중 기본 빈 화면(흰색)이 테마를 깨는 문제 해결.

- `MaintenanceProviderProps.loadingBackground?: string` (CSS 색상) 추가.
- 로딩 중 렌더 우선순위: `loading` > `loadingBackground`(해당 배경색의 `minHeight: 100vh` 전체 화면 div, `aria-hidden`) > `null`.
- SSR 게이트는 로딩 상태가 없으므로 해당 없음. v0.2.1로 배포 (v0.2.0은 이 기능 머지 전에 배포됨).
