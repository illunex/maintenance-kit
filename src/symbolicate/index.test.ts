import { describe, expect, it } from 'vitest'
import { mapFileNameFor, parseFrame, symbolicateStack } from './index'
import { originalPositionFor, type SourceMap } from './source-map'

/**
 * 실제 번들에서 뽑은 형태의 최소 소스맵.
 * mappings의 각 세그먼트는 [생성컬럼, 소스인덱스, 원본줄, 원본컬럼, 이름인덱스] 델타다.
 * "AAAAA"는 전부 0, "IAAKA"는 생성컬럼 +4 / 원본줄 +5.
 */
const MAP: SourceMap = {
  version: 3,
  sources: ['../src/screen/StockDetail.tsx'],
  names: ['getFirstStock'],
  // 1번째 줄: 컬럼 0 → 원본 0:0, 컬럼 4 → 원본 5:0 (이름 0번)
  // 두 번째 세그먼트 IAKAA = [+4, +0, +5, +0, +0]
  mappings: 'AAAA,IAKAA',
}

describe('originalPositionFor', () => {
  it('압축 위치를 원본 파일·줄·컬럼으로 되돌린다', () => {
    expect(originalPositionFor(MAP, 1, 1)).toEqual({
      source: 'src/screen/StockDetail.tsx',
      line: 1,
      column: 1,
      name: undefined,
    })
  })

  // 한 세그먼트는 그 지점부터 다음 세그먼트 전까지를 덮는다
  it('세그먼트 사이의 컬럼은 앞 세그먼트로 귀속된다', () => {
    expect(originalPositionFor(MAP, 1, 6)?.line).toBe(6)
    expect(originalPositionFor(MAP, 1, 6)?.name).toBe('getFirstStock')
    expect(originalPositionFor(MAP, 1, 4)?.line).toBe(1)
  })

  it('매핑이 없는 줄·범위 밖 값은 null을 돌려준다', () => {
    expect(originalPositionFor(MAP, 9, 1)).toBeNull()
    expect(originalPositionFor(MAP, 0, 0)).toBeNull()
  })
})

describe('parseFrame', () => {
  it('Chrome 형식을 읽는다', () => {
    const frame = parseFrame(
      '    at y (https://stocklink.ai/assets/index-CtmyWNbP.js:13321:941)',
    )
    expect(frame).toMatchObject({ fn: 'y', line: 13321, column: 941 })
  })

  it('함수명 없는 줄도 읽는다', () => {
    const frame = parseFrame(
      '    at https://stocklink.ai/assets/index-CtmyWNbP.js:37:37077',
    )
    expect(frame).toMatchObject({ fn: undefined, line: 37, column: 37077 })
  })

  it('Safari·Firefox 형식을 읽는다', () => {
    const frame = parseFrame('y@https://stocklink.ai/assets/index-a.js:12:34')
    expect(frame).toMatchObject({ fn: 'y', line: 12, column: 34 })
  })

  it('스택이 아닌 줄은 null을 돌려준다', () => {
    expect(parseFrame("TypeError: Cannot read properties of undefined")).toBeNull()
  })
})

describe('mapFileNameFor', () => {
  it('URL에서 소스맵 파일명을 만든다', () => {
    expect(mapFileNameFor('https://stocklink.ai/assets/index-Ctmy.js')).toBe(
      'index-Ctmy.js.map',
    )
    expect(mapFileNameFor('/assets/index-Ctmy.js?v=1')).toBe('index-Ctmy.js.map')
  })
})

describe('symbolicateStack', () => {
  const resolve = (name: string): SourceMap | null =>
    name === 'index-Ctmy.js.map' ? MAP : null

  it('스택을 원본 위치로 바꾼다', () => {
    const stack = [
      "TypeError: Cannot read properties of undefined (reading '0')",
      '    at y (https://stocklink.ai/assets/index-Ctmy.js:1:6)',
    ].join('\n')

    expect(symbolicateStack(stack, resolve)).toBe(
      [
        "TypeError: Cannot read properties of undefined (reading '0')",
        '    at getFirstStock (src/screen/StockDetail.tsx:6:1)',
      ].join('\n'),
    )
  })

  /**
   * 배포본이 섞이면 일부 청크의 소스맵만 없는 상황이 생긴다.
   * 한 줄이 안 풀렸다고 나머지까지 버리면 아무것도 못 보게 된다.
   */
  it('소스맵을 못 찾은 줄은 원문 그대로 남긴다', () => {
    const stack = '    at z (https://stocklink.ai/assets/vendor-9f2c.js:5:5)'
    expect(symbolicateStack(stack, resolve)).toBe(stack)
  })

  it('매핑이 없는 위치도 원문 그대로 남긴다', () => {
    const stack = '    at y (https://stocklink.ai/assets/index-Ctmy.js:99:1)'
    expect(symbolicateStack(stack, resolve)).toBe(stack)
  })
})
