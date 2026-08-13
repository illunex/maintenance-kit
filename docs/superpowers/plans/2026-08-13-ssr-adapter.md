# SSR 어댑터 + 로딩 차단 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 클라이언트 로딩 중 앱 노출(점검 플래시)을 차단하고, 서버에서 JSON을 읽어 HTML로 점검 화면을 내려보내는 Next.js SSR 게이트를 추가한다.

**Architecture:** 기본 bypass 키를 쿠키 호환 이름으로 통일하고, 클라이언트 Provider에 `loading` 렌더 단계를 추가한다. 서버 컴포넌트 `MaintenanceGate`는 배너 없는 새 tsup 엔트리(`next-server`)로 빌드하며, `next/headers` 쿠키로 bypass를 판정한다.

**Tech Stack:** TypeScript(strict), React Server Components, Next.js(next/headers), vitest + jsdom + @testing-library/react, tsup

**Spec:** `docs/superpowers/specs/2026-08-13-ssr-adapter-design.md`

## Global Constraints

- 패키지 매니저 `pnpm`만 사용, `any` 금지, 주석·테스트 설명 한국어
- 통일 bypass 키: `'maintenance-kit-bypass'` (localStorage + 쿠키 공용)
- fail-open 원칙 유지: 조회 실패 시 children 렌더
- 커밋: `type: 한국어 명사형` + 트레일러 2줄 (기존과 동일)

---

### Task 1: bypass 키 통일

**Files:**
- Modify: `src/core/bypass.ts` (키 값 변경)
- Modify: `src/core/bypass.test.ts` (계약 고정 테스트 추가)
- Modify: `README.md` (키 표기 2곳)

**Interfaces:**
- Produces: `DEFAULT_BYPASS_KEY === 'maintenance-kit-bypass'` (이후 태스크·문서가 의존)

- [ ] **Step 1: 계약 고정 테스트 추가** — `src/core/bypass.test.ts`의 `resolveBypassStorageKey` describe 안에

```ts
it('기본 키는 쿠키 이름으로도 쓸 수 있는 형태다', () => {
  expect(DEFAULT_BYPASS_KEY).toBe('maintenance-kit-bypass')
})
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm vitest run src/core/bypass.test.ts` / Expected: FAIL (`'maintenance-kit:bypass'` ≠ `'maintenance-kit-bypass'`)

- [ ] **Step 3: 키 변경** — `src/core/bypass.ts`

```ts
/** dev bypass 플래그를 저장하는 기본 키 (localStorage·쿠키 공용, 쿠키 이름 제약상 ':' 불가) */
export const DEFAULT_BYPASS_KEY = 'maintenance-kit-bypass'
```

README의 `maintenance-kit:bypass` 표기(setItem/removeItem 2곳)를 `maintenance-kit-bypass`로 변경.

- [ ] **Step 4: 통과 확인** — Run: `pnpm test` / Expected: 전체 PASS
- [ ] **Step 5: 커밋** — `fix: bypass 기본 키를 쿠키 호환 이름으로 통일`

---

### Task 2: 클라이언트 Provider 로딩 차단

**Files:**
- Modify: `src/react/index.tsx`
- Modify: `src/react/index.test.tsx`

**Interfaces:**
- Produces: `MaintenanceProviderProps.loading?: ReactNode` (기본 `null`)

- [ ] **Step 1: 실패하는 테스트 추가** — `src/react/index.test.tsx`의 describe 안에

```tsx
it('로딩 중에는 children을 렌더하지 않는다 (점검 플래시 방지)', () => {
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
  render(
    <MaintenanceProvider url={JSON_URL}>
      <div>실제 앱</div>
    </MaintenanceProvider>,
  )
  expect(screen.queryByText('실제 앱')).toBeNull()
})

it('loading prop 지정 시 로딩 중 해당 화면을 렌더한다', () => {
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
  render(
    <MaintenanceProvider url={JSON_URL} loading={<div>확인 중…</div>}>
      <div>실제 앱</div>
    </MaintenanceProvider>,
  )
  expect(screen.getByText('확인 중…')).toBeDefined()
  expect(screen.queryByText('실제 앱')).toBeNull()
})
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm vitest run src/react/index.test.tsx` / Expected: 새 테스트 2개 FAIL (로딩 중 children 렌더됨)

- [ ] **Step 3: 구현** — `src/react/index.tsx`

Props에 추가:

