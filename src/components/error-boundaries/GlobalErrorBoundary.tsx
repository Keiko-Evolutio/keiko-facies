import React from 'react'
import { logClientError, categorizeError } from '@/services/error-logging'
import { useToast } from '@/services/toast'

type Props = { children: React.ReactNode }
type State = { hasError: boolean; error: Error | null }

export class GlobalErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  async componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    await logClientError({
      message: error.message,
      category: categorizeError(error),
      name: error.name,
      severity: 'error',
      raw: { error: { name: error.name, message: error.message, stack: error.stack }, errorInfo },
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className='p-6 m-4 border border-red-200 rounded bg-red-50 text-red-700'>
          <h2 className='font-semibold mb-2'>Ein unerwarteter Fehler ist aufgetreten</h2>
          <div className='text-sm mb-4'>{this.state.error?.message ?? 'Unbekannter Fehler'}</div>
          <button className='px-3 py-2 rounded bg-red-600 text-white' onClick={() => window.location.reload()}>Seite neu laden</button>
        </div>
      )
    }
    return this.props.children
  }
}

export const GlobalErrorBoundaryWithToast: React.FC<Props> = ({ children }) => {
  const { show } = useToast()
  return (
    <GlobalErrorBoundary>
      {children}
    </GlobalErrorBoundary>
  )
}
