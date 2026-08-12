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
])
