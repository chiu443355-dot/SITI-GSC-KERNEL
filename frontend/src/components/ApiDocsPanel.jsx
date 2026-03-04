import React from "react";

export default function ApiDocsPanel() {
  const requestSchema = {
    shipments: [
      {
        id: "string (unique shipment identifier)",
        warehouse_block: "A | B | C | D | F",
        mode_of_shipment: "Ship | Flight | Road",
        weight_gms: "number (grams)",
        cost: "number (USD)",
        product_importance: "Low | Medium | High",
        customer_care_calls: "number (1-7)",
      },
    ],
    config: {
      mu: "number (service capacity units/hr, default: 150)",
      threshold: "number (critical rho threshold, default: 0.85)",
    },
  };

  const responseSchema = {
    status: "nominal | critical | collapse",
    network: {
      global_rho: "number (0.0 - 1.5)",
      hubs: [
        {
          name: "Alpha | Beta | Gamma",
          rho: "number (utilization = lambda/mu)",
          lambda: "number (arrival rate /hr)",
          mu: "number (service capacity /hr)",
        },
      ],
      cascade_events: [
        {
          from_hub: "string",
          to_hub: "string",
          excess_lambda: "number (units/hr diverted)",
        },
      ],
    },
    prediction: {
      rho_t3: "number (135-min forecast via 2D Kalman)",
    },
    recommended_action: "NOMINAL | MONITOR | DIVERT",
    timestamp: "ISO 8601 UTC",
  };

  const curlExample = `curl -X POST https://api.siti-intelligence.io/api/v1/intercept \\
  -H "Authorization: Bearer <YOUR_API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "shipments": [
      {"id": "SHP-001", "warehouse_block": "A", "weight_gms": 3500, "cost": 245}
    ],
    "config": {"mu": 150, "threshold": 0.85}
  }'`;

  const pythonExample = `import requests

resp = requests.post(
    "https://api.siti-intelligence.io/api/v1/intercept",
    headers={"Authorization": "Bearer <YOUR_API_KEY>"},
    json={
        "shipments": [{"id": "SHP-001", "warehouse_block": "A", "cost": 245}],
        "config": {"mu": 150}
    }
)
data = resp.json()
if data["recommended_action"] == "DIVERT":
    trigger_diversion(data["network"]["cascade_events"])`;

  return (
    <div data-testid="api-docs-panel" className="api-docs-responsive"
      style={{ padding: "16px", background: "#0A0A0A", border: "1px solid #1F1F1F" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{
            fontFamily: "Chivo, sans-serif", fontWeight: 900, fontSize: 14,
            color: "#FFB340", letterSpacing: "0.15em",
          }}>
            ENTERPRISE INTEGRATION API
          </div>
          <div style={{ fontSize: 9, color: "#555", letterSpacing: "0.1em", marginTop: 2 }}>
            SITI INTELLIGENCE / MIMI KERNEL / v1.0
          </div>
        </div>
        <div style={{
          background: "#001A00", border: "1px solid #32D74B",
          padding: "3px 10px", fontSize: 8, color: "#32D74B",
          fontWeight: 700, letterSpacing: "0.12em",
        }}>
          LIVE
        </div>
      </div>

      {/* Endpoint */}
      <div style={{
        background: "#060606", border: "1px solid #1F1F1F",
        padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12,
      }}>
        <span style={{
          background: "#001A00", color: "#32D74B", fontSize: 10,
          fontWeight: 700, padding: "3px 8px", letterSpacing: "0.1em",
        }}>POST</span>
        <span style={{
          color: "#64D2FF", fontSize: 13, fontFamily: "JetBrains Mono", fontWeight: 700,
        }}>/api/v1/intercept</span>
        <span style={{ color: "#555", fontSize: 9, marginLeft: "auto" }}>
          SAP / Oracle / ERP Integration
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
        className="api-docs-grid">

        {/* Request Schema */}
        <div>
          <div style={{ fontSize: 10, color: "#FFB340", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 8 }}>
            REQUEST SCHEMA
          </div>
          <pre data-testid="request-schema" style={{
            background: "#060606", border: "1px solid #1F1F1F",
            padding: "12px", color: "#A1A1AA", fontSize: 9,
            fontFamily: "JetBrains Mono", lineHeight: 1.8,
            overflow: "auto", maxHeight: 300,
          }}>
            {JSON.stringify(requestSchema, null, 2)}
          </pre>
        </div>

        {/* Response Schema */}
        <div>
          <div style={{ fontSize: 10, color: "#64D2FF", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 8 }}>
            RESPONSE SCHEMA
          </div>
          <pre data-testid="response-schema" style={{
            background: "#060606", border: "1px solid #1F1F1F",
            padding: "12px", color: "#A1A1AA", fontSize: 9,
            fontFamily: "JetBrains Mono", lineHeight: 1.8,
            overflow: "auto", maxHeight: 300,
          }}>
            {JSON.stringify(responseSchema, null, 2)}
          </pre>
        </div>
      </div>

      {/* Code Examples */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 10, color: "#FFB340", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 8 }}>
          INTEGRATION EXAMPLES
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          className="api-docs-grid">
          <div>
            <div style={{ fontSize: 8, color: "#32D74B", letterSpacing: "0.1em", marginBottom: 4, fontWeight: 700 }}>
              cURL
            </div>
            <pre style={{
              background: "#060606", border: "1px solid #1F1F1F",
              padding: "10px", color: "#A1A1AA", fontSize: 8.5,
              fontFamily: "JetBrains Mono", lineHeight: 1.8,
              overflow: "auto", whiteSpace: "pre-wrap",
            }}>
              {curlExample}
            </pre>
          </div>
          <div>
            <div style={{ fontSize: 8, color: "#64D2FF", letterSpacing: "0.1em", marginBottom: 4, fontWeight: 700 }}>
              PYTHON (requests)
            </div>
            <pre style={{
              background: "#060606", border: "1px solid #1F1F1F",
              padding: "10px", color: "#A1A1AA", fontSize: 8.5,
              fontFamily: "JetBrains Mono", lineHeight: 1.8,
              overflow: "auto", whiteSpace: "pre-wrap",
            }}>
              {pythonExample}
            </pre>
          </div>
        </div>
      </div>

      {/* Auth & Rate Limiting */}
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}
        className="api-docs-info-grid">
        {[
          { label: "AUTHENTICATION", value: "Bearer Token", color: "#FF9F0A", desc: "Contact SITI ops for enterprise key" },
          { label: "RATE LIMIT", value: "1,000 req/min", color: "#64D2FF", desc: "Enterprise tier — burst: 5,000/min" },
          { label: "SLA", value: "99.95% Uptime", color: "#32D74B", desc: "P99 latency < 200ms" },
        ].map(item => (
          <div key={item.label} style={{
            background: "#060606", border: "1px solid #1F1F1F", padding: "10px 12px",
          }}>
            <div style={{ fontSize: 8, color: "#555", letterSpacing: "0.1em" }}>{item.label}</div>
            <div style={{ fontSize: 13, color: item.color, fontWeight: 700, fontFamily: "JetBrains Mono" }}>
              {item.value}
            </div>
            <div style={{ fontSize: 8, color: "#666", marginTop: 2 }}>{item.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
