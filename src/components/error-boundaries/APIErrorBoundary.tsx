import React from 'react'
import { useToast } from '@/services/toast'
import { logClientError, categorizeError } from '@/services/error-logging'
import type { Severity } from '@/types/errors'

type Props = {
  children: React.ReactNode
  fallback?: React.ReactNode
  onRetry?: () => Promise<void> | void
}

type State = { hasError: boolean; error: Error | null; retrying: boolean }

export class APIErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, retrying: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, retrying: false }
  }

  async componentDidCatch(error: Error) {
    await logClientError({
      message: error.message,
      category: 'api',
      name: error.name,
      severity: 'error',
      raw: { error: { name: error.name, message: error.message, stack: error.stack } },
    })
  }

  private handleRetry = async () => {
    if (!this.props.onRetry) return
    this.setState({ retrying: true })
    try {
      await this.props.onRetry()
      this.setState({ hasError: false, error: null, retrying: false })
    } catch (e: any) {
      this.setState({ retrying: false })
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className='p-4 border rounded bg-amber-50 border-amber-200 text-amber-800'>
          <div className='font-semibold mb-1'>API-Fehler</div>
          <div className='text-sm mb-3'>{this.state.error?.message ?? 'Unbekannter Fehler'}</div>
          {this.props.onRetry && (
            <button
              className='px-3 py-2 rounded bg-amber-600 text-white disabled:opacity-70'
              onClick={this.handleRetry}
              disabled={this.state.retrying}
            >
              {this.state.retrying ? 'Wiederholen…' : 'Erneut versuchen'}
            </button>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
