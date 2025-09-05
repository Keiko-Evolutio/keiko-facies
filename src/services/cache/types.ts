// src/services/cache/types.ts
// Typdefinitionen für den Cache-Layer

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface CacheEntry<T = unknown> {
    key: string
    tags: string[]
    createdAt: number
    ttlMs: number
    data: T
}

export interface CacheStrategy {
    // TTL in Millisekunden
    ttlMs: number
    // Liste von Tags für Invalidation
    tags?: string[]
    // Dynamische Tag-Berechnung basierend auf URL
    tagsFn?: (url: string) => string[]
    // Modus: cache-first (GET), network-first (default)
    mode?: 'cache-first' | 'network-first'
}

export interface CacheConfig {
    // Standardstrategie, falls kein Endpoint-Match
    defaultStrategy: CacheStrategy
    // Endpointspezifische Strategien (Regex-Match auf Pfad)
    perEndpoint?: Array<{ pattern: RegExp; strategy: CacheStrategy }>
}
