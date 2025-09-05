import { v4 as uuidv4 } from 'uuid'
import { API_ENDPOINT } from '@/store/endpoint'
import type { ErrorCategory, StructuredErrorContext, StructuredErrorLogEntry } from '@/types/errors'

function getDefaultContext(): StructuredErrorContext {
    // Liefert Basis-Kontextinformationen
    return {
        traceId: uuidv4(),
        userId: null,
        route: typeof window !== 'undefined' ? window.location.pathname : undefined,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        timestamp: new Date().toISOString(),
    }
}

export async function logClientError(entry: Omit<StructuredErrorLogEntry, 'context'> & { context?: Partial<StructuredErrorContext> }): Promise<void> {
    // Baut strukturiertes Log auf und sendet es ans Backend (best effort)
    const context = { ...getDefaultContext(), ...(entry.context || {}) }
    const payload: StructuredErrorLogEntry = { ...entry, context }

    try {
        await fetch(`${API_ENDPOINT}/api/v1/logs/client`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Trace-Id': context.traceId || uuidv4(),
                'X-Tenant-Id': 'default'
            },
            body: JSON.stringify(payload),
            mode: 'cors',
            keepalive: true,
        })
    } catch (e) {
        // Best effort: keine Eskalation
        // eslint-disable-next-line no-console
        console.warn('[client-log] failed', (e as Error).message)
    }
}

export function categorizeError(err: unknown): ErrorCategory {
    // Heuristik zur Kategorisierung
    const anyErr: any = err
    if (anyErr?.name === 'AuthError') return 'authentication'
    if (anyErr?.name === 'ValidationError') return 'validation'
    if (anyErr?.name === 'NetworkError') return 'network'
    if (anyErr?.isAxiosError || anyErr?.name === 'APIError') return 'api'
    return 'runtime'
}
