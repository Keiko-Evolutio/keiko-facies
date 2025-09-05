// src/api/client.ts
import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios'
import { z } from 'zod'
import { API_ENDPOINT } from '@/store/endpoint'
import { type ApiResult } from '@/api/types/common'
import { toAPIError, NetworkError, ValidationError, AuthError } from '@/api/errors'
import { defaultCacheManager } from '@/services/cache/cacheManager'
import { defaultDeduplicator } from '@/services/deduplication/requestDeduplicator'
import { usePerfStore } from '@/store/perf'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface RequestOptions<TBody = unknown> {
    // Request Body (wird für GET ignoriert)
    body?: TBody
    // Custom Header (werden gemerged)
    headers?: Record<string, string>
    // Timeout in ms (Default 15000)
    timeoutMs?: number
    // Anzahl Retries bei transienten Fehlern (Default 3)
    retries?: number
    // AbortController Signal
    signal?: AbortSignal
}

// Circuit Breaker State
class CircuitBreaker {
    private consecutiveFailures = 0
    private openUntil: number | null = null

    constructor(private readonly failureThreshold = 5, private readonly cooldownMs = 10_000) { }

    canPass(): boolean {
        if (this.openUntil && Date.now() < this.openUntil) return false
        return true
    }

    onSuccess(): void {
        this.consecutiveFailures = 0
        this.openUntil = null
    }

    onFailure(): void {
        this.consecutiveFailures += 1
        if (this.consecutiveFailures >= this.failureThreshold) {
            this.openUntil = Date.now() + this.cooldownMs
        }
    }
}

export class KeikoAPIClient {
    private static instance: KeikoAPIClient | null = null
    private axios: AxiosInstance
    private bearerToken: string | null = null
    private breaker = new CircuitBreaker()
    private inflightCache = new Map<string, Promise<AxiosResponse<any>>>()

    private constructor(baseURL: string) {
        // Initialisiert Axios-Instanz mit Basis-URL
        this.axios = axios.create({ baseURL, timeout: 15_000 })

        // Automatisch das Development-Token setzen
        const isDevelopment = import.meta.env.DEV ||
                            import.meta.env.MODE === 'development' ||
                            window.location.hostname === 'localhost' ||
                            window.location.hostname === '127.0.0.1'

        if (isDevelopment) {
            this.bearerToken = 'dev-token-12345'
        }

        // Request-Interceptor: Auth & Standard-Header
        this.axios.interceptors.request.use((config) => {
            const traceId = crypto.randomUUID()
            const isFormData = typeof FormData !== 'undefined' && (config.data as any) instanceof FormData
            const baseHeaders: Record<string, string> = {
                'X-Trace-Id': traceId,
                'X-Tenant-Id': 'public', // Default tenant für Development
                ...(this.bearerToken ? { Authorization: `Bearer ${this.bearerToken}` } : {}),
            }

            // Development-Modus: X-Scopes Header für Webhook-Endpunkte hinzufügen
            // Prüfe mehrere Indikatoren für Development-Modus
            const isDevelopment = import.meta.env.DEV ||
                                import.meta.env.MODE === 'development' ||
                                window.location.hostname === 'localhost' ||
                                window.location.hostname === '127.0.0.1' ||
                                window.location.port === '5173'

            if (isDevelopment && config.url?.includes('/webhooks')) {
                // Alle erforderlichen Webhook-Scopes für Development
                baseHeaders['X-Scopes'] = 'webhook:admin:* webhook:targets:manage webhook:dlq:manage webhook:outbound:send:*'
                console.debug('Added X-Scopes header for webhook endpoint:', config.url)
            }

            if (!isFormData) {
                baseHeaders['Content-Type'] = 'application/json'
            }
            config.headers = { ...baseHeaders, ...config.headers }
            return config
        })

        // Response-Interceptor: Einheitliche Fehlerbehandlung + automatische Toasts
        this.axios.interceptors.response.use(
            (response) => response,
            (error) => {
                const apiErr = toAPIError(error)
                try {
                    const status = (apiErr as any)?.status
                    const toast = (window as any).__keiko_toast as undefined | ((o: any) => void)
                    if (toast) {
                        if (status === 401 || status === 403 || apiErr instanceof AuthError) {
                            toast({ severity: 'warning', message: 'Anmeldung erforderlich' })
                        } else if (status === 429) {
                            toast({ severity: 'warning', message: 'Zu viele Anfragen' })
                        } else if (!status || apiErr instanceof NetworkError) {
                            toast({ severity: 'error', message: 'Verbindungsproblem' })
                        } else if (status >= 500) {
                            toast({ severity: 'error', message: 'Temporärer Service-Fehler' })
                        }
                    }
                } catch (_) { }
                // Offline‑Erkennung: POST/PUT/PATCH queueing
                try {
                    const cfg = error?.config as any
                    const method = (cfg?.method || '').toUpperCase()
                    const isWrite = ['POST', 'PUT', 'PATCH'].includes(method)
                    if (!navigator.onLine && isWrite) {
                        const traceId = cfg?.headers?.['X-Trace-Id']
                        const tenantId = cfg?.headers?.['X-Tenant-Id'] || cfg?.headers?.['x-tenant-id']
                        import('@/services/offline/requestQueue').then(({ enqueue }) => {
                            enqueue({
                                url: cfg.baseURL ? cfg.baseURL + cfg.url : cfg.url,
                                method: method,
                                body: cfg.data ? JSON.parse(cfg.data) : {},
                                headers: cfg.headers || {},
                                priority: 'critical',
                                traceId,
                                tenantId,
                                maxRetries: 8,
                            }).catch(() => { })
                        })
                    }
                } catch (_) { }
                throw apiErr
            },
        )
    }

