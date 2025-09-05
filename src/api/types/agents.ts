// src/api/types/agents.ts
import { z } from 'zod'

export const AgentFunctionCallSchema = z.object({
    call_id: z.string(),
    id: z.string(),
    name: z.string(),
    arguments: z.record(z.any()),
})
export type AgentFunctionCall = z.infer<typeof AgentFunctionCallSchema>

export const AgentExecuteRequestSchema = AgentFunctionCallSchema
export type AgentExecuteRequest = z.infer<typeof AgentExecuteRequestSchema>

export const AgentExecuteResponseSchema = z.object({ success: z.boolean().default(true) })
export type AgentExecuteResponse = z.infer<typeof AgentExecuteResponseSchema>
