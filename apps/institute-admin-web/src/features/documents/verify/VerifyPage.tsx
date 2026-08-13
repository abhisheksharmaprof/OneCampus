import { useEffect, useState } from 'react'
import { decodePayload, type QrDocPayload } from '../engine/qrPayload'

/** Login-free document verification. Renders ONLY from the URL #fragment — the
 *  payload never reaches a server and no API/database is touched. */
export default function VerifyPage() {
  const [payload, setPayload] = useState<QrDocPayload | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    const read = () => {
      const fragment = window.location.hash.replace(/^#/, '')
      if (!fragment) { setPayload(null); setError(true); return }
      // decodePayload is the trust boundary: it never throws, caps input size and
      // shape-validates before returning ok. {ok:false} means the fragment is
      // invalid, damaged or forged — show the error state instead of rendering.
      const result = decodePayload(fragment)
      if (result.ok) {
        setPayload(result.payload)
        setError(false)
      } else {
        setPayload(null)
        setError(true)
      }
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])

  const formatAmount = (value: number) =>
    value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Defense in depth: decodePayload already rejects >200 rows, but never render an
  // unbounded list even if a payload slips through another path.
  const MAX_RENDERED_ROWS = 200
  const visibleItems = payload?.items?.slice(0, MAX_RENDERED_ROWS)
  const hiddenItemCount = (payload?.items?.length ?? 0) - (visibleItems?.length ?? 0)

  return (
    <div style={{ minHeight: '100vh', background: '#F3F5F8', padding: 24, fontFamily: 'Inter, system-ui, sans-serif', color: '#16212E' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 12px 28px -12px rgba(22,33,46,.18)' }}>
        {error && (
          <>
            <h1 style={{ fontSize: 18, marginTop: 0 }}>Document verification</h1>
            <p style={{ color: '#C0392B' }}>This link doesn't contain readable document data — the code is invalid or damaged. Scan the QR code on the printed document again.</p>
          </>
        )}
        {payload && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid #173A5E', paddingBottom: 10 }}>
              <div>
                <h1 style={{ fontSize: 18, margin: 0, color: '#173A5E' }}>{payload.inst}</h1>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#5B6675' }}>{payload.cat.replace(/_/g, ' ')} · verified from QR data</p>
              </div>
              <strong>#{payload.num}</strong>
            </div>
            <dl style={{ fontSize: 13, lineHeight: 1.8 }}>
              {payload.student && <><dt style={{ float: 'left', color: '#5B6675', width: 90 }}>For</dt><dd style={{ margin: 0 }}>{payload.student}</dd></>}
              <dt style={{ float: 'left', color: '#5B6675', width: 90 }}>Date</dt><dd style={{ margin: 0 }}>{payload.date}</dd>
              {payload.status && <><dt style={{ float: 'left', color: '#5B6675', width: 90 }}>Status</dt><dd style={{ margin: 0 }}>{payload.status}</dd></>}
            </dl>
            {visibleItems && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
                <thead><tr style={{ background: '#173A5E', color: '#fff' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Item</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px' }}>Amount</th>
                </tr></thead>
                <tbody>
                  {visibleItems.map(([label, amount], index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #EEF0F4' }}>
                      <td style={{ padding: '6px 8px' }}>{label}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatAmount(amount)}</td>
                    </tr>
                  ))}
                  {hiddenItemCount > 0 && (
                    <tr>
                      <td colSpan={2} style={{ padding: '6px 8px', color: '#5B6675' }}>…and {hiddenItemCount} more items</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
            {payload.totals?.map(([label, amount], index) => (
              <div key={index} style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: 8, fontSize: 14 }}>
                <span>{label}</span><span>{formatAmount(amount)}</span>
              </div>
            ))}
            <button type="button" onClick={() => window.print()}
              style={{ marginTop: 20, padding: '8px 16px', background: '#173A5E', color: '#fff', border: 0, borderRadius: 8, cursor: 'pointer' }}>
              Print this record
            </button>
          </>
        )}
      </div>
    </div>
  )
}
