import React, { useEffect, useState } from 'react'
import { apiClient } from '@/api/client'
import { BusDLQResponseSchema, BusSchemasResponseSchema, type BusDLQItem, type BusSchemaItem } from '@/api/types/bus'

type SchemaItem = { uri: string; version: number; type: string }
type DLQItem = { subject_filter: string; approx: boolean; items: number }

export const BusExplorer: React.FC = () => {
  const [schemas, setSchemas] = useState<SchemaItem[]>([])
  const [dlq, setDlq] = useState<DLQItem[]>([])
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const schemasRes = await apiClient.get('/api/v1/bus/admin/schemas', BusSchemasResponseSchema)
      if (schemasRes.ok) setSchemas(schemasRes.data.schemas)

      const dlqRes = await apiClient.get('/api/v1/bus/admin/dlq', BusDLQResponseSchema)
      if (dlqRes.ok) setDlq(dlqRes.data.items)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div style={{ padding: 16 }}>
      <h2>KEI Bus Explorer</h2>
      {loading && <div>Laden...</div>}
      <section>
        <h3>Schemas</h3>
        <table>
          <thead><tr><th>URI</th><th>Version</th><th>Typ</th></tr></thead>
          <tbody>
            {schemas.map((s) => (
              <tr key={`${s.uri}@${s.version}`}>
                <td>{s.uri}</td>
                <td>{s.version}</td>
                <td>{s.type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h3>DLQ Übersicht</h3>
        <table>
          <thead><tr><th>Filter</th><th>Items</th><th>approx</th></tr></thead>
          <tbody>
            {dlq.map((d, idx) => (
              <tr key={idx}>
                <td>{d.subject_filter}</td>
                <td>{d.items}</td>
                <td>{String(d.approx)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <button onClick={load}>Aktualisieren</button>
    </div>
  )
}
