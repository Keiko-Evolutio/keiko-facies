import React from 'react'

type Props = { children: React.ReactNode }
type State = { hasError: boolean; message?: string }

/**
 * ChartErrorBoundary – schützt Chart-Komponenten vor Renderfehlern.
 */
export class ChartErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }
  render() {
    if (this.state.hasError) {
      return <div className='text-sm text-red-600'>Diagramm konnte nicht gerendert werden: {this.state.message}</div>
    }
    return this.props.children
  }
}

export default ChartErrorBoundary
