import { useEffect, useRef } from 'react'
import { usePerfStore } from '@/store/perf'
import { useWebSocketStore, initializeWebSocket } from '@/websocket/manager'

/**
 * Hook zur Initialisierung der Performance-Erfassung und Real-time Updates via WebSocket.
 */
export const usePerformanceMonitoring = () => {
    const { initialize, tick, addBusinessMetric } = usePerfStore()
    const { client, isInitialized } = useWebSocketStore()
    const initAttempted = useRef(false)

    useEffect(() => {
        initialize()
        const id = setInterval(() => tick(), 5000)
        return () => clearInterval(id)
    }, [initialize, tick])

    // WebSocket Initialisierung mit globaler Guard und lokaler Duplikatsprävention
    useEffect(() => {
        if (!isInitialized && !initAttempted.current) {
            initAttempted.current = true
            initializeWebSocket().catch(() => { })
        }
    }, [isInitialized])

    useEffect(() => {
        if (!client) return
        const onAny = (event: any) => {
            if (event?.event_type === 'agent_response' && typeof event?.latency_ms === 'number') {
                addBusinessMetric({ name: 'agent_response_time', value: event.latency_ms, unit: 'ms', timestamp: Date.now() })
            }
            if (event?.event_type === 'connection_status') {
                addBusinessMetric({ name: 'ws_status', value: event.status === 'connected' ? 1 : 0, timestamp: Date.now() })
            }
        }
        client.on('message', onAny as any)
        return () => { client.off?.('message', onAny as any) }
    }, [client, addBusinessMetric])

    return { addBusinessMetric }
}
