import React, { useEffect, useState } from 'react'

type Props = { className?: string }

export const OfflineIndicator: React.FC<Props> = ({ className }) => {
  const [online, setOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (online) return null

  return (
    <div className={className || 'fixed bottom-3 right-3 px-3 py-2 bg-yellow-600 text-white text-sm rounded shadow'}>
      Offline – Aktionen werden gepuffert
    </div>
  )
}

export default OfflineIndicator
