/**
 * 동일 에러를 묶는 지문.
 * 메시지에 섞인 숫자·UUID는 호출마다 달라지므로 정규화한 뒤 해싱한다.
 */
function normalize(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\d+/g, '<n>')
}

/** 스택에서 첫 프레임만 쓴다 — 아래쪽 프레임은 호출 경로에 따라 흔들린다 */
function firstFrame(stack?: string): string {
  if (!stack) return ''
  const lines = stack.split('\n')
  const frame = lines.find((line) => line.trim().startsWith('at '))
  return frame === undefined ? '' : frame.trim()
}

/** FNV-1a 32bit — 충돌 위험보다 번들 크기를 우선했다 */
function hash(input: string): string {
  let value = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index)
    value = Math.imul(value, 0x01000193)
  }
  return (value >>> 0).toString(16).padStart(8, '0')
}

export function createFingerprint(
  name: string,
  message: string,
  stack?: string,
): string {
  return hash(`${name}|${normalize(message)}|${firstFrame(stack)}`)
}
