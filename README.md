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

## API

- `checkMaintenance({ url, cacheBuster?, fetchOptions? })` — fetch and validate the maintenance JSON
- `isMaintenanceInfo(value)` — type guard for the JSON shape
- `<MaintenanceProvider url fallback?>` — renders `fallback` (or a default screen) while `isMaintenance` is `true`
- `useMaintenance()` — read `{ status, info }` from context

## License

MIT
