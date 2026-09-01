# @illunex-front/maintenance-kit

Maintenance mode provider for **React**, **Next.js** and **vanilla JS**.

Point it at a remote JSON endpoint — when maintenance is enabled, your app shows a maintenance screen instead of its content.

## Install

```bash
pnpm add @illunex-front/maintenance-kit
```

## Maintenance JSON format

Host a JSON file anywhere (S3, CDN, GitHub, ...):

```json
{
  "isMaintenance": true,
  "title": "시스템 정기 점검 안내",
  "startTime": "2026-08-15 11:00:00",
  "endTime": "2026-08-16 13:00:00"
}
```

Only `isMaintenance` is required. The maintenance screen is shown while `isMaintenance` is `true`; `startTime`/`endTime` are display-only.

Requests automatically append a `?t=<timestamp>` cache buster so S3/CDN caching never serves a stale status (disable with `cacheBuster: false`).

## Usage

### Vanilla JS

```ts
import { checkMaintenance } from '@illunex-front/maintenance-kit'

const info = await checkMaintenance({ url: 'https://cdn.example.com/maintenance.json' })
if (info.isMaintenance) {
  // 점검 화면 렌더링
}
```

### React

```tsx
import { MaintenanceProvider } from '@illunex-front/maintenance-kit/react'

export function App() {
  return (
    <MaintenanceProvider url="https://cdn.example.com/maintenance.json">
      <YourApp />
    </MaintenanceProvider>
  )
}
```

### Next.js (SSR — 권장)

서버가 렌더 전에 점검 JSON을 읽고 **HTML 자체를 점검 화면으로 내려보냅니다.**
클라이언트 플래시(앱이 잠깐 보였다가 점검 화면으로 바뀌는 현상)가 원천 차단되고,
서버 fetch라 **S3 CORS 설정도 불필요**합니다. App Router 전용.

```tsx
// app/layout.tsx (서버 컴포넌트)
import { MaintenanceGate } from '@illunex-front/maintenance-kit/next/server'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <MaintenanceGate url="https://cdn.example.com/maintenance.json">
          {children}
        </MaintenanceGate>
      </body>
    </html>
  )
}
```

요청마다 `cache: 'no-store'`로 최신 상태를 읽습니다. SSR 게이트 모드에서는
`useMaintenance()` 컨텍스트가 제공되지 않으며, 필요하면 클라이언트 Provider를 병용하세요.
Pages Router는 `checkMaintenance`를 `getServerSideProps`에서 직접 사용하면 됩니다.

클라이언트 사이드 체크만 필요하면 기존 Provider도 그대로 사용할 수 있습니다:

```tsx
import { MaintenanceProvider } from '@illunex-front/maintenance-kit/next'
```

## Dev bypass (개발자 통과)

점검 화면을 사용자에게 띄워둔 상태에서, 개발자가 배포 결과를 확인할 수 있도록
localStorage 플래그로 점검 화면을 통과할 수 있습니다. **기본 활성**이며 번들에
secret이 포함되지 않습니다.

브라우저 devtools 콘솔에서 (새로고침 후 적용):

```js
// 클라이언트 Provider용 (localStorage)
localStorage.setItem('maintenance-kit-bypass', '1')
localStorage.removeItem('maintenance-kit-bypass')

// SSR MaintenanceGate용 (쿠키 — 서버는 localStorage를 읽을 수 없음)
document.cookie = 'maintenance-kit-bypass=1; path=/'
document.cookie = 'maintenance-kit-bypass=; path=/; max-age=0'
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

## 에러 로그 수집 (0.3.0~)

프론트에서 발생한 에러를 수집 엔드포인트로 보냅니다. 점검 모드와 독립된 서브패스라
`import` 하지 않으면 번들에 포함되지 않습니다.

### 1. 빌드 플러그인 추가 (리포당 한 줄)

`service`·`env`·`release`를 빌드 시점에 자동으로 채웁니다.
**앱에서 환경변수를 직접 넣을 필요가 없습니다.**

```ts
// vite.config.ts
import { errorLoggerEnv } from '@illunex-front/maintenance-kit/vite'

export default defineConfig({ plugins: [react(), errorLoggerEnv()] })
```

```js
// next.config.js
const { withErrorLogger } = require('@illunex-front/maintenance-kit/next/config')