    // Singleton-Getter
    static getInstance(): KeikoAPIClient {
        if (!KeikoAPIClient.instance) {
            const base = API_ENDPOINT || (import.meta as any).env?.VITE_API_ENDPOINT || 'http://localhost:8000'
            KeikoAPIClient.instance = new KeikoAPIClient(base)
        }
        return KeikoAPIClient.instance
    }

    // Setzt Bearer-Token
    setToken(token: string | null): void {
        this.bearerToken = token
    }

    // Generische Request-Methode mit Retry, Timeout, Circuit-Breaker und optionalem Caching für GET.
    async request<TData, TBody = unknown>(
        method: HttpMethod,
        url: string,
        schema: z.ZodType<TData>,
        options: RequestOptions<TBody> = {},
    ): Promise<ApiResult<TData>> {
        if (!this.breaker.canPass()) {
            return { ok: false, error: { message: 'Circuit open', code: 'CIRCUIT_OPEN' } as any } as any
        }

        const retries = options.retries ?? 3
        const timeoutMs = options.timeoutMs ?? 15_000
        const headers = options.headers ?? {}

        const config: AxiosRequestConfig = {
            method,
            url,
            data: method === 'GET' ? undefined : options.body,
            headers,
            timeout: timeoutMs,
            signal: options.signal,
        }

        // In-Flight Dedupe (GET und idempotente Requests)
        const dedupKey = defaultDeduplicator.buildKey(method, config.url!, method === 'GET' ? undefined : config.data)
        // Optionales lokales inflight cache für GET - in äußerem Scope definieren
        const cacheKey = method === 'GET' ? JSON.stringify({ url, headers }) : null

        const execRequest = async () => {
            if (cacheKey && this.inflightCache.has(cacheKey)) {
                return await this.inflightCache.get(cacheKey)!
            }
            const exec = this.axios.request(config)
            if (cacheKey) this.inflightCache.set(cacheKey, exec)
            const response = await exec
            if (cacheKey) this.inflightCache.delete(cacheKey)
            return response
        }
        const response = await defaultDeduplicator.run(dedupKey, execRequest)

        // Cache-First für GET je nach Strategie
        if (method === 'GET') {
            const cached = await defaultCacheManager.get<any>(method, url, headers)
            if (cached) {
                // Cache-Hit Metrik aufzeichnen
                const strat = defaultCacheManager.resolveStrategy(url)
                const cacheType = this.extractCacheType(url, strat)
                const tenantId = headers?.['X-Tenant-Id']
                usePerfStore.getState().collector.recordCacheHit(cacheType, tenantId)

                const parsed = schema.safeParse(cached)
                if (parsed.success) {
                    return { ok: true, data: parsed.data } as any
                }
            } else {
                // Cache-Miss Metrik aufzeichnen
                const strat = defaultCacheManager.resolveStrategy(url)
                const cacheType = this.extractCacheType(url, strat)
                const tenantId = headers?.['X-Tenant-Id']
                usePerfStore.getState().collector.recordCacheMiss(cacheType, tenantId)
            }
        }

        let attempt = 0
        let lastError: unknown = null
        while (attempt <= retries) {
            try {
                this.breaker.onSuccess()
                const parsed = schema.safeParse(response.data)
                if (!parsed.success) {
                    throw new ValidationError('Antwortvalidierung fehlgeschlagen', { issues: parsed.error })
                }
                // Bei Erfolg: Cache schreiben nach Strategie
                if (method === 'GET') {
                    const strat = defaultCacheManager.resolveStrategy(url)
                    const tags = (strat.tagsFn ? strat.tagsFn(url) : (strat.tags || []))
                    await defaultCacheManager.set(method, url, response.data, tags, strat.ttlMs, headers)
                } else if (method !== 'GET') {
                    // Schreibende Operation → relevante Tags invalidieren
                    const writeTags = ['webhooks', 'agents', 'configurations']
                    await Promise.all(writeTags.map((t) => defaultCacheManager.invalidateByTag(t)))
                }
                return { ok: true, data: parsed.data } as any
            } catch (err: unknown) {
                lastError = err
                const apiErr = toAPIError(err)
                const status = (apiErr as any)?.status
                const retriable = apiErr instanceof NetworkError || (status && status >= 500 && status < 600)

                if (!retriable || attempt === retries) {
                    this.breaker.onFailure()
                    const traceId = (apiErr as any)?.traceId
                    const errorPayload = { message: apiErr.message, code: 'API_ERROR', trace_id: traceId } as any
                    return { ok: false, error: errorPayload } as any
                }

                // Exponential Backoff: 200ms, 400ms, 800ms...
                const backoff = Math.pow(2, attempt) * 200
                await new Promise((r) => setTimeout(r, backoff))
                attempt += 1
            } finally {
                if (cacheKey) this.inflightCache.delete(cacheKey)
            }
        }

        // Fallback (sollte nicht erreicht werden)
        return { ok: false, error: { message: (lastError as Error)?.message || 'Unbekannter Fehler' } as any } as any
    }

