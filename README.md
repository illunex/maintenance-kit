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

소스맵은 번들러에 따라 기본값이 다릅니다.

| 번들러 | 기본값 | 이유 |
| --- | --- | --- |
| Vite (`errorLoggerEnv`) | `build.sourcemap: 'hidden'` (켬) | `.map`은 만들되 번들에 `sourceMappingURL` 주석을 남기지 않아, 산출물만 배포하면 공개되지 않습니다 |
| Next (`withErrorLogger`) | 끔 | Next에는 `hidden`이 없어 켜면 `sourceMappingURL`까지 붙어 **`.map`이 그대로 공개**됩니다 |

Next에서 소스맵이 필요하면 아래 CI 절차를 먼저 갖춘 뒤 `withErrorLogger(config, { sourcemap: true })`로
명시해서 켜세요. Vite도 마찬가지로, **CI에서 `.map`을 비공개 저장소로 옮기고 배포
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

> `endpoint`는 **POST를 받는 수집 서버 주소**입니다. 점검 화면의
> `maintenance.json`과는 다른 주소이니 섞이지 않게 주의하세요.

전역 핸들러(`error`, `unhandledrejection`, 청크·리소스 로드 실패)가 걸리고,
페이지 이탈 시점에 남은 이벤트를 flush 합니다.

#### 리소스 로드 실패 걸러내기

깨진 이미지가 많은 서비스에서는 이미지 404가 세션 전송 예산(요청 3회)을 먼저
소진해 정작 봐야 할 에러를 놓칩니다. 그럴 때 리소스 수집을 끄거나 URL로 거릅니다.

```tsx
// 리소스 로드 실패를 아예 안 봄
<ErrorLogProvider captureResource={false}>

// 특정 버킷만 제외
<ErrorLogProvider ignoreResource={[/\.s3\.[^/]+\.amazonaws\.com\//]}>
```

두 옵션의 적용 범위가 다릅니다.

| 옵션 | 청크 로드 실패에도 적용되나 |
| --- | --- |
| `captureResource: false` | **아니오.** 어디를 끄는지 지정하지 않는 광범위한 스위치라, 청크까지 끌 의도는 아니라고 봅니다 |
| `ignoreResource` | **예.** 호출자가 URL을 콕 집어 지정한 것이므로 그대로 따릅니다 |

청크로 보는 범위는 **자기 오리진**의 다음 세 가지입니다. 나머지는 전부
`resource`로 남습니다.

| 대상 | 청크 |
| --- | --- |
| `<script src>` | ✅ |
| `<link rel="stylesheet">`, `<link rel="modulepreload">` | ✅ |
| `<link rel="preload" as="script">`, `as="style"` | ✅ |
| `<link rel="preload">`의 `as="image"`·`as="font"` | ❌ 코드가 아님 |
| `<link rel="prefetch">` | ❌ 코드를 싣는다는 보장이 없음 |
| 다른 오리진의 `<script>` (애널리틱스·광고 등) | ❌ stale chunk가 아님 |
| `<img>`, `<video>` 등 | ❌ |

`rel="icon"`·`manifest`는 Chrome에서 error 이벤트 자체가 발생하지 않아
어느 쪽으로도 수집되지 않습니다.

> 이 props는 `ErrorLoggerConfig`와 마찬가지로 **마운트 시점에 한 번만**
> 반영됩니다. 렌더 중에 값을 바꿔도 다시 적용되지 않습니다.

렌더 에러를 화면 단위로 잡으려면 `ErrorLogBoundary`를 함께 씁니다.

```tsx
import { ErrorLogBoundary } from '@illunex-front/maintenance-kit/logger/react'

<ErrorLogBoundary fallback={<ErrorScreen />} component="OrderDetail">
  <OrderDetail />
</ErrorLogBoundary>
```

React 없이 쓰려면 `@illunex-front/maintenance-kit/logger`의 `initErrorLogger`와
`captureError`를 직접 호출하면 됩니다.

#### 3. 사용자 정보 연결 (선택, 0.5.0~)

로그만 봐서는 "이게 몇 명에게 나는 에러인지", "문의한 그 사용자가 맞는지"를 알 수
없습니다. `getUser`로 넘기면 이벤트에 `user`·`plan`으로 실립니다.

식별자를 두는 곳이 프로젝트마다 달라(스토어·쿠키·응답 필드) 킷이 직접 읽지 않고
**앱이 함수로 넘기는** 방식입니다.

