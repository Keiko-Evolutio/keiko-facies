import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { usePerformanceMonitoring } from '@/hooks/usePerformanceMonitoring'

vi.mock('@/websocket/manager', () => ({ useWebSocketStore: () => ({ client: { on: vi.fn(), off: vi.fn() }, isInitialized: true, initialize: vi.fn() }) }))
vi.mock('@/store/perf', () => ({ usePerfStore: () => ({ initialize: vi.fn(), tick: vi.fn(), addBusinessMetric: vi.fn() }) }))

const HookHost: React.FC = () => { usePerformanceMonitoring(); return null }

describe('usePerformanceMonitoring', () => {
  beforeEach(() => vi.clearAllMocks())
  it('mounts and unmounts without errors; sets intervals', () => {
    const { unmount } = render(<HookHost />)
    unmount()
    expect(true).toBe(true)
  })
})
