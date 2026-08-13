// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MaintenanceGate } from './index'
import { DEFAULT_BYPASS_KEY } from '../core'

const JSON_URL = 'https://example.com/maintenance.json'

/** next/headers의 cookies()를 테스트용 인메모리 스토어로 대체한다 */
const cookieStore = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieStore.get(name)
      return value === undefined ? undefined : { name, value }
    },
  }),
}))

function stubMaintenanceFetch(isMaintenance: boolean) {
  const mock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ isMaintenance }),
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  cookieStore.clear()
})

describe('MaintenanceGate', () => {
  it('점검 중이면 점검 화면을 렌더하고 children을 렌더하지 않는다', async () => {
    stubMaintenanceFetch(true)
    render(await MaintenanceGate({ url: JSON_URL, children: <div>실제 앱</div> }))
    expect(screen.getByText('서비스 일시 중단 안내')).toBeDefined()
    expect(screen.queryByText('실제 앱')).toBeNull()
  })

  it('점검 중 + bypass 쿠키가 있으면 children을 렌더한다', async () => {
    stubMaintenanceFetch(true)
    cookieStore.set(DEFAULT_BYPASS_KEY, '1')
    render(await MaintenanceGate({ url: JSON_URL, children: <div>실제 앱</div> }))
    expect(screen.getByText('실제 앱')).toBeDefined()
    expect(screen.queryByText('서비스 일시 중단 안내')).toBeNull()
  })

  it('bypass={false}면 쿠키가 있어도 점검 화면을 렌더한다', async () => {
    stubMaintenanceFetch(true)
    cookieStore.set(DEFAULT_BYPASS_KEY, '1')
    render(
      await MaintenanceGate({
        url: JSON_URL,
        bypass: false,
        children: <div>실제 앱</div>,
      }),
    )
    expect(screen.getByText('서비스 일시 중단 안내')).toBeDefined()
    expect(screen.queryByText('실제 앱')).toBeNull()
  })

  it('점검 아니면 children을 렌더한다', async () => {
    stubMaintenanceFetch(false)
    render(await MaintenanceGate({ url: JSON_URL, children: <div>실제 앱</div> }))
    expect(screen.getByText('실제 앱')).toBeDefined()
  })

  it('조회 실패 시 children을 렌더한다 (fail-open)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    render(await MaintenanceGate({ url: JSON_URL, children: <div>실제 앱</div> }))
    expect(screen.getByText('실제 앱')).toBeDefined()
  })

  it('fetch에 cache: no-store를 전달한다', async () => {
    const mock = stubMaintenanceFetch(false)
    await MaintenanceGate({ url: JSON_URL, children: null })
    expect(mock).toHaveBeenCalledWith(
      expect.stringContaining(JSON_URL),
      expect.objectContaining({ cache: 'no-store' }),
    )
  })
})
