# Dev Bypass 설계 (B안: localStorage 수동 플래그)

- 상태: 승인 대기 (사용자 리뷰 전)
- 대상 패키지: `@illunex-front/maintenance-kit`
- 작성일: 2026-08-13

## 1. 목적

점검 화면(`isMaintenance: true`)을 일반 사용자에게 띄워둔 상태에서, **개발자/QA가 배포가 제대로 이루어졌는지 실제 앱을 확인**하기 위해 점검 화면을 통과하는 편의 장치.

## 2. 위협 모델 · 비목표

- **프론트 전용.** 검증 로직과 값이 모두 클라이언트 번들에 존재하므로 암호학적으로 "안전한" bypass는 불가능하다. 이 기능은 **보안 경계가 아니라 편의 장치**다.
- "가장 안전한" 기준을 다음 3가지로 정의하고 그에 맞춰 설계한다:
  1. 일반 사용자가 우연히/실수로 통과할 여지가 없을 것 (링크 공유·히스토리·referrer로 새지 않을 것)
  2. 번들이나 URL에 민감한 값(secret)이 새지 않을 것 → **노출 제로**
  3. bypass가 실제 서비스 보안을 무너뜨리지 않을 것 (점검 화면은 백엔드 보호가 아니라 UI 게이트)
- **비목표:** 인가된 사용자만 통과시키는 진짜 접근 제어. 그건 서버 검증이 필요하며 이 기능의 범위가 아니다.
- **감수하는 트레이드오프:** bypass를 기본 제공(default-on)하고 고정 공개 키를 쓰므로, "이 사이트가 maintenance-kit을 쓴다"는 것을 아는 사람은 devtools 콘솔로 플래그를 켤 수 있다. 편의용 내부 도구로서 감수한다.

## 3. 동작 방식 (B안 요약)

라이브러리는 **localStorage에 특정 키가 설정되어 있는지**만 검사한다. 키가 활성이면 `isMaintenance: true`여도 점검 화면 대신 children(실제 앱)을 렌더한다. 개발자는 devtools 콘솔이나 북마클릿으로 키를 직접 설정/해제한다. 번들에는 secret이 전혀 들어가지 않는다.

## 4. 공개 API

`MaintenanceProvider`에 `bypass` prop을 추가한다.

```tsx
// 기본 제공(default-on): prop 생략 시 기본 키로 활성
<MaintenanceProvider url="...">...</MaintenanceProvider>

// 끄기
<MaintenanceProvider url="..." bypass={false}>...</MaintenanceProvider>

// 저장 키 커스텀
<MaintenanceProvider url="..." bypass={{ storageKey: 'my-app-bypass' }}>...</MaintenanceProvider>
```

타입:

```ts
export type MaintenanceBypassOption = boolean | { storageKey?: string }
```

- 생략 / `true` → 활성, 기본 키 사용
- `false` → 비활성 (localStorage를 아예 읽지 않음)
- `{ storageKey }` → 활성, 키 커스텀 (미지정 시 기본 키)

기본 키: `'maintenance-kit:bypass'`

`MaintenanceProviderProps`에 필드 추가:

```ts
export interface MaintenanceProviderProps extends CheckMaintenanceOptions {
  children: ReactNode
  fallback?: ReactNode
  /**
   * 개발자 통과(dev bypass) 설정.
   * - 생략/true: 기본 활성(기본 키)
   * - false: 비활성
   * - { storageKey }: 활성 + 키 커스텀
   */
  bypass?: MaintenanceBypassOption
}
```

## 5. 저장 규칙 (개발자 사용법)

```js
// 통과 켜기
localStorage.setItem('maintenance-kit:bypass', '1')
// 통과 끄기
localStorage.removeItem('maintenance-kit:bypass')
```

- 활성 판정(관대한 truthy): 저장된 값이 `null`이 아니고 `''`, `'0'`, `'false'`가 아니면 활성. 권장 값은 `'1'`.
- 설정 후 새로고침하면 반영된다(실시간 storage 이벤트 구독은 하지 않음 — YAGNI).
- TTL(자동 만료) 없음. 해제는 `removeItem` 수동.

## 6. Provider 통합 로직

현재 구조:

```
useEffect: checkMaintenance() → status: 'maintenance' | 'up' | 'error'
render:    status === 'maintenance' ? (fallback ?? DefaultScreen) : children
```

변경:

