import { originalPositionFor, type SourceMap } from './source-map'
import { mapFileNameFor, parseFrame } from './stack'

export { originalPositionFor } from './source-map'
export type { OriginalPosition, SourceMap } from './source-map'
export { mapFileNameFor, parseFrame } from './stack'
export type { StackFrame } from './stack'

/** 파일명(index-Ctmy.js.map)으로 소스맵을 찾아 돌려준다. 없으면 null */
export type ResolveSourceMap = (mapFileName: string) => SourceMap | null

/**
 * 스택을 원본 위치로 되돌린다.
 * 소스맵을 못 찾거나 매핑이 없는 줄은 원문 그대로 남긴다 — 한 줄이 안 풀렸다고
 * 나머지 스택까지 버리면 배포본이 섞였을 때 아무것도 못 보게 된다.
 */
export function symbolicateStack(
  stack: string,
  resolve: ResolveSourceMap,
): string {
  return stack
    .split('\n')
    .map((raw) => {
      const frame = parseFrame(raw)
      if (frame === null) return raw

      const mapFileName = mapFileNameFor(frame.url)
      if (mapFileName === null) return raw

      const map = resolve(mapFileName)
      if (map === null) return raw

      const position = originalPositionFor(map, frame.line, frame.column)
      if (position === null) return raw

      const name = position.name ?? frame.fn
      const where = `${position.source}:${position.line}:${position.column}`
      return name === undefined
        ? `${frame.indent}at ${where}`
        : `${frame.indent}at ${name} (${where})`
    })
    .join('\n')
}
