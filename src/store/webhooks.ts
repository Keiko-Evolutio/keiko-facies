import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { apiClient } from '@/api/client'
import {
    WebhookTarget,
    WebhookTargetsResponseSchema,
    WebhookTargetCreate,
    WebhookTargetCreateSchema,
    WebhookTargetUpdate,
    WebhookDeliveriesResponseSchema,
    type WebhookDelivery,
} from '@/api/types/webhooks'
import { z } from 'zod'

interface WebhookState {
    targets: WebhookTarget[]
    deliveries: WebhookDelivery[]
    wsEnabled?: boolean
    wsSubscribe?: () => Promise<void>
    loading: boolean
    error: string | null
    fetchTargets: () => Promise<void>
    fetchDeliveries: (query?: Record<string, string | number | boolean>) => Promise<void>
    createTarget: (data: WebhookTargetCreate) => Promise<void>
    updateTarget: (id: string, data: WebhookTargetUpdate) => Promise<void>
    deleteTarget: (id: string) => Promise<void>
    toggleActive: (id: string, isActive: boolean) => Promise<void>
}

export const useWebhookStore = create<WebhookState>()(
    immer((set, get) => ({
        targets: [],
        deliveries: [],
        wsEnabled: false,
        loading: false,
        error: null,

        // ------------------------------------------------------------
        // Adapter: Backend → UI‑Modelle
        // ------------------------------------------------------------
        // Hinweis: Die Backend‑Antwort unterscheidet sich vom UI‑Erwartungs‑
        // schema. Um die strikte Zod‑Validierung zu umgehen und dennoch
        // stabile UI‑Daten zu liefern, werden hier Adapter eingesetzt.
        adaptBackendTargetToUi: (t: any): WebhookTarget => {
            // Name ableiten: bevorzugt vorhandenes Feld, sonst Host aus URL, sonst ID
            let derivedName = String(t?.name || '')
            if (!derivedName) {
                try {
                    derivedName = new URL(String(t?.url || '')).hostname || ''
                } catch {
                    derivedName = ''
                }
            }
            if (!derivedName) derivedName = String(t?.id || 'target')

            // Event‑Typen aus Subscriptions extrahieren (falls vorhanden)
            const subscriptions = Array.isArray(t?.subscriptions) ? t.subscriptions : []
            const eventTypes: string[] = []
            try {
                for (const sub of subscriptions) {
                    const events = Array.isArray(sub?.events) ? sub.events : []
                    for (const ev of events) {
                        const et = (ev?.event_type || ev?.type || '').toString()
                        if (et) eventTypes.push(et)
                    }
                }
            } catch {
                // Fallback: keine Events
            }

            return {
                id: String(t?.id || ''),
                name: derivedName,
                url: String(t?.url || ''),
                is_active: typeof t?.enabled === 'boolean' ? Boolean(t.enabled) : Boolean(t?.is_active ?? true),
                event_types: eventTypes,
                headers: (t?.headers && typeof t.headers === 'object') ? t.headers as Record<string, string> : {},
                auth_type: 'none',
                auth_value: undefined,
                auth_username: undefined,
                auth_password: undefined,
                http_method: 'POST',
                content_type: 'application/json',
                signature_secret: undefined,
                tenant_id: t?.tenant_id ? String(t.tenant_id) : undefined,
                created_at: t?.created_at ? String(t.created_at) : undefined,
            } as WebhookTarget
        },

        adaptBackendDeliveryToUi: (item: any): WebhookDelivery => {
            // Backend liefert Struktur { record, target, event }
            const record = item?.record || item || {}
            const event = item?.event || {}

            // Status normalisieren (Backend kennt z. B. "retrying"/"dlq")
            const rawStatus = String(record?.status || '').toLowerCase()
            const status = (rawStatus === 'success' || rawStatus === 'failed' || rawStatus === 'pending')
                ? rawStatus
                : (rawStatus === 'retrying' ? 'pending' : 'failed')

            return {
                id: String(record?.delivery_id || record?.id || ''),
                target_id: String(record?.target_id || ''),
                event_type: String(event?.event_type || event?.type || 'unknown'),
                status: status as WebhookDelivery['status'],
                attempt: Number.isFinite(record?.attempt) ? Number(record.attempt) : 0,
                max_retries: Number.isFinite(record?.max_attempts) ? Number(record.max_attempts) : 0,
                response_status: Number.isFinite(record?.response_status) ? Number(record.response_status) : undefined,
                error: record?.last_error ? String(record.last_error) : undefined,
                created_at: record?.created_at ? String(record.created_at) : new Date().toISOString(),
            } as WebhookDelivery
        },

        fetchTargets: async () => {
            set((s) => { s.loading = true; s.error = null })
            // Backend‑Antwort ohne strikte Zod‑Validierung abfragen und adaptieren
            const res = await apiClient.get('/api/v1/webhooks/targets', z.any())
            if (res.ok) {
                const data = res.data as any
                const items = Array.isArray(data?.items) ? data.items : []
                // In UI‑Schema transformieren
                const adapted = items.map((t: any) => (get() as any).adaptBackendTargetToUi(t))
                set((s) => { s.targets = adapted; s.loading = false })
            } else {
                set((s) => { s.error = res.error.message; s.loading = false })
            }
        },

        fetchDeliveries: async (query) => {
            set((s) => { s.loading = true; s.error = null })
            const qs = query ? '?' + new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])).toString() : ''
            // Backend‑Antwort ohne strikte Zod‑Validierung abfragen und adaptieren
            const res = await apiClient.get(`/api/v1/webhooks/deliveries${qs}`, z.any())
            if (res.ok) {
                const data = res.data as any
                const items = Array.isArray(data?.items) ? data.items : []
                const adapted = items.map((it: any) => (get() as any).adaptBackendDeliveryToUi(it))
                set((s) => { s.deliveries = adapted; s.loading = false })
            } else {
                set((s) => { s.error = res.error.message; s.loading = false })
            }
        },

        wsSubscribe: async () => {
            try {
                const { useWebSocketStore } = await import('@/websocket/manager')
                const ws = useWebSocketStore.getState()
                await ws.initialize()
                await ws.connect()
                ws.client?.on('message', (event: any) => {
                    const t = event?.event_type
                    if (t === 'webhook_delivery' || t === 'webhook_failed' || t === 'webhook_retry' || t === 'target_status_changed') {
                        get().fetchDeliveries({ limit: 100 })
                    }
                })
                set((s) => { s.wsEnabled = true })
            } catch (e) {
                // optional, keine harte Abhängigkeit
            }
        },

        createTarget: async (data) => {
            const parsed = WebhookTargetCreateSchema.safeParse(data)
            if (!parsed.success) throw new Error('Ungültige Target-Daten')
            // Optimistic UI: sofort hinzufügen
            const tempId = 'tmp_' + Math.random().toString(36).slice(2)
            const optimistic = { id: tempId, is_active: true, event_types: [], headers: {}, http_method: 'POST', content_type: 'application/json', ...parsed.data } as any
            set((s) => { s.targets = [optimistic, ...s.targets] })
            const res = await apiClient.post('/api/v1/webhooks/targets', z.any(), { body: parsed.data })
            if (res.ok) {
                await get().fetchTargets()
            } else {
                // Rollback
                set((s) => { s.targets = s.targets.filter(t => t.id !== tempId) })
                throw new Error(res.error.message)
            }
        },

        updateTarget: async (id, data) => {
            // Optimistic Update: Snapshot vorher
            const prev = get().targets
            set((s) => {
                const idx = s.targets.findIndex(t => t.id === id)
                if (idx >= 0) s.targets[idx] = { ...s.targets[idx], ...data } as any
            })
            const res = await apiClient.put(`/api/v1/webhooks/targets/${id}`, z.any(), { body: data })
            if (res.ok) await get().fetchTargets()
            else {
                // Rollback
                set((s) => { s.targets = prev })
                throw new Error(res.error.message)
            }
        },

        deleteTarget: async (id) => {
            const prev = get().targets
            // Optimistic remove
            set((s) => { s.targets = s.targets.filter(t => t.id !== id) })
            const res = await apiClient.delete(`/api/v1/webhooks/targets/${id}`, z.any())
            if (res.ok) await get().fetchTargets()
            else {
                set((s) => { s.targets = prev })
                throw new Error(res.error.message)
            }
        },

        toggleActive: async (id, isActive) => {
            const prev = get().targets
            set((s) => {
                const idx = s.targets.findIndex(t => t.id === id)
                if (idx >= 0) s.targets[idx].is_active = isActive as any
            })
            // Primärer Weg: PATCH (Teilaktualisierung)
            const res = await apiClient.patch(`/api/v1/webhooks/targets/${id}`, z.any(), { body: { is_active: isActive } })
            if (res.ok) {
                await get().fetchTargets()
                return
            }
            // Fallback: Falls Target nicht existiert (404), Upsert via PUT mit minimalen Feldern
            const isNotFound = String((res as any)?.error?.message || '').includes('404')
            if (isNotFound) {
                const t = get().targets.find(t => t.id === id)
                if (!t) {
                    set((s) => { s.targets = prev })
                    throw new Error('Target nicht gefunden')
                }
                const upsertBody: any = {
                    id,
                    url: t.url,
                    enabled: Boolean(isActive),
                    headers: t.headers || {},
                    max_attempts: 5,
                    backoff_seconds: 1.0,
                }
                const upsert = await apiClient.put(`/api/v1/webhooks/targets/${id}`, z.any(), { body: upsertBody })
                if (upsert.ok) {
                    await get().fetchTargets()
                    return
                }
            }
            // Andernfalls: Rollback und Fehler weiterreichen
            set((s) => { s.targets = prev })
            throw new Error((res as any)?.error?.message || 'Aktualisierung fehlgeschlagen')
        },
    })),
)
