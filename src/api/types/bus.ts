// src/api/types/bus.ts
import { z } from 'zod'

export const BusSchemaItemSchema = z.object({
    uri: z.string(),
    version: z.number(),
    type: z.string(),
})
export type BusSchemaItem = z.infer<typeof BusSchemaItemSchema>

export const BusDLQItemSchema = z.object({
    subject_filter: z.string(),
    approx: z.boolean(),
    items: z.number(),
})
export type BusDLQItem = z.infer<typeof BusDLQItemSchema>

export const BusSchemasResponseSchema = z.object({ schemas: z.array(BusSchemaItemSchema) })
export type BusSchemasResponse = z.infer<typeof BusSchemasResponseSchema>

export const BusDLQResponseSchema = z.object({ items: z.array(BusDLQItemSchema) })
export type BusDLQResponse = z.infer<typeof BusDLQResponseSchema>
