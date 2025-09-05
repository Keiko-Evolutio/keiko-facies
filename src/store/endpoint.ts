// Umgebungsvariablen mit Fallbacks
export const WS_ENDPOINT = import.meta.env.VITE_WS_ENDPOINT || 'ws://localhost:8000';
export const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || 'http://localhost:8000';
export const WEB_ENDPOINT = import.meta.env.VITE_WEB_ENDPOINT || 'http://localhost:5173';
export const QUEUE_METRICS_ENDPOINT = `${API_ENDPOINT}/api/v1/metrics/queue`;
