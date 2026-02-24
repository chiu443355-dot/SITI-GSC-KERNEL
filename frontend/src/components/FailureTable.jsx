import React, { useState } from "react";

export default function FailureTable({ kState }) {
  const [page, setPage] = useState(0);
  const records = kState?.inverse_reliability?.records ?? [];
  const pageSize = 8;
  const total = records.length;
  const paginated = records.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div
      data-testid="failure-table"
      style={{ background: '#0A0A0A', border: '1px solid #1F1F1F', flex: 1, minHeight: 0 }}
    >
      {/* Header */}
      <div style={{
        borderBottom: '1px solid #1F1F1F',
        padding: '8px 12px',
        background: '#070707',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 9, color: '#A1A1AA', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            INVERSE RELIABILITY PARADOX
          </div>
          <div style={{ fontSize: 8, color: '#555', marginTop: 2 }}>
            HIGH-IMPORTANCE · LATE DELIVERY
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#FF3B30', fontWeight: 700 }}>
            {kState?.inverse_reliability?.failure_count?.toLocaleString() ?? 0}
          </div>
          <div style={{ fontSize: 8, color: '#555' }}>FAILURES</div>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #141414' }}>
        {[
          { label: 'HIGH-IMP TOTAL', value: kState?.inverse_reliability?.total_high?.toLocaleString(), color: '#FFB340' },
          { label: 'LEAKAGE/UNIT', value: `$${kState?.leakage_seed ?? '3.94'}`, color: '#FF9F0A' },
          { label: 'TOTAL LEAKAGE', value: `$${kState?.inverse_reliability?.leakage_total?.toLocaleString('en-US', { minimumFractionDigits: 2 }) ?? '0.00'}`, color: '#FF3B30' },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, padding: '6px 10px', borderRight: i < 2 ? '1px solid #141414' : 'none' }}>
            <div style={{ fontSize: 8, color: '#555', letterSpacing: '0.1em' }}>{s.label}</div>
            <div style={{ fontSize: 12, color: s.color, fontWeight: 700 }}>{s.value ?? '—'}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table className="ng-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>ID</th>
              <th>HUB</th>
              <th>MODE</th>
              <th>COST</th>
              <th>WT(g)</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: '#555', fontSize: 10, padding: 16 }}>
                  NO DATA
                </td>
              </tr>
            ) : (
              paginated.map((row, i) => (
                <tr key={i} data-testid={`failure-row-${i}`}>
                  <td style={{ color: '#64D2FF' }}>{row.id}</td>
                  <td>
                    <span style={{
                      background: '#1A0A00', color: '#FF9F0A', fontSize: 9,
                      padding: '1px 5px', fontWeight: 700
                    }}>{row.hub}</span>
                  </td>
                  <td style={{ color: '#A1A1AA', fontSize: 10 }}>{row.mode}</td>
                  <td style={{ color: '#FFB340' }}>${row.cost}</td>
                  <td style={{ color: '#555' }}>{row.weight?.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderTop: '1px solid #141414' }}>
          <button
            data-testid="failure-prev-btn"
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
            style={{
              background: 'none', border: '1px solid #2A2A2A', color: page === 0 ? '#333' : '#A1A1AA',
              fontSize: 9, padding: '3px 8px', cursor: page === 0 ? 'not-allowed' : 'pointer', letterSpacing: '0.1em'
            }}
          >PREV</button>
          <span style={{ fontSize: 9, color: '#555' }}>
            {page + 1} / {Math.ceil(total / pageSize)}
          </span>
          <button
            data-testid="failure-next-btn"
            disabled={(page + 1) * pageSize >= total}
            onClick={() => setPage(p => p + 1)}
            style={{
              background: 'none', border: '1px solid #2A2A2A',
              color: (page + 1) * pageSize >= total ? '#333' : '#A1A1AA',
              fontSize: 9, padding: '3px 8px',
              cursor: (page + 1) * pageSize >= total ? 'not-allowed' : 'pointer', letterSpacing: '0.1em'
            }}
          >NEXT</button>
        </div>
      )}
    </div>
  );
}
