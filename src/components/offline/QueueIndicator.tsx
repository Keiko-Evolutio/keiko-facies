import React, { useEffect, useState } from 'react'
import { flush, getQueueSummary } from '@/services/offline/requestQueue'

type Status = 'idle' | 'syncing' | 'failed'

/**
 * Visueller Queue-Statusindikator (ARIA-unterstützt) mit manueller Sync-Aktion.
 */
export const QueueIndicator: React.FC = () => {
  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [status, setStatus] = useState<Status>('idle')
  const [size, setSize] = useState<number>(0)
  const [lastSync, setLastSync] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    try {
      const s = await getQueueSummary()
      setSize(s.size)
      setLastSync(s.lastSyncTs)
      setStatus(s.syncing ? 'syncing' : (s.lastError ? 'failed' : 'idle'))
      setError(s.lastError)
    } catch {
      // noop
    }
  }

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    const t = window.setInterval(refresh, 5000)
    refresh().catch(() => {})
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      clearInterval(t)
    }
  }, [])

  const onSyncNow = async () => {
    try {
      setStatus('syncing')
      await flush()
      await refresh()
    } catch (e: any) {
      setStatus('failed')
      setError(String(e?.message || 'sync_failed'))
    }
  }

  const color = !online ? 'bg-yellow-600' : status === 'failed' ? 'bg-red-600' : status === 'syncing' ? 'bg-blue-600' : 'bg-green-600'
  const label = !online ? 'Offline' : status === 'failed' ? 'Fehlgeschlagen' : status === 'syncing' ? 'Synchronisation' : 'Bereit'

  return (
    <div
      className={`fixed top-3 right-3 text-white text-sm rounded shadow ${color}`}
      role="status"
      aria-live="polite"
      aria-label={`Queue Status ${label}, Größe ${size}`}
    >
      <div className="px-3 py-2 flex items-center gap-3">
        <span>{label}</span>
        <span>|</span>
        <span>Queue: {size}</span>
        <button aria-label="Sync now" onClick={onSyncNow} className="ml-3 bg-white/20 hover:bg-white/30 px-2 py-1 rounded">Sync Now</button>
      </div>
      {lastSync ? (
        <div className="px-3 pb-2 text-xs opacity-80">Letzte Sync: {new Date(lastSync).toLocaleTimeString()}</div>
      ) : null}
      {error ? <div className="px-3 pb-2 text-xs opacity-80">Fehler: {error}</div> : null}
    </div>
  )
}

export default QueueIndicator
