import { describe, it, expect, vi } from 'vitest'
import * as manager from '@/websocket/manager'
import * as cache from '@/services/cache/cacheManager'

describe('WebSocket cache invalidation', () => {
    it('invalidates webhooks on delivery events', async () => {
        const inv = vi.spyOn(cache.default, 'invalidateByTag' as any).mockResolvedValue(undefined)
        const store: any = { client: { on: (ev: string, cb: any) => { cb({ event_type: 'webhook_delivered' }) } }, initialize: vi.fn(), connect: vi.fn() }
        vi.spyOn(manager, 'useWebSocketStore' as any).mockReturnValue(store)
        const { useWebhookStore } = await import('@/store/webhooks')
        await useWebhookStore.getState().wsSubscribe?.()
        expect(inv).toHaveBeenCalledWith('webhooks')
    })
})
