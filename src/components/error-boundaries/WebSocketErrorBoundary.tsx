import React from 'react'
import { useToast } from '@/services/toast'
import { logClientError } from '@/services/error-logging'

type Props = {
  children: React.ReactNode
  onReconnect?: () => Promise<void> | void
}

type State = { hasError: boolean; error: Error | null; reconnecting: boolean }

export class WebSocketErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, reconnecting: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, reconnecting: false }
  }

  async componentDidCatch(error: Error) {
    await logClientError({
      message: error.message,
      category: 'websocket',
      name: error.name,
      severity: 'error',
      raw: { error: { name: error.name, message: error.message, stack: error.stack } },
    })
  }

  private handleReconnect = async () => {
    if (!this.props.onReconnect) return
    this.setState({ reconnecting: true })
    try {
      await this.props.onReconnect()
      this.setState({ hasError: false, error: null, reconnecting: false })
    } catch (e) {
      this.setState({ reconnecting: false })
    }
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className='p-4 border rounded bg-blue-50 border-blue-200 text-blue-800'>
          <div className='font-semibold mb-1'>WebSocket-Verbindungsfehler</div>
          <div className='text-sm mb-3'>{this.state.error?.message ?? 'Unbekannter Fehler'}</div>
          {this.props.onReconnect && (
            <button
              className='px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-70'
              onClick={this.handleReconnect}
              disabled={this.state.reconnecting}
            >
              {this.state.reconnecting ? 'Verbinden…' : 'Neu verbinden'}
            </button>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
