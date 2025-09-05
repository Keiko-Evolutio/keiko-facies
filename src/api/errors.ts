// src/api/errors.ts
import type { AxiosError } from 'axios'

// Zentralisierte Error-Typen für einheitliche Fehlerbehandlung

export class APIError extends Error {
    /** HTTP Statuscode falls vorhanden */
    status?: number
    /** Trace-ID für korrelierte Logs */
    traceId?: string
    /** Ursprünglicher Fehler (Axios oder Netzwerk) */
    cause?: unknown

    constructor(message: string, options?: { status?: number; traceId?: string; cause?: unknown }) {
        super(message)
        this.name = 'APIError'
        this.status = options?.status
        this.traceId = options?.traceId
        this.cause = options?.cause
    }
}

export class NetworkError extends APIError {
    /** Kennzeichnet Netzwerkfehler (Timeout, DNS, Verbindungsabbruch) */
    constructor(message = 'Netzwerkfehler', options?: { traceId?: string; cause?: unknown }) {
        super(message, { status: undefined, traceId: options?.traceId, cause: options?.cause })
        this.name = 'NetworkError'
    }
}

export class ValidationError extends APIError {
    /** Zod/Schema-Validierungsfehler mit Details */
    issues?: unknown
    constructor(message = 'Validierungsfehler', options?: { issues?: unknown; traceId?: string; cause?: unknown }) {
        super(message, { status: 422, traceId: options?.traceId, cause: options?.cause })
        this.name = 'ValidationError'
        this.issues = options?.issues
    }
}

export class AuthError extends APIError {
    /** Fehler bei Authentifizierung/Autorisierung */
    constructor(message = 'Authentifizierungsfehler', options?: { status?: number; traceId?: string; cause?: unknown }) {
        super(message, { status: options?.status ?? 401, traceId: options?.traceId, cause: options?.cause })
        this.name = 'AuthError'
    }
}

export function toAPIError(err: unknown): APIError {
    // Konvertiert unbekannte Fehler in APIError und extrahiert nützliche Infos
    const anyErr = err as any
    const traceId: string | undefined = anyErr?.response?.headers?.['x-trace-id'] || anyErr?.config?.headers?.['X-Trace-Id']

    // AxiosError behandeln
    const axiosErr = anyErr as AxiosError
    if (axiosErr?.isAxiosError) {
        const status = axiosErr.response?.status
        const message = axiosErr.message || 'Unbekannter API-Fehler'
        if (status === 401 || status === 403) {
            return new AuthError(message, { status, traceId, cause: err })
        }
        if (!status) {
            // Keine Response → Netzwerkproblem
            return new NetworkError(message, { traceId, cause: err })
        }
        return new APIError(message, { status, traceId, cause: err })
    }

    // Generische Fehler
    if (anyErr?.name === 'AbortError') {
        return new NetworkError('Request abgebrochen', { traceId, cause: err })
    }

    return new APIError(anyErr?.message || 'Unbekannter Fehler', { traceId, cause: err })
}
