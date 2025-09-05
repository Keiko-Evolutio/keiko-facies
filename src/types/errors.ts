// src/types/errors.ts
export type ErrorCategory = 'network' | 'authentication' | 'validation' | 'runtime' | 'api' | 'websocket'

export type Severity = 'success' | 'info' | 'warning' | 'error'

export interface StructuredErrorContext {
    // Eindeutige Trace-ID zur Korrelation mit Backend-Logs
    traceId?: string
    // Nutzerkontext
    userId?: string | null
    // Aktuelle Route
    route?: string
    // Browser-/Client-Infos
    userAgent?: string
    // Zeitstempel (ISO)
    timestamp: string
}

export interface StructuredErrorLogEntry {
    // Kurze Beschreibung
    message: string
    // Fehlerkategorie
    category: ErrorCategory
    // Ursprünglicher Fehlername
    name?: string
    // Optionaler HTTP-Statuscode
    status?: number
    // Schweregrad für UI/Alerting
    severity?: Severity
    // Kontextinformationen
    context: StructuredErrorContext
    // Rohdaten des Fehlers (serialisiert)
    raw?: unknown
}