    /**
     * Extrahiert Cache-Typ aus URL für Metriken-Tagging.
     */
    private extractCacheType(url: string, strategy: any): string {
        if (url.includes('/agents')) return 'agents'
        if (url.includes('/webhooks')) return 'webhooks'
        if (url.includes('/users')) return 'users'
        if (url.includes('/configurations')) return 'configurations'
        if (strategy.tags && strategy.tags.length > 0) return strategy.tags[0]
        return 'default'
    }

    // Convenience-Methoden
    get<T>(url: string, schema: z.ZodType<T>, options?: RequestOptions): Promise<ApiResult<T>> {
        return this.request('GET', url, schema, options)
    }
    post<T, B = unknown>(url: string, schema: z.ZodType<T>, options?: RequestOptions<B>): Promise<ApiResult<T>> {
        return this.request('POST', url, schema, options)
    }
    put<T, B = unknown>(url: string, schema: z.ZodType<T>, options?: RequestOptions<B>): Promise<ApiResult<T>> {
        return this.request('PUT', url, schema, options)
    }
    patch<T, B = unknown>(url: string, schema: z.ZodType<T>, options?: RequestOptions<B>): Promise<ApiResult<T>> {
        return this.request('PATCH', url, schema, options)
    }
    delete<T>(url: string, schema: z.ZodType<T>, options?: RequestOptions): Promise<ApiResult<T>> {
        return this.request('DELETE', url, schema, options)
    }
}

// Export Singleton-Instanz
export const apiClient = KeikoAPIClient.getInstance()
