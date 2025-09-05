import React, { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { APIErrorBoundary } from '@/components/error-boundaries/APIErrorBoundary'

vi.mock('@/services/error-logging', () => ({
  logClientError: vi.fn().mockResolvedValue(undefined),
}))

/**
 * Komponente, die bei Klick auf einen Button einen Fehler wirft.
 */
const CrashOnClick: React.FC = () => {
  const [crash, setCrash] = useState(false)
  if (crash) throw new Error('click boom')
  return <button onClick={() => setCrash(true)}>Crash</button>
}

describe('ButtonErrorBoundary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows retry button on error and recovers via onRetry', async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined)
    render(
      <APIErrorBoundary onRetry={onRetry}>
        <CrashOnClick />
      </APIErrorBoundary>,
    )

    fireEvent.click(screen.getByText('Crash'))

    const retryBtn = await screen.findByRole('button')
    expect(retryBtn).toHaveTextContent(/Erneut versuchen|Wiederholen/i)

    fireEvent.click(retryBtn)
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1))
  })
})
