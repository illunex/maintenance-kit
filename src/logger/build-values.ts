/**
 * 빌드 플러그인이 `define`으로 심어주는 값.
 * Vite와 Next가 섞여 있어 `import.meta.env`도 `process.env`도 직접 읽을 수 없다.
 * 플러그인을 안 쓰면 이 상수 자체가 없으므로 typeof 가드로 접근한다.
 */
declare const __MK_LOGGER_BUILD__: BuildValues | undefined

export interface BuildValues {
  service?: string
  env?: string
  release?: string
  endpoint?: string
}

export function readBuildValues(): BuildValues {
  try {
    if (typeof __MK_LOGGER_BUILD__ === 'undefined') return {}
    return __MK_LOGGER_BUILD__ ?? {}
  } catch {
    return {}
  }
}
