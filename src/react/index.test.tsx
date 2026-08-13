// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_BYPASS_KEY, MaintenanceProvider, useMaintenance } from './index'

const JSON_URL = 'https://example.com/maintenance.json'

/** Response 전역에 의존하지 않도록 최소 형태의 fetch 응답을 스텁한다 */
function stubMaintenanceFetch(isMaintenance: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ isMaintenance }),
    }),
  )
}

function BypassedProbe() {
  const { bypassed } = useMaintenance()
  return <span>{`bypassed:${String(bypassed)}`}</span>
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('MaintenanceProvider 로딩 차단', () => {
  it('로딩 중에는 children을 렌더하지 않는다 (점검 플래시 방지)', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    render(
      <MaintenanceProvider url={JSON_URL}>
        <div>실제 앱</div>
      </MaintenanceProvider>,
    )
    expect(screen.queryByText('실제 앱')).toBeNull()
  })

  it('loading prop 지정 시 로딩 중 해당 화면을 렌더한다', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    render(
      <MaintenanceProvider url={JSON_URL} loading={<div>확인 중…</div>}>
        <div>실제 앱</div>
      </MaintenanceProvider>,
    )
    expect(screen.getByText('확인 중…')).toBeDefined()
    expect(screen.queryByText('실제 앱')).toBeNull()
  })
})

describe('MaintenanceProvider dev bypass', () => {
  it('점검 중 + 플래그 없음 → 점검 화면을 렌더한다', async () => {
    stubMaintenanceFetch(true)
    render(
      <MaintenanceProvider url={JSON_URL}>
        <div>실제 앱</div>
      </MaintenanceProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText('서비스 일시 중단 안내')).toBeDefined()
    })
    expect(screen.queryByText('실제 앱')).toBeNull()
  })

  it('점검 중 + 플래그 설정 → children을 렌더하고 bypassed를 노출한다', async () => {
    stubMaintenanceFetch(true)
    window.localStorage.setItem(DEFAULT_BYPASS_KEY, '1')
    render(
      <MaintenanceProvider url={JSON_URL}>
        <BypassedProbe />
      </MaintenanceProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText('bypassed:true')).toBeDefined()
    })
    expect(screen.queryByText('서비스 일시 중단 안내')).toBeNull()
  })

  it('bypass={false}면 플래그가 있어도 점검 화면을 렌더한다', async () => {
    stubMaintenanceFetch(true)
    window.localStorage.setItem(DEFAULT_BYPASS_KEY, '1')
    render(
      <MaintenanceProvider url={JSON_URL} bypass={false}>
        <div>실제 앱</div>
      </MaintenanceProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText('서비스 일시 중단 안내')).toBeDefined()
    })
    expect(screen.queryByText('실제 앱')).toBeNull()
  })

  it('커스텀 storageKey를 사용한다', async () => {
    stubMaintenanceFetch(true)
    window.localStorage.setItem('my-bypass', '1')
    render(
      <MaintenanceProvider url={JSON_URL} bypass={{ storageKey: 'my-bypass' }}>
        <div>실제 앱</div>
      </MaintenanceProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText('실제 앱')).toBeDefined()
    })
  })

  it('점검 아님이면 children을 렌더하고 bypassed는 false다', async () => {
    stubMaintenanceFetch(false)
    render(
      <MaintenanceProvider url={JSON_URL}>
        <BypassedProbe />
      </MaintenanceProvider>,
    )
    await waitFor(() => {
      expect(screen.getByText('bypassed:false')).toBeDefined()
    })
  })
})
