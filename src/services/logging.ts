// Client-seitiges Logging und Error Shipping (Batch) nach Backend
// Kommentare in Deutsch, Identifier in Englisch

import { API_ENDPOINT } from '@/store/endpoint';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface ClientLogEvent {
    level: LogLevel;
    message: string;
    name?: string;
    stack?: string;
    timestamp: number;
    context?: Record<string, unknown>;
}

const queue: ClientLogEvent[] = [];
const MAX_BATCH = 20;
const FLUSH_INTERVAL_MS = 3000;

function flush(): void {
    if (queue.length === 0) return;
    const batch = queue.splice(0, Math.min(queue.length, MAX_BATCH));

    // Sende jeden Log-Eintrag einzeln an das korrekte Logs-Endpoint
    batch.forEach(async (logEvent) => {
        try {
            // Transformiere Frontend-Log-Format zu Backend-Format
            const clientLogEntry = {
                message: logEvent.message,
                category: 'client',
                name: logEvent.name || undefined,
                severity: logEvent.level,
                context: {
                    timestamp: new Date(logEvent.timestamp).toISOString(),
                    userId: null,
                    route: window.location.pathname,
                    userAgent: navigator.userAgent,
                    traceId: null
                },
                raw: logEvent.context || {}
            };

            // Verwende korrektes Logs-Endpoint
            const logsUrl = `${API_ENDPOINT}/api/v1/logs/client`;

            // Verwende fetch statt sendBeacon für bessere Fehlerbehandlung
            await fetch(logsUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-Id': 'default', // Erforderlicher Tenant-Header
                },
                body: JSON.stringify(clientLogEntry)
            });
        } catch {
            // noop - Fehler beim Senden von Logs nicht weiter propagieren
        }
    });
}

setInterval(flush, FLUSH_INTERVAL_MS);

export function logClient(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    // Fügt Event der Queue hinzu, Performance‑schonend
    queue.push({ level, message, timestamp: Date.now(), context });
}

// Globale Fehler erfassen
window.addEventListener('error', (event) => {
    const err = event.error as Error | undefined;
    const data: ClientLogEvent = {
        level: 'error',
        message: err?.message || event.message || 'Unhandled Error',
        name: err?.name,
        stack: err?.stack,
        timestamp: Date.now(),
    };
    queue.push(data);
});

window.addEventListener('unhandledrejection', (event) => {
    const reason: any = event.reason;
    const data: ClientLogEvent = {
        level: 'error',
        message: typeof reason === 'string' ? reason : (reason?.message || 'Unhandled Rejection'),
        name: reason?.name,
        stack: reason?.stack,
        timestamp: Date.now(),
    };
    queue.push(data);
});
