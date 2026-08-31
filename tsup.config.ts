import { defineConfig, type Options } from 'tsup'

const shared: Options = {
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: false,
  external: ['react', 'react-dom', 'next'],
}

export default defineConfig([
  {
    ...shared,
    entry: { index: 'src/core/index.ts' },
  },
  // react/next 번들에는 Context 기반 Provider가 포함되므로
  // Next.js App Router에서 바로 import할 수 있도록 'use client' 배너를 붙인다.
  {
    ...shared,
    entry: { react: 'src/react/index.tsx' },
    banner: { js: "'use client';" },
  },
  {
    ...shared,
    entry: { next: 'src/next/index.tsx' },
    banner: { js: "'use client';" },
  },
  // 서버 컴포넌트 게이트 — 'use client' 배너를 붙이면 안 된다
  {
    ...shared,
    entry: { 'next-server': 'src/next-server/index.tsx' },
  },
  // 에러 로거 코어 — react 비의존이라 vanilla JS에서도 쓸 수 있다
  {
    ...shared,
    entry: { logger: 'src/logger/index.ts' },
  },
  {
    ...shared,
    entry: { 'logger-react': 'src/logger-react/index.tsx' },
    banner: { js: "'use client';" },
  },
  // 빌드 플러그인 — 번들러에서만 도는 Node 코드다
  {
    ...shared,
    entry: { vite: 'src/vite/index.ts' },
    platform: 'node',
  },
  {
    ...shared,
    entry: { 'next-config': 'src/next-config/index.ts' },
    platform: 'node',
  },
])
