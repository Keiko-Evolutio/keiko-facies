import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GlobalErrorBoundary } from '@/components/error-boundaries/GlobalErrorBoundary'

// Mock für strukturiertes Error-Logging
vi.mock('@/services/error-logging', () => ({
  logClientError: vi.fn().mockResolvedValue(undefined),
  categorizeError: vi.fn().mockReturnValue('runtime'),
}))

// Mock für Toast-Hook (wird hier nicht zwingend aufgerufen – aber abgesichert)
vi.mock('@/services/toast', () => ({
  useToast: () => ({ show: vi.fn(), remove: vi.fn(), clear: vi.fn(), toasts: [] }),
  ToastProvider: ({ children }: any) => <div>{children}</div>,
}))

/**
 * Testkomponente, die beim Rendern einen Fehler wirft.
 */
const Boom: React.FC = () => {
  throw new Error('boom')
}

/**
 * Testkomponente, die normal rendert.
 */
const Ok: React.FC = () => <div data-testid="ok">OK</div>

describe('RenderErrorBoundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders children when no error occurs', () => {
    render(
      <GlobalErrorBoundary>
        <Ok />
      </GlobalErrorBoundary>,
    )
    expect(screen.getByTestId('ok')).toBeInTheDocument()
  })

  it('catches render errors and shows fallback UI', async () => {
    const { logClientError } = await import('@/services/error-logging')
    render(
      <GlobalErrorBoundary>
        <Boom />
      </GlobalErrorBoundary>,
    )

    expect(await screen.findByText(/Ein unerwarteter Fehler ist aufgetreten/i)).toBeInTheDocument()
    expect(logClientError).toHaveBeenCalledTimes(1)
    const arg = (logClientError as any).mock.calls[0][0]
    expect(arg.message).toContain('boom')
    expect(arg.category).toBeDefined()
    expect(arg.severity).toBe('error')
  })
})
