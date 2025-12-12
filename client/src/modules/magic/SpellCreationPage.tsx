import React from "react";

const containerStyle: React.CSSProperties = {
  display: "grid",
  gap: "1rem",
  maxWidth: 1000,
  margin: "0 auto"
};

const cardStyle: React.CSSProperties = {
  background: "#1a202c",
  border: "1px solid #2d3748",
  borderRadius: 12,
  padding: "1rem 1.25rem",
  boxShadow: "0 2px 8px rgba(0,0,0,0.35)"
};

const headingStyle: React.CSSProperties = {
  color: "#f7fafc",
  margin: "0 0 0.75rem 0"
};

const listStyle: React.CSSProperties = {
  color: "#e2e8f0",
  margin: "0.25rem 0 0.25rem 1.1rem"
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  background: "#234e52",
  color: "#c6f6d5",
  borderRadius: 999,
  padding: "0.2rem 0.65rem",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: "uppercase"
};

const Table: React.FC<{ headers: string[]; rows: string[][] }> = ({ headers, rows }) => (
  <div style={{ overflowX: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", color: "#e2e8f0" }}>
      <thead>
        <tr>
          {headers.map((header) => (
            <th
              key={header}
              style={{ textAlign: "left", padding: "0.5rem", borderBottom: "1px solid #2d3748", color: "#cbd5e0", fontSize: 14 }}
            >
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={idx} style={{ borderBottom: "1px solid #2d3748" }}>
            {row.map((cell, cIdx) => (
              <td key={cIdx} style={{ padding: "0.5rem", verticalAlign: "top", fontSize: 14, lineHeight: 1.5 }}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const SpellCreationPage: React.FC = () => {
  const pipelineSteps = [
    {
      title: "Intent selection",
      details:
        "Map goals (damage, control, mobility, support) to effect tags and choose candidate faculties and tiers accordingly. High damage gravitates to Pyro 4–6; battlefield control leans Cryo 2–4 or Hypergravity 3."
    },
    {
      title: "Base effect draft",
      details: "Instantiate a TierEffect record as the primary payload. Mirror its environmental consequence to define the secondary zone."
    },
    {
      title: "Opposed blend",
      details:
        "Optionally layer the opposed faculty at a lower tier to create rings or gradients (e.g., Pyro 4 center, Cryo 2 rim). Use synergy rules to adjust magnitude and risk."
    },
    {
      title: "Cross-faculty fusion",
      details:
        "Combine unrelated faculties via shared tags (e.g., Thermomancy + Graviturgy for explosive knockdowns). Stack compatible statuses and cap magnitudes to avoid runaway power."
    },
    {
      title: "Status and cost resolution",
      details: "Derive statuses (Burning, Freezing, Prone, Slowed) from tiers and clamp to a budgeted severity per spell level."
    },
    {
      title: "Scaling and safeguards",
      details: "Apply tier-based resource costs and cooldowns; downgrade or veto combinations that are redundant or contradictory."
    },
    {
      title: "Flavor pass",
      details: "Generate names and descriptions from faculties and tags (e.g., Plasma Collapse, Frost-Feather Uplift) and embed environmental cues for consistency."
    }
  ];

  const features = [
    "Searchable catalog indexed by tags, faculties, tiers, and impact area",
    "Validation rules enforcing max tier sums, banned pairings, and status stack limits",
    "Testing corpus with golden samples per tier/faculty to watch for balance drift"
  ];

  const implementationOrder = [
    "Ingest faculty tiers and auto-extract effect tags",
    "Implement synergy rules and the budgeted composition engine",
    "Build the intent-driven generator with deterministic seeding",
    "Add validation plus balancing metrics",
    "Expose a CLI/API for generating and browsing spells"
  ];

  const dataModelRows = [
    [
      "Faculty",
      "Name, opposed_faculty_id, tags",
      "Pairs each school with its opposed counterpart and shared tags for matchmaking"
    ],
    [
      "TierEffect",
      "Primary effect text, environmental consequence, statuses, tier (1–6)",
      "Captures the main spell payload and the lingering battlefield behavior"
    ],
    [
      "EffectTags",
      "Damage type, control, mobility, utility, hazard, status keywords",
      "Computed from the tier text to accelerate searches and fusion"
    ],
    [
      "SynergyRules",
      "Safe/unsafe pairings with scaling coefficients per tier",
      "Describes how faculties amplify or dampen each other"
    ]
  ];

  const principles = [
    "Each faculty carries a primary effect and an environmental consequence; these are composable atoms with tiered intensity steps.",
    "Opposed halves (e.g., Hypergravity vs. Hypogravity) are invertible transforms you can layer for hybrid effects.",
    "Favor clarity: one payload, one zone behavior, one set of statuses, all bounded by a cost budget."
  ];

  return (
    <div>
      <header style={{ marginBottom: "1rem" }}>
        <div style={badgeStyle}>Design guide</div>
        <h1 style={{ color: "#f7fafc", margin: "0.35rem 0 0 0" }}>Spell Creation</h1>
        <p style={{ color: "#cbd5e0", margin: "0.5rem 0 0 0", maxWidth: 900 }}>
          Procedural spell generation for the Adûrun system. Blend faculties by intent, clamp power by tier budgets, and ship names and
          descriptions that stay consistent with their mechanical consequences.
        </p>
      </header>

      <div style={containerStyle}>
        <section style={cardStyle}>
          <h2 style={headingStyle}>Principles</h2>
          <ul style={listStyle}>
            {principles.map((item) => (
              <li key={item} style={{ marginBottom: "0.35rem" }}>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section style={cardStyle}>
          <h2 style={headingStyle}>Data model</h2>
          <Table headers={["Table", "Key fields", "Purpose"]} rows={dataModelRows} />
        </section>

        <section style={cardStyle}>
          <h2 style={headingStyle}>Generation pipeline</h2>
          <ol style={{ ...listStyle, paddingLeft: "1.25rem" }}>
            {pipelineSteps.map((step) => (
              <li key={step.title} style={{ marginBottom: "0.65rem" }}>
                <div style={{ fontWeight: 700, color: "#f7fafc" }}>{step.title}</div>
                <div style={{ color: "#e2e8f0", marginTop: 4 }}>{step.details}</div>
              </li>
            ))}
          </ol>
        </section>

        <section style={cardStyle}>
          <h2 style={headingStyle}>System features</h2>
          <ul style={listStyle}>
            {features.map((item) => (
              <li key={item} style={{ marginBottom: "0.35rem" }}>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section style={cardStyle}>
          <h2 style={headingStyle}>Implementation order</h2>
          <ol style={{ ...listStyle, paddingLeft: "1.25rem" }}>
            {implementationOrder.map((item) => (
              <li key={item} style={{ marginBottom: "0.35rem" }}>{item}</li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
};