```ts
/** 상태 확인 중(loading)에 렌더링할 화면 (기본 null — 아무것도 표시하지 않음) */
loading?: ReactNode
```

컴포넌트 시그니처에 `loading` 구조분해 추가, 렌더 조건 변경:

```tsx
<MaintenanceContext.Provider value={value}>
  {value.status === 'loading'
    ? (loading ?? null)
    : value.status === 'maintenance' && !value.bypassed
      ? (fallback ?? <DefaultMaintenanceScreen info={value.info} />)
      : children}
</MaintenanceContext.Provider>
```

- [ ] **Step 4: 통과 확인** — Run: `pnpm test && pnpm typecheck` / Expected: 전체 PASS
- [ ] **Step 5: 커밋** — `feat: 로딩 중 children 차단 및 loading prop 추가`

---

### Task 3: SSR 게이트 (`/next/server`)

**Files:**
- Create: `src/next-server/index.tsx`
- Create: `src/next-server/index.test.tsx`
- Modify: `tsup.config.ts` (엔트리 추가)
- Modify: `package.json` (exports `./next/server`, devDep `next`)

**Interfaces:**
- Consumes: `checkMaintenance`, `resolveBypassStorageKey`, `isBypassActiveValue`, `MaintenanceBypassOption` (`../core`), `DefaultMaintenanceScreen` (`../react/default-screen`)
- Produces: `MaintenanceGate(props: MaintenanceGateProps): Promise<ReactElement>`, `MaintenanceGateProps`

- [ ] **Step 1: devDep 설치** — Run: `pnpm add -D next`

- [ ] **Step 2: 실패하는 테스트 작성** — `src/next-server/index.test.tsx`

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MaintenanceGate } from './index'
import { DEFAULT_BYPASS_KEY } from '../core'

const JSON_URL = 'https://example.com/maintenance.json'

/** next/headers의 cookies()를 테스트용 인메모리 스토어로 대체한다 */
const cookieStore = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name)
      return value === undefined ? undefined : { name, value }
    },
  }),
}))

function stubMaintenanceFetch(isMaintenance: boolean) {
  const mock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ isMaintenance }),
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  cookieStore.clear()
})

describe('MaintenanceGate', () => {
  it('점검 중이면 점검 화면을 렌더하고 children을 렌더하지 않는다', async () => {
    stubMaintenanceFetch(true)
    render(await MaintenanceGate({ url: JSON_URL, children: <div>실제 앱</div> }))
    expect(screen.getByText('서비스 일시 중단 안내')).toBeDefined()
    expect(screen.queryByText('실제 앱')).toBeNull()
  })

  it('점검 중 + bypass 쿠키가 있으면 children을 렌더한다', async () => {
    stubMaintenanceFetch(true)
    cookieStore.set(DEFAULT_BYPASS_KEY, '1')
    render(await MaintenanceGate({ url: JSON_URL, children: <div>실제 앱</div> }))
    expect(screen.getByText('실제 앱')).toBeDefined()
  })

  it('점검 아니면 children을 렌더한다', async () => {
    stubMaintenanceFetch(false)
    render(await MaintenanceGate({ url: JSON_URL, children: <div>실제 앱</div> }))
    expect(screen.getByText('실제 앱')).toBeDefined()
  })

  it('조회 실패 시 children을 렌더한다 (fail-open)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    render(await MaintenanceGate({ url: JSON_URL, children: <div>실제 앱</div> }))
    expect(screen.getByText('실제 앱')).toBeDefined()
  })

  it('fetch에 cache: no-store를 전달한다', async () => {
    const mock = stubMaintenanceFetch(false)
    await MaintenanceGate({ url: JSON_URL, children: null })
    expect(mock).toHaveBeenCalledWith(
      expect.stringContaining(JSON_URL),
      expect.objectContaining({ cache: 'no-store' }),
    )
  })
})
```

- [ ] **Step 3: 실패 확인** — Run: `pnpm vitest run src/next-server/index.test.tsx` / Expected: FAIL (모듈 없음)

- [ ] **Step 4: 구현** — `src/next-server/index.tsx`

```tsx
import type { ReactElement, ReactNode } from 'react'
import {
  checkMaintenance,
  isBypassActiveValue,
  resolveBypassStorageKey,
  type CheckMaintenanceOptions,
  type MaintenanceBypassOption,
  type MaintenanceInfo,
} from '../core'
import { DefaultMaintenanceScreen } from '../react/default-screen'

