import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkMaintenance, isMaintenanceInfo } from './index'

const JSON_URL = 'https://example.com/maintenance.json'

function stubFetch(body: unknown, status = 200) {
  const mock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('isMaintenanceInfo', () => {
  it('isMaintenance가 boolean이면 통과한다', () => {
    expect(isMaintenanceInfo({ isMaintenance: true })).toBe(true)
    expect(
      isMaintenanceInfo({
        isMaintenance: true,
        title: '시스템 정기 점검 안내',
        startTime: '2026-08-15 11:00:00',
        endTime: '2026-08-16 13:00:00',
      }),
    ).toBe(true)
  })

  it('isMaintenance가 없거나 boolean이 아니면 실패한다', () => {
    expect(isMaintenanceInfo(null)).toBe(false)
    expect(isMaintenanceInfo({})).toBe(false)
    expect(isMaintenanceInfo({ isMaintenance: 'yes' })).toBe(false)
  })

  it('선택 필드가 문자열이 아니면 실패한다', () => {
    expect(isMaintenanceInfo({ isMaintenance: true, title: 123 })).toBe(false)
  })
})

describe('checkMaintenance', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('정상 응답이면 MaintenanceInfo를 반환한다', async () => {
    stubFetch({ isMaintenance: true, title: '점검 안내' })
    await expect(checkMaintenance({ url: JSON_URL })).resolves.toEqual({
      isMaintenance: true,
      title: '점검 안내',
    })
  })

  it('기본으로 t= 캐시 버스터를 붙인다', async () => {
    const mock = stubFetch({ isMaintenance: false })
    await checkMaintenance({ url: JSON_URL })
    expect(mock).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/example\.com\/maintenance\.json\?t=\d+$/),
      undefined,
    )
  })

  it('이미 쿼리가 있으면 &로 이어 붙인다', async () => {
    const mock = stubFetch({ isMaintenance: false })
    await checkMaintenance({ url: `${JSON_URL}?v=1` })
    expect(mock).toHaveBeenCalledWith(
      expect.stringMatching(/\?v=1&t=\d+$/),
      undefined,
    )
  })

  it('cacheBuster: false면 URL을 그대로 사용한다', async () => {
    const mock = stubFetch({ isMaintenance: false })
    await checkMaintenance({ url: JSON_URL, cacheBuster: false })
    expect(mock).toHaveBeenCalledWith(JSON_URL, undefined)
  })

  it('HTTP 에러면 throw한다', async () => {
    stubFetch('not found', 404)
    await expect(checkMaintenance({ url: JSON_URL })).rejects.toThrow('HTTP 404')
  })

  it('형식이 맞지 않으면 throw한다', async () => {
    stubFetch({ status: 'ok' })
    await expect(checkMaintenance({ url: JSON_URL })).rejects.toThrow(
      'MaintenanceInfo 형식이 아닙니다',
    )
  })
})
