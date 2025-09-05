import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { APIErrorBoundary } from '@/components/error-boundaries/APIErrorBoundary'

vi.mock('@/services/error-logging', () => ({
  logClientError: vi.fn().mockResolvedValue(undefined),
}))

const Boom: React.FC = () => {
  throw new Error('api failed')
}

const Fallback: React.FC = () => <div data-testid="fallback">Fallback</div>

describe('FallbackErrorBoundary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders children when no error occurs', () => {
    render(
      <APIErrorBoundary>
        <div data-testid="ok">OK</div>
      </APIErrorBoundary>,
    )
    expect(screen.getByTestId('ok')).toBeInTheDocument()
  })

  it('renders custom fallback when error occurs', async () => {
    const { logClientError } = await import('@/services/error-logging')
    render(
      <APIErrorBoundary fallback={<Fallback />}>
        <Boom />
      </APIErrorBoundary>,
    )
    expect(await screen.findByTestId('fallback')).toBeInTheDocument()
    expect(logClientError).toHaveBeenCalledTimes(1)
  })
})
