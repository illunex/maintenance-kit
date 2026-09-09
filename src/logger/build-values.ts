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
  /**
   * 로컬 dev 서버 표식.
   * 값 판별(git 호출)을 건너뛴 빌드라는 뜻이지, 판별에 실패했다는 뜻이 아니다.
   */
  dev?: boolean
}

/**
 * 주입된 빌드 값을 읽는다. 상수 자체가 없으면 undefined.
 *
 * 빈 객체가 아니라 undefined를 돌려주는 이유는 "플러그인이 값을 심었는데 비어 있다"와
 * "플러그인이 아예 안 돌았다"를 런타임에서 갈라야 하기 때문이다.
 * 앞은 배포 설정 실수라 경고해야 하고, 뒤는 로컬 dev 서버의 정상 상태라 조용해야 한다.
 */
export function readBuildValues(): BuildValues | undefined {
  try {
    if (typeof __MK_LOGGER_BUILD__ === 'undefined') return undefined
    return __MK_LOGGER_BUILD__
  } catch {
    return undefined
  }
}
