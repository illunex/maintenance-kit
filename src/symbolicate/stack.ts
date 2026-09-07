/**
 * 스택 한 줄에서 위치를 뽑는다.
 *
 * Chrome·Node:  "    at y (https://host/assets/index-Ctmy.js:13321:941)"
 *               "    at https://host/assets/index-Ctmy.js:37:37077"
 * Safari·Firefox: "y@https://host/assets/index-Ctmy.js:13321:941"
 */
const FRAME_PATTERNS: readonly RegExp[] = [
  /^(?<indent>\s*)at\s+(?<fn>[^\s(][^(]*?)\s+\((?<url>.+?):(?<line>\d+):(?<column>\d+)\)\s*$/,
  /^(?<indent>\s*)at\s+(?<url>.+?):(?<line>\d+):(?<column>\d+)\s*$/,
  /^(?<indent>\s*)(?<fn>[^@\s]*)@(?<url>.+?):(?<line>\d+):(?<column>\d+)\s*$/,
]

export interface StackFrame {
  indent: string
  fn?: string
  url: string
  line: number
  column: number
}

export function parseFrame(raw: string): StackFrame | null {
  for (const pattern of FRAME_PATTERNS) {
    const groups = raw.match(pattern)?.groups
    if (groups === undefined) continue
    const line = Number(groups.line)
    const column = Number(groups.column)
    if (!Number.isFinite(line) || !Number.isFinite(column)) continue
    return {
      indent: groups.indent ?? '',
      fn: groups.fn === '' ? undefined : groups.fn,
      url: groups.url ?? '',
      line,
      column,
    }
  }
  return null
}

/** URL에서 소스맵 파일명을 만든다 — index-Ctmy.js → index-Ctmy.js.map */
export function mapFileNameFor(url: string): string | null {
  const withoutQuery = url.split(/[?#]/)[0] ?? ''
  const fileName = withoutQuery.split('/').pop()
  if (fileName === undefined || fileName === '') return null
  return `${fileName}.map`
}
