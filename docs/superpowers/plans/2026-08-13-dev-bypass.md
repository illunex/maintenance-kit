# Dev Bypass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 점검 화면이 떠 있는 동안 개발자가 localStorage 플래그로 점검 화면을 통과해 실제 앱을 확인할 수 있는 dev bypass 기능을 추가한다.

**Architecture:** 순수 판정 로직(`src/core/bypass.ts`)과 브라우저 접근(react 레이어)을 분리한다. `MaintenanceProvider`가 `useEffect`에서 상태 확정과 함께 bypass를 1회 판정해 `bypassed: boolean`을 context에 넣고, `status === 'maintenance' && !bypassed`일 때만 점검 화면을 렌더한다. 기본 제공(default-on)이며 `bypass={false}`로 끈다.

**Tech Stack:** TypeScript(strict), React Context, vitest(+jsdom, @testing-library/react), tsup

**Spec:** `docs/superpowers/specs/2026-08-13-dev-bypass-design.md`

## Global Constraints

- 패키지 매니저는 `pnpm`만 사용 (`pnpm add -D <pkg>`, `pnpm test`, `pnpm typecheck`)
- `any` 금지, `strict: true` 전제, 공개 API는 반환 타입 명시
- 주석·테스트 설명은 한국어, 식별자는 영어
- 기본 localStorage 키: `'maintenance-kit:bypass'` (spec §4)
- 활성 판정: 값이 `null`/`''`/`'0'`/`'false'`가 아니면 활성 (spec §5)
- 렌더 중에는 localStorage를 읽지 않는다 — `useEffect`에서만, `window` 가드 + `try/catch` (spec §7)
- 새로운 status 값을 만들지 않는다 — `bypassed`는 별도 boolean (spec §6)
- 라이브러리는 배너를 자동 렌더하지 않는다 (spec §6)
- 커밋 메시지: `type: 한국어 명사형` + 아래 트레일러 2줄
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BW3UjPTogLGz4DfFxiHBcH
  ```

---

### Task 1: core 순수 판정 모듈 (`src/core/bypass.ts`)

**Files:**
- Create: `src/core/bypass.ts`
- Create: `src/core/bypass.test.ts`
- Modify: `src/core/index.ts` (재노출 추가)

**Interfaces:**
- Consumes: 없음 (독립 모듈)
- Produces:
  - `DEFAULT_BYPASS_KEY: string` (= `'maintenance-kit:bypass'`)
  - `type MaintenanceBypassOption = boolean | { storageKey?: string }`
  - `resolveBypassStorageKey(bypass?: MaintenanceBypassOption): string | null` — `false` → `null`(비활성), 생략/`true` → 기본 키, 객체 → `storageKey ?? 기본 키`
  - `isBypassActiveValue(raw: string | null): boolean` — `null`/`''`/`'0'`/`'false'` → `false`, 그 외 → `true`

- [ ] **Step 1: 실패하는 테스트 작성** — `src/core/bypass.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BYPASS_KEY,
  isBypassActiveValue,
  resolveBypassStorageKey,
} from './bypass'

describe('resolveBypassStorageKey', () => {
  it('생략하거나 true면 기본 키를 반환한다', () => {
    expect(resolveBypassStorageKey(undefined)).toBe(DEFAULT_BYPASS_KEY)
    expect(resolveBypassStorageKey(true)).toBe(DEFAULT_BYPASS_KEY)
  })

  it('false면 null(비활성)을 반환한다', () => {
    expect(resolveBypassStorageKey(false)).toBeNull()
  })

  it('객체면 storageKey를 사용하고, 없으면 기본 키를 쓴다', () => {
    expect(resolveBypassStorageKey({ storageKey: 'my-key' })).toBe('my-key')
    expect(resolveBypassStorageKey({})).toBe(DEFAULT_BYPASS_KEY)
  })
})

