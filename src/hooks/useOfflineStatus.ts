import { useEffect, useState } from 'react'

/**
 * useOfflineStatus – erkennt Offline/Online und liefert Status für UI.
 */
export const useOfflineStatus = () => {
    const [isOffline, setIsOffline] = useState(!navigator.onLine)
    useEffect(() => {
        const on = () => setIsOffline(false)
        const off = () => setIsOffline(true)
        window.addEventListener('online', on)
        window.addEventListener('offline', off)
        return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
    }, [])
    return { isOffline } as const
}