```tsx
// 식별자만
<ErrorLogProvider getUser={() => useMemberInfoStore.getState().memberId}>

// 요금제 등급까지
<ErrorLogProvider
  getUser={() => {
    const { memberId, license } = useMemberInfoStore.getState()
    return { id: memberId, plan: license.name }
  }}
>
```

값이 아니라 함수를 받는 이유는 **초기화가 앱 진입 시 1회**인데 로그인은 그 뒤에
일어나기 때문입니다. 정적 값으로 넘기면 로그인 이후 이벤트의 정보가 통째로 빕니다.
함수는 에러가 잡힌 순간마다 호출되므로 로그인·로그아웃·등급 변경이 그대로 반영되고,
함수가 던져도 수집은 멈추지 않습니다.

**`id`** 는 개인정보가 로그로 새지 않도록 `[A-Za-z0-9_-]` **64자 이내만** 통과합니다.

| 넘긴 `id` | 결과 |
| --- | --- |
| `10482`, `'user_123'`, UUID | 그대로 실림 |
| `'hong@example.com'` | 싣지 않고 경고 — 이메일 대신 회원 번호를 넘기세요 |
| `'010-1234-5678'` | 싣지 않고 경고 |
| 64자 초과·객체 | 싣지 않고 경고 |

**`plan`** 은 개인정보가 아니라 분류값이라 형태를 강제하지 않습니다. 한글·공백이
들어간 등급명(`'프리미엄 연간'`)을 그대로 쓰고, 값에 섞여 들어온 개인정보만 치환한
뒤 64자로 자릅니다.

### 전송 동작

| 항목 | 값 |
| --- | --- |
| 배치 / 플러시 | 20건 / 5초 (이탈 시 즉시) |
| 요청 1회 최대 | 48KB (초과 시 분할, 하드 상한 64KB) |
| 세션당 상한 | 이벤트 50건 / 요청 3회 |
| 중복 억제 | 동일 `fingerprint` 5건까지 본문 전송, 이후 발생분은 횟수만 누적해 다음 전송에 `count`로 합산 |
| 재시도 | 최대 1회, 2초 + 지터 (`429`는 `Retry-After` 준수, `4xx`는 재시도 안 함) |

평시에는 `fetch keepalive`로 보내고, 페이지 이탈 시점(`pagehide`·`visibilitychange`)에만
`sendBeacon`을 씁니다. beacon은 응답을 볼 수 없어 "브라우저 큐에 넣었다"까지만 알 수
있으므로, 평시 전송까지 beacon으로 보내면 위 재시도·`Retry-After` 정책이 통째로 죽습니다.
요청 크기 상한(48KB)도 beacon 할당량과 keepalive 본문 상한(각 64KB)에서 온 값입니다.

preflight를 피하려고 `Content-Type: text/plain;charset=UTF-8`로 보내므로 **서버가 이
타입을 허용해야** 합니다.

`limits`로 넘긴 값은 범위를 벗어나면 조정하고 경고를 남깁니다(`batchSize: 0`처럼
큐가 영영 비워지지 않는 값이 조용히 먹히지 않도록).

`endpoint`가 없으면 개발용 `consoleTransport`로 동작하고 콘솔에 경고를 남깁니다.
`service`·`env`를 확인할 수 없으면 수집을 시작하지 않고 역시 경고를 남깁니다 —
조용히 비활성되면 발견이 늦기 때문입니다.

### 스택 심볼화 (0.5.0~)

배포 번들은 압축돼 있어서 수집된 스택이 `at y (index-CtmyWNbP.js:13321:941)`처럼
남습니다. 어느 파일 몇 번째 줄인지 알 수 없으므로 소스맵으로 되돌려야 합니다.

```bash
pnpm exec maintenance-kit-symbolicate --maps ./dist/assets error.json
# 클립보드에서 바로
pbpaste | pnpm exec maintenance-kit-symbolicate --maps ./dist/assets
```

```
# em-stock-front · production · 356698d

[1] TypeError: Cannot read properties of undefined (reading '0')
    https://stocklink.ai/stock/034220  1920x1080  user=10482
TypeError: Cannot read properties of undefined (reading '0')
    at y (src/components/common/SearchSuggestions/SearchSuggestionsPopup/index.tsx:52:19)
    at handleOnEnter (src/components/common/SearchSuggestions/SearchSuggestionsPopup/index.tsx:89:22)
```

