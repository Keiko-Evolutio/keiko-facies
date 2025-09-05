import React, { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'

// Einfache UI-Elemente aus bestehendem Designsystem
import { Button } from '@/components/ui/button'
import { useAuth } from '@/store/use-auth'

// Typen
type ResolutionKey = '640x480' | '1280x720' | '1920x1080'

interface CaptureResponse {
  status: string
  image_url: string
  metadata: {
    timestamp: string
    resolution: { width: number; height: number }
    format: string
    file_size: number
  }
}

interface Props {
  apiBase?: string
  token?: string
  userId?: string
  onCaptured?: (result: CaptureResponse) => void
}

export type CameraCaptureHandle = {
  captureNow: () => Promise<void>
  confirmSaveNow: () => Promise<void>
}

const RESOLUTIONS: ResolutionKey[] = ['640x480', '1280x720', '1920x1080']

const CameraCapture = forwardRef<CameraCaptureHandle, Props>(({ apiBase, token: propToken, userId, onCaptured }, ref) => {
  const { getAuthHeaders } = useAuth()

  // Verwende Auth-Token falls kein expliziter Token übergeben wurde
  const token = propToken || getAuthHeaders().Authorization?.replace('Bearer ', '')

  // UI State
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [result, setResult] = useState<CaptureResponse | null>(null)
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null)
  const [resolution, setResolution] = useState<ResolutionKey>('640x480')

  // Kameravorschau (Client) – optional, falls Berechtigungen erteilt
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const startPreview = useCallback(async () => {
    setError(null)
    try {
      if (!navigator.mediaDevices?.getUserMedia) return

      // Stoppe vorherigen Stream falls vorhanden
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        // Verwende loadedmetadata Event statt direktes play()
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch((e) => {
            console.warn('Video play failed:', e?.message ?? e)
          })
        }
      }
    } catch (e: any) {
      // Keine harte Fehlermeldung – Preview ist optional
      console.warn('Camera preview not available:', e?.message ?? e)
    }
  }, [])

  const stopPreview = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
      videoRef.current.onloadedmetadata = null
    }
  }, [])

  useEffect(() => {
    startPreview()
    return () => stopPreview()
  }, [startPreview, stopPreview])

  const endpoint = apiBase || import.meta.env.VITE_API_ENDPOINT || 'http://localhost:8000'

  const captureFromPreviewAndUpload = useCallback(async (): Promise<CaptureResponse> => {
    // Lokales Foto aus der Videovorschau aufnehmen; Upload optional
    if (!videoRef.current) throw new Error('Keine Kameravorschau verfügbar')
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar')
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas toBlob fehlgeschlagen'))), 'image/jpeg', 0.9)
    )
    setCapturedBlob(blob)
    // Nur Vorschau setzen; Upload erfolgt separat über confirmSaveNow
    try { setPreviewUrl(URL.createObjectURL(blob)) } catch (_) {}
    // Rückgabe für Kompatibilität: nichts hochgeladen → Dummy
    return { status: 'ok', image_url: '', metadata: { timestamp: new Date().toISOString(), resolution: { width: canvas.width, height: canvas.height }, format: 'image/jpeg', file_size: blob.size } }
  }, [])

  const takePhoto = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      // Statt Sofort-Upload: immer erst lokal aufnehmen und anzeigen
      const data = await captureFromPreviewAndUpload()
      setResult(null)
      if (data?.image_url) setPreviewUrl(data.image_url)
    } catch (e: any) {
      setError(e?.message ?? 'Unbekannter Fehler beim Aufnehmen des Fotos')
    } finally {
      setLoading(false)
    }
  }, [endpoint, token, userId, resolution, onCaptured, captureFromPreviewAndUpload])

  useImperativeHandle(ref, () => ({
    captureNow: async () => {
      await takePhoto()
    },
    confirmSaveNow: async () => {
      if (!capturedBlob) return
      const form = new FormData()
      form.append('file', new File([capturedBlob], 'photo.jpg', { type: 'image/jpeg' }))
      const res = await fetch(`${endpoint}/api/camera/upload`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          ...(userId ? { 'X-User-Id': userId } : {}),
          'X-Tenant-Id': 'public', // Fallback Tenant für Kompatibilität
        },
        body: form,
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      const data: CaptureResponse = await res.json()
      setResult(data)
      setPreviewUrl(data.image_url)
      onCaptured?.(data)
    },
  }))

  const handleRetake = useCallback(() => {
    setPreviewUrl(null)
    setResult(null)
    setError(null)
  }, [])

  return (
    <div className='w-full max-w-xl mx-auto p-4 border rounded-md bg-background/50'>
      <div className='flex flex-col gap-3'>
        <div className='flex items-center justify-between gap-2 flex-wrap'>
          <div className='text-sm text-muted-foreground'>Resolution</div>
          <div className='flex gap-2'>
            {RESOLUTIONS.map((r) => (
              <button
                key={r}
                onClick={() => setResolution(r)}
                className={`px-3 py-1 rounded border text-sm ${
                  resolution === r ? 'bg-primary text-white' : 'bg-transparent'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Client-seitige Preview falls möglich */}
        <div className='relative w-full aspect-video bg-black/50 rounded overflow-hidden'>
          {previewUrl ? (
            <img src={previewUrl} alt='Captured' className='w-full h-full object-contain' />
          ) : (
            <video ref={videoRef} className='w-full h-full object-cover' muted playsInline />
          )}
        </div>

        {error && (
          <div className='text-red-600 text-sm' role='alert'>
            {error}
          </div>
        )}

        <div className='flex items-center justify-end gap-2'>
          {previewUrl ? (
            <>
              <Button variant='outline' onClick={handleRetake}>Retake</Button>
              <a href={previewUrl} target='_blank' rel='noreferrer'>
                <Button>Save</Button>
              </a>
            </>
          ) : (
            <Button onClick={takePhoto} disabled={loading}>
              {loading ? 'Taking photo…' : 'Take photo'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
})

export default CameraCapture
