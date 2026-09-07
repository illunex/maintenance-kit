/**
 * 소스맵 mappings 디코더.
 *
 * source-map 패키지를 쓰지 않는 이유는 두 가지다. 이 킷은 런타임 의존성이 0개인데
 * CLI 하나 때문에 앱 전체에 의존성을 하나 늘리게 되고, 0.7부터는 wasm을 초기화해야 해서
 * CLI에서 다루기 번거롭다. mappings 규격은 아래 구현으로 충분히 덮인다.
 */

const BASE64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const CHAR_TO_INT = new Map<string, number>(
  [...BASE64].map((char, index) => [char, index]),
)

/**
 * Base64 VLQ 한 값을 읽는다.
 * 6비트씩 끊어 담고 최상위 비트가 "다음 조각이 있다"는 표시, 최하위 비트가 부호다.
 */
function decodeVlq(
  segment: string,
  start: number,
): { value: number; next: number } | null {
  let result = 0
  let shift = 0
  let index = start

  for (;;) {
    const char = segment[index]
    if (char === undefined) return null
    const digit = CHAR_TO_INT.get(char)
    if (digit === undefined) return null
    index += 1

    result += (digit & 31) << shift
    shift += 5
    if ((digit & 32) === 0) break
  }

  const negative = (result & 1) === 1
  const value = result >> 1
  return { value: negative ? -value : value, next: index }
}

export interface SourceMap {
  version: number
  sources: string[]
  names?: string[]
  mappings: string
  sourceRoot?: string
}

export interface OriginalPosition {
  source: string
  /** 1부터 시작 (에디터 표기와 맞춘다) */
  line: number
  column: number
  name?: string
}

interface Segment {
  generatedColumn: number
  sourceIndex: number
  originalLine: number
  originalColumn: number
  nameIndex: number
}

/**
 * 특정 생성 줄의 세그먼트만 디코딩한다.
 * 스택 한 줄을 풀자고 수만 줄짜리 mappings를 통째로 디코딩할 이유가 없다.
 * 값은 줄 안에서 누적되지만 sourceIndex·originalLine·originalColumn·nameIndex는
 * 파일 전체에 걸쳐 누적되므로, 목표 줄까지는 세그먼트를 세면서 지나가야 한다.
 */
function decodeLine(mappings: string, targetLine: number): Segment[] {
  const lines = mappings.split(';')
  let sourceIndex = 0
  let originalLine = 0
  let originalColumn = 0
  let nameIndex = 0

  for (let lineNo = 0; lineNo <= targetLine; lineNo += 1) {
    const raw = lines[lineNo]
    if (raw === undefined) return []
    let generatedColumn = 0
    const segments: Segment[] = []

    for (const part of raw.split(',')) {
      if (part === '') continue
      const fields: number[] = []
      let cursor = 0
      while (cursor < part.length) {
        const decoded = decodeVlq(part, cursor)
        if (decoded === null) break
        fields.push(decoded.value)
        cursor = decoded.next
      }
      if (fields[0] === undefined) continue

      generatedColumn += fields[0]
      // 길이가 1이면 원본 위치가 없는 구간이라 건너뛴다
      if (fields.length < 4) continue
      sourceIndex += fields[1] ?? 0
      originalLine += fields[2] ?? 0
      originalColumn += fields[3] ?? 0
      if (fields.length >= 5) nameIndex += fields[4] ?? 0

      segments.push({
        generatedColumn,
        sourceIndex,
        originalLine,
        originalColumn,
        nameIndex: fields.length >= 5 ? nameIndex : -1,
      })
    }

    if (lineNo === targetLine) return segments
  }
  return []
}

/** webpack://·상대경로 접두사를 걷어내 에디터에서 찾을 수 있는 형태로 만든다 */
function normalizeSource(source: string, sourceRoot?: string): string {
  const joined =
    sourceRoot === undefined || sourceRoot === ''
      ? source
      : `${sourceRoot.replace(/\/$/, '')}/${source}`
  return joined.replace(/^webpack:\/\/\/?/, '').replace(/^(?:\.\.\/)+/, '')
}

/**
 * 압축된 위치(1부터 시작하는 줄·컬럼)를 원본 위치로 되돌린다.
 * 목표 컬럼을 넘지 않는 마지막 세그먼트가 답이다 — 한 세그먼트가 그 지점부터
 * 다음 세그먼트 전까지를 덮기 때문이다.
 */
export function originalPositionFor(
  map: SourceMap,
  line: number,
  column: number,
): OriginalPosition | null {
  if (line < 1 || column < 1) return null
  const segments = decodeLine(map.mappings, line - 1)
  if (segments.length === 0) return null

  const target = column - 1
  let found: Segment | undefined
  for (const segment of segments) {
    if (segment.generatedColumn > target) break
    found = segment
  }
  if (found === undefined) return null

  const source = map.sources[found.sourceIndex]
  if (source === undefined) return null
  const name =
    found.nameIndex >= 0 ? map.names?.[found.nameIndex] : undefined

  return {
    source: normalizeSource(source, map.sourceRoot),
    line: found.originalLine + 1,
    column: found.originalColumn + 1,
    name,
  }
}
