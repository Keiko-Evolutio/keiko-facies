import { z } from 'zod'

// Webhook Target Typen
export const WebhookTargetSchema = z.object({
    id: z.string(),
    name: z.string(),
    url: z.string().url(),
    is_active: z.boolean().default(true),
    event_types: z.array(z.string()).default([]),
    headers: z.record(z.string()).default({}),
    auth_type: z.enum(['none', 'bearer', 'basic', 'api_key', 'custom']).default('none'),
    auth_value: z.string().optional(),
    auth_username: z.string().optional(),
    auth_password: z.string().optional(),
    http_method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
    content_type: z
        .enum(['application/json', 'application/x-www-form-urlencoded', 'text/plain'])
        .default('application/json'),
    signature_secret: z.string().optional(),
    tenant_id: z.string().optional(),
    created_at: z.string().optional(),
})
export type WebhookTarget = z.infer<typeof WebhookTargetSchema>

export const WebhookTargetCreateSchema = WebhookTargetSchema.omit({ id: true, created_at: true })
export type WebhookTargetCreate = z.infer<typeof WebhookTargetCreateSchema>

export const WebhookTargetUpdateSchema = WebhookTargetCreateSchema.partial()
export type WebhookTargetUpdate = z.infer<typeof WebhookTargetUpdateSchema>

export const WebhookTargetsResponseSchema = z.object({ items: z.array(WebhookTargetSchema) })
export type WebhookTargetsResponse = z.infer<typeof WebhookTargetsResponseSchema>

// Deliveries
export const WebhookDeliverySchema = z.object({
    id: z.string(),
    target_id: z.string(),
    event_type: z.string(),
    status: z.enum(['pending', 'success', 'failed']),
    attempt: z.number().int().nonnegative().default(0),
    max_retries: z.number().int().nonnegative().default(0),
    response_status: z.number().int().optional(),
    error: z.string().optional(),
    created_at: z.string(),
})
export type WebhookDelivery = z.infer<typeof WebhookDeliverySchema>

export const WebhookDeliveriesResponseSchema = z.object({ items: z.array(WebhookDeliverySchema) })
export type WebhookDeliveriesResponse = z.infer<typeof WebhookDeliveriesResponseSchema>