- `useEffect` 안에서 **상태 확정과 함께 bypass를 1회 판정**하여 context에 `bypassed: boolean`을 넣는다.
- 렌더 조건: `status === 'maintenance' && !bypassed` 일 때만 점검 화면, 그 외엔 children.
- `status`는 서버 진실(`maintenance`) 그대로 유지하고, `bypassed`는 별도 플래그로 노출한다. 새로운 status 값(`'bypassed'`)은 만들지 않는다 — "서버 상태"와 "로컬 오버라이드"의 의미를 분리.
- `useMaintenance()`가 `{ status, info, bypassed }`를 반환하므로, 앱은 `status === 'maintenance' && bypassed`로 "개발자 통과 중"을 감지해 자체 배너를 표시할 수 있다. **라이브러리는 배너를 자동 렌더하지 않는다.**

컨텍스트 타입 변경:

```ts
export interface MaintenanceContextValue {
  status: MaintenanceStatus
  info: MaintenanceInfo | null
  bypassed: boolean   // 추가 (기본 false)
}
```

`createContext` 기본값과 초기 state의 `bypassed`는 `false`.

## 7. SSR · 오류 안전성

- localStorage 접근은 `useEffect`(클라이언트 전용)에서만 수행하고 `typeof window === 'undefined'` 가드 + `try/catch`로 감싼다. SSR·프라이버시 모드·저장소 비활성 시엔 조용히 "통과 아님(false)"으로 처리한다.
- **렌더 중에는 localStorage를 읽지 않는다** (SSR에서 크래시 방지). 초기 state는 `bypassed: false`.
- 플래시 없음: 로딩 중(`status: 'loading'`)엔 지금도 children을 보여준다. `checkMaintenance` 완료 시점에 status와 bypassed가 한 번에 세팅되므로, 점검 화면이 깜빡였다가 통과되는 현상은 없다.

## 8. 코드 구조 (작고 테스트 가능한 단위)

판정 로직을 DOM 의존 없는 순수 함수로 분리한다.

- `src/core/bypass.ts` (순수, 단위 테스트 대상)
  - `export const DEFAULT_BYPASS_KEY = 'maintenance-kit:bypass'`
  - `export type MaintenanceBypassOption = boolean | { storageKey?: string }`
  - `export function resolveBypassStorageKey(bypass?: MaintenanceBypassOption): string | null`
    - `false` → `null`(비활성), 생략/`true` → 기본 키, 객체 → `storageKey ?? 기본 키`
  - `export function isBypassActiveValue(raw: string | null): boolean`
    - `null`/`''`/`'0'`/`'false'` → `false`, 그 외 → `true`
- `src/react/index.tsx` (브라우저 가드 + 와이어링)
  - `readBypassActive(storageKey: string | null): boolean`
    - `storageKey === null` → `false`, `typeof window === 'undefined'` → `false`, `try { isBypassActiveValue(window.localStorage.getItem(storageKey)) } catch { false }`
  - 위 함수를 `useEffect`에서 호출해 `bypassed` 판정

## 9. Export 반영

- `src/core/index.ts`: `isBypassActiveValue`, `resolveBypassStorageKey`, `DEFAULT_BYPASS_KEY`, 타입 `MaintenanceBypassOption` 재노출.
- `src/react/index.tsx`: `MaintenanceBypassOption` 타입 재노출.
- `src/next/index.tsx`: react에서 재노출하는 심볼/타입 목록에 `MaintenanceBypassOption` 추가.

## 10. 테스트 계획

- `src/core/bypass.test.ts`
  - `isBypassActiveValue`: `null`, `''`, `'0'`, `'false'` → false; `'1'`, `'true'`, `'x'` → true
  - `resolveBypassStorageKey`: `undefined`/`true` → 기본 키; `false` → `null`; `{ storageKey: 'k' }` → `'k'`; `{}` → 기본 키
- Provider 동작(가짜 localStorage 주입): `isMaintenance: true` + 키 활성 → children 렌더 / 키 없음 → 점검 화면 렌더. (기존 vitest 환경에서 jsdom 또는 window.localStorage 스텁 사용)

## 11. 문서 (README)

"개발자 통과(dev bypass)" 섹션 추가:
- 기본 제공(default-on)이며 `bypass={false}`로 끌 수 있음
- 개발자 켜는 법(콘솔 `setItem`, 북마클릿 예시) / 끄는 법(`removeItem`)
- SSR 안전 / TTL 없음
- **"편의용이며 보안 경계가 아님"** 및 §2의 트레이드오프 명시