describe('isBypassActiveValue', () => {
  it('저장 값이 없거나 부정 값이면 비활성이다', () => {
    expect(isBypassActiveValue(null)).toBe(false)
    expect(isBypassActiveValue('')).toBe(false)
    expect(isBypassActiveValue('0')).toBe(false)
    expect(isBypassActiveValue('false')).toBe(false)
  })

  it('그 외 값이면 활성이다', () => {
    expect(isBypassActiveValue('1')).toBe(true)
    expect(isBypassActiveValue('true')).toBe(true)
    expect(isBypassActiveValue('아무 값')).toBe(true)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/core/bypass.test.ts`
Expected: FAIL — `./bypass` 모듈이 없어 import 에러

- [ ] **Step 3: 최소 구현** — `src/core/bypass.ts`

```ts
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
```

`src/core/index.ts` 상단 re-export 블록에 추가:

```ts
export {
  DEFAULT_BYPASS_KEY,
  isBypassActiveValue,
  resolveBypassStorageKey,
} from './bypass'
export type { MaintenanceBypassOption } from './bypass'
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/core/bypass.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/core/bypass.ts src/core/bypass.test.ts src/core/index.ts
git commit -m "feat: dev bypass 판정 로직 추가" # + 트레일러
```

---

### Task 2: MaintenanceProvider 통합

**Files:**
- Modify: `src/react/index.tsx`
- Modify: `src/next/index.tsx` (재노출 목록 갱신)
- Create: `src/react/index.test.tsx`
- Modify: `package.json` (devDependencies: `jsdom`, `@testing-library/react`, `@testing-library/dom`)

**Interfaces:**
- Consumes: Task 1의 `resolveBypassStorageKey`, `isBypassActiveValue`, `DEFAULT_BYPASS_KEY`, `MaintenanceBypassOption` (모두 `../core`에서 import)
- Produces:
  - `MaintenanceContextValue`에 `bypassed: boolean` 필드 추가 (기본 `false`)
  - `MaintenanceProviderProps`에 `bypass?: MaintenanceBypassOption` 필드 추가
  - react/next 진입점에서 `DEFAULT_BYPASS_KEY`, `isBypassActiveValue`, `resolveBypassStorageKey`, `MaintenanceBypassOption` 재노출

- [ ] **Step 1: 테스트 의존성 설치**

Run: `pnpm add -D jsdom@26 @testing-library/react @testing-library/dom`

(`@testing-library/dom`은 v16부터 `@testing-library/react`의 peer dependency라 명시 설치 필요)

> 실행 기록: jsdom 30은 의존하는 undici 8이 Node 20에서
> `webidl.util.markAsUncloneable is not a function` 에러를 내므로 jsdom 26으로 고정했다.

- [ ] **Step 2: 실패하는 테스트 작성** — `src/react/index.test.tsx`

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_BYPASS_KEY, MaintenanceProvider, useMaintenance } from './index'

const JSON_URL = 'https://example.com/maintenance.json'

/** Response 전역에 의존하지 않도록 최소 형태의 fetch 응답을 스텁한다 */
function stubMaintenanceFetch(isMaintenance: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ isMaintenance }),
    }),
  )
}

function BypassedProbe() {
  const { bypassed } = useMaintenance()
  return <span>{`bypassed:${String(bypassed)}`}</span>
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('MaintenanceProvider dev bypass', () => {
  it('점검 중 + 플래그 없음 → 점검 화면을 렌더한다', async () => {
    stubMaintenanceFetch(true)
    render(
      <MaintenanceProvider url={JSON_URL}>
        <div>실제 앱</div>
      </MaintenanceProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText('서비스 일시 중단 안내')).toBeDefined()
    })
    expect(screen.queryByText('실제 앱')).toBeNull()
  })

  it('점검 중 + 플래그 설정 → children을 렌더하고 bypassed를 노출한다', async () => {
    stubMaintenanceFetch(true)
    window.localStorage.setItem(DEFAULT_BYPASS_KEY, '1')
    render(
      <MaintenanceProvider url={JSON_URL}>
        <BypassedProbe />
      </MaintenanceProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText('bypassed:true')).toBeDefined()
    })
    expect(screen.queryByText('서비스 일시 중단 안내')).toBeNull()
  })

  it('bypass={false}면 플래그가 있어도 점검 화면을 렌더한다', async () => {
    stubMaintenanceFetch(true)
    window.localStorage.setItem(DEFAULT_BYPASS_KEY, '1')
    render(
      <MaintenanceProvider url={JSON_URL} bypass={false}>
        <div>실제 앱</div>
      </MaintenanceProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText('서비스 일시 중단 안내')).toBeDefined()
    })
    expect(screen.queryByText('실제 앱')).toBeNull()
  })

  it('커스텀 storageKey를 사용한다', async () => {
    stubMaintenanceFetch(true)
    window.localStorage.setItem('my-bypass', '1')
    render(
      <MaintenanceProvider url={JSON_URL} bypass={{ storageKey: 'my-bypass' }}>
        <div>실제 앱</div>
      </MaintenanceProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText('실제 앱')).toBeDefined()
    })
  })

  it('점검 아님이면 children을 렌더하고 bypassed는 false다', async () => {
    stubMaintenanceFetch(false)
    render(
      <MaintenanceProvider url={JSON_URL}>
        <BypassedProbe />
      </MaintenanceProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText('bypassed:false')).toBeDefined()
    })
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm vitest run src/react/index.test.tsx`
Expected: FAIL — `DEFAULT_BYPASS_KEY` export 없음 / `bypassed` 미노출 / bypass 미동작

- [ ] **Step 4: 구현** — `src/react/index.tsx`

core import·재노출 갱신:

```ts
import {
  checkMaintenance,
  isBypassActiveValue,
  resolveBypassStorageKey,
  type CheckMaintenanceOptions,
  type MaintenanceBypassOption,
  type MaintenanceInfo,
} from '../core'

export type {
  CheckMaintenanceOptions,
  MaintenanceBypassOption,
  MaintenanceInfo,
} from '../core'
export {
  checkMaintenance,
  isMaintenanceInfo,
  formatMaintenancePeriod,
  DEFAULT_BYPASS_KEY,
  isBypassActiveValue,
  resolveBypassStorageKey,
} from '../core'
```

컨텍스트·prop 타입 확장:

```ts
export interface MaintenanceContextValue {
  status: MaintenanceStatus
  info: MaintenanceInfo | null
  /** dev bypass 플래그로 점검 화면을 통과 중인지 여부 */
  bypassed: boolean
}

export interface MaintenanceProviderProps extends CheckMaintenanceOptions {
  children: ReactNode
  /** 점검 중일 때 children 대신 렌더링할 화면 (미지정 시 기본 화면) */
  fallback?: ReactNode
  /**
   * 개발자 통과(dev bypass) 설정.
   * - 생략/true: 기본 활성(기본 키), false: 비활성, { storageKey }: 키 커스텀
   */
  bypass?: MaintenanceBypassOption
}
```

`createContext` 기본값과 `useState` 초기값에 `bypassed: false` 추가.

localStorage 읽기 (컴포넌트 밖 모듈 레벨 함수):

```ts
/** 브라우저에서만 localStorage를 읽어 bypass 활성 여부를 판정한다 (SSR/저장소 오류 시 false) */
function readBypassActive(storageKey: string | null): boolean {
  if (storageKey === null || typeof window === 'undefined') return false
  try {
    return isBypassActiveValue(window.localStorage.getItem(storageKey))
  } catch {
    // 프라이버시 모드 등 저장소 접근 불가 시 통과 아님으로 처리
    return false
  }
}
```

Provider의 `useEffect`·렌더 조건 변경 (bypass 판정은 effect 실행 시 1회):

```tsx
useEffect(() => {
  let cancelled = false
  const bypassed = readBypassActive(resolveBypassStorageKey(bypass))
  checkMaintenance({ url, cacheBuster, fetchOptions })
    .then((info) => {
      if (!cancelled) {
        setValue({ status: info.isMaintenance ? 'maintenance' : 'up', info, bypassed })
      }
    })
    .catch(() => {
      // 상태 확인 실패 시에는 서비스를 막지 않는다 (fail-open)
      if (!cancelled) {
        setValue({ status: 'error', info: null, bypassed })
      }
    })
  return () => {
    cancelled = true
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [url])
```

```tsx
{value.status === 'maintenance' && !value.bypassed
  ? (fallback ?? <DefaultMaintenanceScreen info={value.info} />)
  : children}
```

`src/next/index.tsx` 재노출 목록에 추가: 값 `DEFAULT_BYPASS_KEY`, `isBypassActiveValue`, `resolveBypassStorageKey` / 타입 `MaintenanceBypassOption`.

- [ ] **Step 5: 전체 테스트·타입 검사 통과 확인**

Run: `pnpm test && pnpm typecheck`
Expected: 전체 PASS, 타입 에러 없음

- [ ] **Step 6: 커밋**

```bash
git add src/react/index.tsx src/react/index.test.tsx src/next/index.tsx package.json pnpm-lock.yaml
git commit -m "feat: MaintenanceProvider dev bypass 지원 추가" # + 트레일러
```

---

### Task 3: README 문서화 + 최종 검증

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1·2의 공개 API (`bypass` prop, `bypassed` 플래그, 기본 키)
- Produces: 사용자 문서

- [ ] **Step 1: README에 dev bypass 섹션 추가** — `## Usage` 섹션 뒤, `## API` 앞에 삽입

````markdown
## Dev bypass (개발자 통과)

점검 화면을 사용자에게 띄워둔 상태에서, 개발자가 배포 결과를 확인할 수 있도록
localStorage 플래그로 점검 화면을 통과할 수 있습니다. **기본 활성**이며 번들에
secret이 포함되지 않습니다.

브라우저 devtools 콘솔에서:

```js
// 통과 켜기 (새로고침 후 적용)
localStorage.setItem('maintenance-kit:bypass', '1')
// 통과 끄기
localStorage.removeItem('maintenance-kit:bypass')
```

설정:

```tsx
<MaintenanceProvider url="..." bypass={false}>                    // 기능 끄기
<MaintenanceProvider url="..." bypass={{ storageKey: 'my-key' }}> // 저장 키 변경
```

통과 중에는 `useMaintenance()`의 `bypassed`가 `true`이므로, 앱에서
"개발자 통과 모드" 배너를 직접 표시할 수 있습니다.

> ⚠️ 편의 기능이며 보안 경계가 아닙니다. 클라이언트에서만 검증하므로 키를 아는
> 사람은 누구나 통과할 수 있습니다. SSR·프라이버시 모드 등 localStorage를 읽을
> 수 없는 환경에서는 조용히 비활성 처리됩니다.
````

`## API` 목록 갱신:

```markdown
- `<MaintenanceProvider url fallback? bypass?>` — renders `fallback` (or a default screen) while `isMaintenance` is `true`; `bypass`로 dev bypass 제어
- `useMaintenance()` — read `{ status, info, bypassed }` from context
```

- [ ] **Step 2: 최종 검증**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: 모두 성공, `dist/`에 index/react/next 번들 생성

- [ ] **Step 3: 커밋**

```bash
git add README.md
git commit -m "docs: dev bypass 사용법 문서화" # + 트레일러
```