입력은 수집 로그 JSON(수집 서버가 감싼 봉투·`payload` 원본 둘 다)이거나 스택 원문입니다.
`--maps`는 `.map` 파일이 있는 폴더로, 하위 폴더까지 훑어 파일명으로 찾습니다.

**소스맵을 못 찾거나 매핑이 없는 줄은 원문 그대로 남깁니다.** 배포본이 섞여 일부 청크의
소스맵만 없을 때, 한 줄 때문에 나머지 스택까지 잃지 않기 위해서입니다.

`.map`은 **배포 산출물에서 지우고 비공개로 따로 보관**해야 합니다(위 CI 절차 참고).
공개된 채로 두면 원본 코드가 그대로 복원됩니다.

라이브러리로도 쓸 수 있습니다.

```ts
import { symbolicateStack } from '@illunex-front/maintenance-kit/symbolicate'

symbolicateStack(event.stack, (fileName) => loadMap(fileName))
```

`source-map` 패키지를 쓰지 않고 디코더를 직접 구현했습니다. 이 킷은 런타임 의존성이
0개인데 CLI 하나 때문에 앱 전체에 의존성을 늘릴 이유가 없고, `source-map` 0.7부터는
wasm 초기화가 필요해 CLI에서 다루기 번거롭습니다.

### 전송 필드 (schemaVersion 2)

봉투에 세션 내내 고정인 값을, 이벤트에 발생 시점마다 달라지는 값을 담습니다.
UA를 이벤트마다 반복해 실으면 요청 예산(48KB)을 그것만으로 20% 넘게 씁니다.

```jsonc
{
  "schemaVersion": 2,
  "service": "em-stock-front",
  "env": "production",
  "release": "356698d",        // 소스맵 심볼화의 조인 키
  "sessionId": "MTQJPEI1OJH2TKBU",
  "client": {                   // 0.5.0~
    "userAgent": "Mozilla/5.0 (Windows NT 10.0; ...) Chrome/153.0.0.0 ...",
    "browser": "Chrome 153",
    "os": "Windows 10+"
  },
  "events": [
    {
      "type": "error",
      "name": "TypeError",
      "message": "Cannot read properties of undefined (reading '0')",
      "stack": "...",
      "url": "https://stocklink.ai/stock/034220",
      "viewport": "1920x1080",  // 0.5.0~ 모바일 폭에서만 나는 에러를 가른다
      "user": "10482",          // 0.5.0~ getUser()를 설정한 경우에만
      "plan": "프리미엄",         // 0.5.0~ getUser().plan을 넘긴 경우에만
      "fingerprint": "050c9f94",
      "count": 1,
      "context": { "route": "/stock/034220" }
    }
  ]
}
```

`browser`·`os`는 UA가 **보장하는 범위까지만** 적습니다. Windows 10과 11은 UA에서
구분되지 않아(둘 다 `NT 10.0`) `Windows 10+`로, macOS는 Safari가 `10_15_7`로 고정
보고해 버전 없이 `macOS`로 남깁니다. 규칙이 못 잡은 브라우저는 `client.userAgent`
원문으로 서버에서 다시 볼 수 있습니다.

`schemaVersion` 2는 **필드 추가만** 있고 없어진 필드가 없어, 1을 읽던 수집 스택은
그대로 동작합니다.

### 개인정보 처리

전송 필드는 고정되어 있고, 값에서 이메일·전화번호·주민등록번호·카드번호·JWT·Bearer
토큰을 치환합니다. 이메일은 `%40`으로 URL 인코딩된 형태도 잡습니다 — 프로필 이미지
URL처럼 경로에 인코딩돼 들어오면 평문 패턴을 그냥 통과하기 때문입니다.

`url`은 쿼리스트링을 제거한 뒤 path까지 같은 치환을 거치며
(`/users/hong@example.com` → `/users/[email]`), `context`는 `route`·`component`
두 키만 통과시킵니다.

#### 쿼리 파라미터 남기기 (0.6.0~)

`/insight?tab=momentum`처럼 탭·모드가 쿼리에 있는 화면은 쿼리를 통째로 버리면
어느 화면에서 난 에러인지 알 수 없습니다. 키를 콕 집어 남길 수 있습니다.

```tsx
<ErrorLogProvider keepQueryParams={["tab"]}>
```

```
url:   https://stocklink.ai/insight?tab=momentum
route: /insight?tab=momentum
```

