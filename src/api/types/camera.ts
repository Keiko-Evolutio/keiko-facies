// src/api/types/camera.ts
import { z } from 'zod'

export const CaptureResponseSchema = z.object({
    status: z.string(),
    image_url: z.string(),
    metadata: z.object({
        timestamp: z.string(),
        resolution: z.object({ width: z.number(), height: z.number() }),
        format: z.string(),
        file_size: z.number(),
    }),
})

export type CaptureResponse = z.infer<typeof CaptureResponseSchema>