module.exports = withErrorLogger(nextConfig)
```

판별 우선순위는 아래와 같고, 모두 실패하면 플러그인 옵션으로 직접 넘길 수 있습니다.

| 값 | 출처 |
| --- | --- |
| `service` | `GITHUB_REPOSITORY` → `git remote origin` 이름 |
| `env` | `AWS_BRANCH` → `GITHUB_REF_NAME` → `VERCEL_GIT_COMMIT_REF` → `git rev-parse` |
| `release` | `AWS_COMMIT_ID` → `GITHUB_SHA` → `VERCEL_GIT_COMMIT_SHA` → `git rev-parse` |

`package.json`의 `name`은 템플릿에서 복사된 채로 남아 있는 경우가 많아 쓰지 않습니다.

브랜치는 `main`→`production`, `dev`→`development`, `release/*`→`staging`으로 매핑되고
그 외에는 브랜치명이 그대로 남습니다(`resolveEnv` 옵션으로 변경 가능).

플러그인은 `build.sourcemap: 'hidden'`도 함께 켭니다. `.map`은 만들되 번들에
`sourceMappingURL` 주석을 남기지 않으므로, **CI에서 비공개 저장소로 옮기고 배포
산출물에서 지워야** 소스맵 보안이 완성됩니다.

```yaml
- pnpm build
- aws s3 cp dist s3://<bucket>/$SERVICE/$AWS_COMMIT_ID/ --recursive --exclude "*" --include "*.map"
- find dist -name "*.map" -delete
```

### 2. Provider로 감싸기

```tsx
import { ErrorLogProvider } from '@illunex-front/maintenance-kit/logger/react'

<ErrorLogProvider endpoint="https://logs.example.com/ingest">
  <App />
</ErrorLogProvider>
```

전역 핸들러(`error`, `unhandledrejection`, 청크·리소스 로드 실패)가 걸리고,
페이지 이탈 시점에 남은 이벤트를 flush 합니다.

렌더 에러를 화면 단위로 잡으려면 `ErrorLogBoundary`를 함께 씁니다.

```tsx
import { ErrorLogBoundary } from '@illunex-front/maintenance-kit/logger/react'

<ErrorLogBoundary fallback={<ErrorScreen />} component="OrderDetail">
  <OrderDetail />
</ErrorLogBoundary>
```

React 없이 쓰려면 `@illunex-front/maintenance-kit/logger`의 `initErrorLogger`와
`captureError`를 직접 호출하면 됩니다.

### 전송 동작

| 항목 | 값 |
| --- | --- |
| 배치 / 플러시 | 20건 / 5초 (이탈 시 즉시) |
| 요청 1회 최대 | 256KB (초과 시 분할) |
| 세션당 상한 | 이벤트 50건 / 요청 3회 |
| 중복 억제 | 동일 `fingerprint` 5건까지 본문 전송, 이후 발생분은 횟수만 누적해 다음 전송에 `count`로 합산 |
| 재시도 | 최대 1회, 2초 + 지터 (`429`는 `Retry-After` 준수, `4xx`는 재시도 안 함) |

`sendBeacon`을 우선 사용하고 실패 시 `fetch keepalive`로 폴백합니다. preflight를
피하려고 `Content-Type: text/plain;charset=UTF-8`로 보내므로 **서버가 이 타입을
허용해야** 합니다.

`endpoint`가 없으면 개발용 `consoleTransport`로 동작하고 콘솔에 경고를 남깁니다.
`service`·`env`를 확인할 수 없으면 수집을 시작하지 않고 역시 경고를 남깁니다 —
조용히 비활성되면 발견이 늦기 때문입니다.

### 개인정보 처리

전송 필드는 고정되어 있고, 값에서 이메일·전화번호·주민등록번호·카드번호·JWT·Bearer
토큰을 치환합니다. `url`은 쿼리스트링을 제거해서 보내며, `context`는 `route`·`component`
두 키만 통과시킵니다. `sessionId`는 방문(탭) 단위 무작위 값으로 `sessionStorage`에만
보관하며 계정과 연결되지 않습니다.

## API

- `checkMaintenance({ url, cacheBuster?, fetchOptions? })` — fetch and validate the maintenance JSON
- `isMaintenanceInfo(value)` — type guard for the JSON shape
- `<MaintenanceProvider url fallback? loading? loadingBackground? bypass?>` — renders `fallback` (or a default screen) while `isMaintenance` is `true`; 로딩 중에는 `loading`(기본 빈 화면)을 렌더해 점검 플래시를 방지, `loadingBackground`로 빈 화면 배경색 지정(다크 모드 서비스 테마 통일용); `bypass`로 dev bypass 제어
- `<MaintenanceGate url fallback? bypass?>` (`/next/server`) — 서버 컴포넌트 게이트, SSR에서 점검 화면을 HTML로 렌더 (bypass는 쿠키)
- `useMaintenance()` — read `{ status, info, bypassed }` from context

### 에러 로거

- `initErrorLogger(config)` / `captureError({ error, type?, level?, context? })` / `flushErrorLogs()` (`/logger`)
- `<ErrorLogProvider>` · `<ErrorLogBoundary>` · `installGlobalHandlers()` (`/logger/react`)
- `errorLoggerEnv(options?)` (`/vite`) · `withErrorLogger(nextConfig, options?)` (`/next/config`)
- `consoleTransport()` · `beaconTransport(endpoint)` — 전송 경로 교체용

## License

MIT