지정하지 않은 키는 그대로 버려집니다(`?tab=momentum&token=abc` → `?tab=momentum`).
남긴 값도 개인정보 치환을 거치지만, **애초에 개인정보가 들어갈 수 있는 키는 넣지 마세요.**
남기는 순서는 배열 순서를 따릅니다 — 같은 화면이 매번 같은 문자열이어야 로그를 묶어 볼 수 있습니다.

#### 쿼리 파라미터 값 지우기 (0.6.0~)

`keepQueryParams`는 `url`·`route`만 다룹니다. 실제로 새는 자리는 **`message`와 `stack`** 입니다.

```
message: "Failed to fetch /auth/verify?certData=eyJhbGci...&code=abc"
```

URL이 통째로 에러 메시지에 들어오면 쿼리 제거가 손대지 못합니다. 이런 값은 키 이름으로 지웁니다.

기본으로 지우는 키입니다.

```
token  accessToken  access_token  refreshToken  refresh_token
idToken  id_token  code  state  secret  password  passwd  pwd
apiKey  api_key  sig  signature  session  sessionId  auth
```

회사·서비스 고유 이름은 앱이 추가합니다. **기본 목록에 더해지며, 덮어쓰지 않습니다.**

```tsx
<ErrorLogProvider redactQueryParams={["certData", "oauthTokenKey"]}>
```

```
전: /auth/verify?certData=eyJhbGci...
후: /auth/verify?certData=[redacted]
```

키 이름 denylist는 원래 놓치는 게 많아 쓰지 않지만, 쿼리스트링은 `key=value` 형태가
고정이라 이 방식이 정확하게 동작하는 드문 자리입니다. `keyword=`처럼 앞부분만 겹치는
다른 파라미터는 건드리지 않습니다. `getUser().id`로 넘긴 회원 식별자는 `[A-Za-z0-9_-]` 64자 이내이면서
전화번호·주민등록번호 형태가 아닐 때만 실립니다(`plan`은 분류값이라 형태를 강제하지 않고 값 치환만 거칩니다).

`Error`가 아닌 **객체가 throw되면 값이 아니라 형태만** 남깁니다
(`Object 객체가 throw됨: status=500 (keys: status, body)`). 통째로 직렬화하면
`{ password }`나 API 응답 body처럼 키에 의미가 있는 비밀값이 값 패턴 치환을 그대로
통과하기 때문입니다. `name`·`message`·`code`·`status`만 값까지 싣고, 더 필요한 값은
`context`로 명시해 올리세요. `sessionId`는 방문(탭) 단위 무작위 값으로 `sessionStorage`에만
보관하며 계정과 연결되지 않습니다.

## API

- `checkMaintenance({ url, cacheBuster?, fetchOptions? })` — fetch and validate the maintenance JSON
- `isMaintenanceInfo(value)` — type guard for the JSON shape
- `<MaintenanceProvider url fallback? loading? loadingBackground? bypass?>` — renders `fallback` (or a default screen) while `isMaintenance` is `true`; 로딩 중에는 `loading`(기본 빈 화면)을 렌더해 점검 플래시를 방지, `loadingBackground`로 빈 화면 배경색 지정(다크 모드 서비스 테마 통일용); `bypass`로 dev bypass 제어
- `<MaintenanceGate url fallback? bypass?>` (`/next/server`) — 서버 컴포넌트 게이트, SSR에서 점검 화면을 HTML로 렌더 (bypass는 쿠키)
- `useMaintenance()` — read `{ status, info, bypassed }` from context

### 에러 로거

- `initErrorLogger(config)` / `captureError({ error, type?, level?, context? })` / `flushErrorLogs()` (`/logger`) — `config.getUser`로 회원 식별자·요금제 등급 연결
- `<ErrorLogProvider getUser? keepQueryParams? redactQueryParams? captureResource? ignoreResource?>` · `<ErrorLogBoundary>` · `installGlobalHandlers()` (`/logger/react`)
- `errorLoggerEnv(options?)` (`/vite`) · `withErrorLogger(nextConfig, options?)` (`/next/config`)
- `consoleTransport()` · `httpTransport(endpoint)` — 전송 경로 교체용
- `symbolicateStack(stack, resolve)` (`/symbolicate`) · `maintenance-kit-symbolicate --maps <폴더>` — 압축된 스택을 원본 위치로 복원

## License

MIT
