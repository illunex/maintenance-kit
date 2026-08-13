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

### Next.js

```tsx
import { MaintenanceProvider } from '@illunex-front/maintenance-kit/next'
```

> Next.js 전용 어댑터(SSR, 미들웨어 등)는 개발 중입니다.

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

## API

- `checkMaintenance({ url, cacheBuster?, fetchOptions? })` — fetch and validate the maintenance JSON
- `isMaintenanceInfo(value)` — type guard for the JSON shape
- `<MaintenanceProvider url fallback? bypass?>` — renders `fallback` (or a default screen) while `isMaintenance` is `true`; `bypass`로 dev bypass 제어
- `useMaintenance()` — read `{ status, info, bypassed }` from context

## License

MIT
