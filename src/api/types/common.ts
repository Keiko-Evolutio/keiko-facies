// src/api/types/common.ts
import { z } from 'zod'

// Gemeinsame, generische Response-Wrapper und Hilfstypen

export const ErrorSchema = z.object({
    message: z.string(),
    code: z.string().optional(),
    trace_id: z.string().optional(),
})

export type ErrorPayload = z.infer<typeof ErrorSchema>

export const PaginatedSchema = <T extends z.ZodTypeAny>(item: T) =>
    z.object({
        items: z.array(item),
        total: z.number().int().nonnegative(),
        page: z.number().int().nonnegative(),
        page_size: z.number().int().positive(),
    })

export type Paginated<T> = {
    items: T[]
    total: number
    page: number
    page_size: number
}

export const OkSchema = <T extends z.ZodTypeAny>(data: T) =>
    z.object({
        ok: z.literal(true),
        data,
        trace_id: z.string().optional(),
    })

export const ErrSchema = z.object({
    ok: z.literal(false),
    error: ErrorSchema,
    trace_id: z.string().optional(),
})

export type OkResponse<T> = {
    ok: true
    data: T
    trace_id?: string
}

export type ErrResponse = {
    ok: false
    error: ErrorPayload
    trace_id?: string
}

export type ApiResult<T> = OkResponse<T> | ErrResponse
