import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { Severity } from '@/types/errors'

export interface ToastOptions {
  id?: string
  title?: string
  message: string
  severity?: Severity
  durationMs?: number
}

export interface ToastItem extends Required<Pick<ToastOptions, 'id' | 'message' | 'severity'>> {
  title?: string
  expiresAt: number
}

interface ToastContextValue {
  toasts: ToastItem[]
  show: (opts: ToastOptions) => string
  remove: (id: string) => void
  clear: () => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Zustand der sichtbaren Toasts (stackbar)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const remove = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const show = useCallback((opts: ToastOptions): string => {
    const id = opts.id ?? Math.random().toString(36).slice(2)
    const severity = opts.severity ?? 'info'
    const duration = opts.durationMs ?? 4000
    const expiresAt = Date.now() + duration
    const item: ToastItem = { id, title: opts.title, message: opts.message, severity, expiresAt }

    setToasts((list) => [...list, item])
    // Automatisches Entfernen nach Ablaufzeit
    window.setTimeout(() => remove(id), duration + 50)
    return id
  }, [remove])

  const clear = useCallback(() => setToasts([]), [])

  const value = useMemo<ToastContextValue>(() => ({ toasts, show, remove, clear }), [toasts, show, remove, clear])

  return (
    <ToastContext.Provider value={value}>
      {/* Globaler Zugriff für Interceptors/Stores ohne Hooks */}
      <GlobalToastBridge show={show} />
      {children}
      {/* UI-Container für Toasts */}
      <div className='fixed bottom-4 right-4 flex flex-col gap-2 z-50'>
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`min-w-72 max-w-96 p-3 rounded shadow text-white ${
              t.severity === 'error' ? 'bg-red-600' :
              t.severity === 'warning' ? 'bg-yellow-600' :
              t.severity === 'success' ? 'bg-green-600' : 'bg-gray-800'
            }`}
            role='status'
          >
            {t.title && <div className='font-semibold mb-1'>{t.title}</div>}
            <div className='text-sm'>{t.message}</div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('ToastProvider missing')
  return ctx
}

// Bridge-Komponente, setzt window.__keiko_toast zur Nutzung außerhalb von React Hooks
const GlobalToastBridge: React.FC<{ show: (opts: ToastOptions) => string }> = ({ show }) => {
  useEffect(() => {
    ;(window as any).__keiko_toast = show
    return () => { if ((window as any).__keiko_toast === show) delete (window as any).__keiko_toast }
  }, [show])
  return null
}
