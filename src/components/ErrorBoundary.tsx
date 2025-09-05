import React from 'react'
import { v4 as uuidv4 } from 'uuid'

type Props = {
  children: React.ReactNode
  fallback?: React.ReactNode
}

type State = {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  // Initialisiert den lokalen Fehlerzustand
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  // Fängt Fehler in Kindkomponenten ab
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  // Meldet Fehler zentral (kann an Monitoring weitergeleitet werden)
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Strukturiertes Logging mit Trace-ID
    const traceId = uuidv4()
    console.error('[ErrorBoundary]', { traceId, error, errorInfo })
  }

  // Rendert Fallback oder Kinder
  render(): React.ReactNode {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div role='alert' className='p-4 border border-red-200 rounded text-red-700 bg-red-50'>
          <div className='font-semibold mb-1'>Ein Fehler ist aufgetreten</div>
          <div className='text-sm'>{this.state.error?.message ?? 'Unbekannter Fehler'}</div>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