export type {
  CheckMaintenanceOptions,
  MaintenanceBypassOption,
  MaintenanceInfo,
} from '../core'
export { checkMaintenance, isMaintenanceInfo, DEFAULT_BYPASS_KEY } from '../core'

export interface MaintenanceGateProps extends CheckMaintenanceOptions {
  children: ReactNode
  /** 점검 중일 때 children 대신 렌더링할 화면 (미지정 시 기본 화면) */
  fallback?: ReactNode
  /** dev bypass 설정 — 키는 쿠키 이름으로 사용 (기본 'maintenance-kit-bypass') */
  bypass?: MaintenanceBypassOption
}

/** 요청 쿠키에서 bypass 활성 여부를 판정한다 (요청 컨텍스트 밖·Next 아닌 환경에서는 false) */
async function readBypassCookie(cookieName: string | null): Promise<boolean> {
  if (cookieName === null) return false
  try {
    const { cookies } = await import('next/headers')
    const store = await cookies()
    return isBypassActiveValue(store.get(cookieName)?.value ?? null)
  } catch {
    return false
  }
}

/**
 * 서버에서 점검 상태를 판정해 점검 화면 또는 children을 렌더하는 게이트.
 * HTML 자체가 점검 화면으로 내려가므로 클라이언트 플래시가 없고 CORS 설정도 불필요하다.
 */
export async function MaintenanceGate({
  url,
  cacheBuster,
  fetchOptions,
  fallback,
  bypass,
  children,
}: MaintenanceGateProps): Promise<ReactElement> {
  let info: MaintenanceInfo
  try {
    info = await checkMaintenance({
      url,
      cacheBuster,
      // 요청마다 최신 상태를 읽도록 Next fetch 캐시를 끈다 (사용자 fetchOptions가 우선)
      fetchOptions: { cache: 'no-store', ...fetchOptions },
    })
  } catch {
    // 상태 확인 실패 시에는 서비스를 막지 않는다 (fail-open)
    return <>{children}</>
  }
  if (!info.isMaintenance) {
    return <>{children}</>
  }
  const bypassed = await readBypassCookie(resolveBypassStorageKey(bypass))
  if (bypassed) {
    return <>{children}</>
  }
  return <>{fallback ?? <DefaultMaintenanceScreen info={info} />}</>
}
```

`tsup.config.ts` 배열에 추가 (배너 없음 — 서버 컴포넌트):

```ts
{
  ...shared,
  entry: { 'next-server': 'src/next-server/index.tsx' },
},
```

`package.json` exports에 `"./next"` 다음 위치로 추가:

```json
"./next/server": {
  "import": {
    "types": "./dist/next-server.d.ts",
    "default": "./dist/next-server.js"
  },
  "require": {
    "types": "./dist/next-server.d.cts",
    "default": "./dist/next-server.cjs"
  }
},
```

- [ ] **Step 5: 통과 확인** — Run: `pnpm test && pnpm typecheck && pnpm build` / Expected: 전체 PASS, `dist/next-server.*` 생성
- [ ] **Step 6: 커밋** — `feat: SSR 점검 게이트(MaintenanceGate) 추가`

---

### Task 4: README + 버전 범프 + 최종 검증

**Files:**
- Modify: `README.md`
- Modify: `package.json` (version 0.2.0)

- [ ] **Step 1: README 개편**
  - Next.js 섹션: "개발 중" 문구 제거, `MaintenanceGate` layout.tsx 사용 예시 + "SSR이라 플래시 없음·CORS 불필요" 설명. 클라이언트 Provider(`/next`)도 계속 사용 가능함 명시.
  - Dev bypass 섹션: SSR용 쿠키 방법 추가 (`document.cookie = 'maintenance-kit-bypass=1; path=/'` / 해제 `max-age=0`), SSR 게이트에서는 `useMaintenance()` 미제공 명시.
  - `loading` prop 문서화: 로딩 중 기본 빈 화면(차단), 커스텀 가능.
  - API 목록에 `MaintenanceGate` 추가.
- [ ] **Step 2: 버전 범프** — `package.json` version을 `0.2.0`으로.
- [ ] **Step 3: 최종 검증** — Run: `pnpm typecheck && pnpm test && pnpm build` / Expected: 모두 성공
- [ ] **Step 4: 커밋** — `docs: SSR 게이트·loading 문서화 및 0.2.0 버전 범프`
