import React from "react";
import facultiesText from "../../data/magic-faculties.txt?raw";
import { ParsedFaculty, parseMagicFaculties } from "./magicParser";

const COST_BY_CATEGORY: Record<"Basic" | "Advanced", number> = {
  Basic: 30,
  Advanced: 60
};

const ASPECT_COSTS = [
  { tier: 1, cost: 1 },
  { tier: 2, cost: 9 },
  { tier: 3, cost: 27 },
  { tier: 4, cost: 57 },
  { tier: 5, cost: 99 },
  { tier: 6, cost: 153 }
];

const ASPECT_SCALE: Record<string, string[]> = {
  Intensity: ["Physical Mod x3", "Physical Mod x5", "Physical Mod x10", "Physical Mod x25", "Physical Mod x100", "Physical Mod x200"],
  Area: ["5 ft", "Physical Mod x5 ft", "Physical Mod x10 ft", "Physical Mod x100 ft", "Physical Mod x0.10 miles", "Physical Mod Miles"],
  Range: ["Physical Mod x5 ft", "Physical Mod x10 ft", "Physical Mod x100 ft", "Physical Mod Miles", "Physical Mod x10 Miles", "Physical Mod x100 Miles"],
  Duration: ["1 Round", "Physical Mod Rounds", "Physical Mod Minutes", "Physical Mod Hours", "Physical Mod Phases", "Physical Mod Cycles"],
  Origins: ["1", "2", "3", "4", "5", "6"],
  Compound: ["1", "2", "3", "4", "5", "6"]
};

const cardStyle: React.CSSProperties = {
  background: "#1a202c",
  border: "1px solid #2d3748",
  borderRadius: 8,
  padding: "1rem",
  marginBottom: "1rem",
  boxShadow: "0 1px 3px rgba(0,0,0,0.4)"
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "0.15rem 0.5rem",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: "uppercase"
};

const DetailBlock: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: "1rem" }}>
    <h3 style={{ margin: "0 0 0.5rem 0", fontSize: 16, color: "#e2e8f0" }}>{title}</h3>
    {children}
  </div>
);

const TierPanel: React.FC<{ tier: { label: string; content: string }; defaultOpen?: boolean }> = ({ tier, defaultOpen }) => (
  <details open={defaultOpen} style={{ marginBottom: "0.5rem", background: "#111827", borderRadius: 6, border: "1px solid #2d3748", padding: "0.5rem 0.75rem" }}>
    <summary style={{ cursor: "pointer", fontWeight: 700, color: "#cbd5e0" }}>{tier.label}</summary>
    <div style={{ whiteSpace: "pre-line", marginTop: "0.5rem", color: "#e2e8f0" }}>{tier.content || "No details provided."}</div>
  </details>
);

const FacultyCard: React.FC<{ faculty: ParsedFaculty }> = ({ faculty }) => {
  const cost = COST_BY_CATEGORY[faculty.category];
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, color: "#f7fafc" }}>{faculty.name}</h2>
          <div style={{ color: "#a0aec0", fontSize: 14 }}>
            {faculty.category} Faculty · {cost} Ildakar points to unlock
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              ...badgeStyle,
              background: faculty.category === "Basic" ? "#2f855a" : "#805ad5",
              color: "#f7fafc"
            }}
          >
            {faculty.category}
          </span>
          <span
            style={{
              ...badgeStyle,
              background: faculty.sourceFound ? "#3182ce" : "#c53030",
              color: "#f7fafc",
              display: "inline-flex",
              alignItems: "center",
              gap: 6
            }}
          >
            {faculty.sourceFound ? "Loaded from source document" : "Not found in source"}
          </span>
        </div>
      </div>

      {faculty.intro && (
        <DetailBlock title="Overview">
          <div style={{ whiteSpace: "pre-line", color: "#e2e8f0" }}>{faculty.intro}</div>
        </DetailBlock>
      )}

      {faculty.tiers.length > 0 ? (
        <DetailBlock title="Tiers">
          {faculty.tiers.map((tier, idx) => (
            <TierPanel key={tier.label + idx} tier={tier} defaultOpen={idx === 0} />
          ))}
        </DetailBlock>
      ) : (
        <div style={{ color: "#e53e3e", fontSize: 14, marginTop: "0.75rem" }}>
          No tier details were found for this faculty in the uploaded text.
        </div>
      )}
    </div>
  );
};

export const MagicFacultiesPage: React.FC = () => {
  const parsed = React.useMemo(() => parseMagicFaculties(facultiesText), []);
  const basic = parsed.filter((faculty) => faculty.category === "Basic");
  const advanced = parsed.filter((faculty) => faculty.category === "Advanced");

  return (
    <div style={{ color: "#e2e8f0" }}>
      <h1 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Magic Faculties</h1>
      <p style={{ marginTop: 0, color: "#cbd5e0" }}>
        Faculties are unlocked with Ildakar Faculty points. Basic Faculties cost {COST_BY_CATEGORY.Basic} points and Advanced
        Faculties cost {COST_BY_CATEGORY.Advanced}. Aspect investments are additive across all six aspects.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Faculty Costs</h2>
          <p style={{ margin: 0, color: "#cbd5e0" }}>Spend Ildakar Faculty points to unlock a Faculty for the caster.</p>
          <ul style={{ marginTop: "0.5rem", paddingLeft: "1.25rem", color: "#e2e8f0" }}>
            {basic.map((faculty) => (
              <li key={faculty.name}>{faculty.name} — {COST_BY_CATEGORY.Basic} points</li>
            ))}
            {advanced.map((faculty) => (
              <li key={faculty.name}>{faculty.name} — {COST_BY_CATEGORY.Advanced} points</li>
            ))}
          </ul>
        </div>

        <div style={cardStyle}>
          <h2 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Aspect Cost Scaling</h2>
          <p style={{ margin: 0, color: "#cbd5e0" }}>
            AP and Energy costs are additive across all six aspects. Example: one Tier 2 aspect with five Tier 1 aspects costs
            14 AP/E; one Tier 3 with five Tier 1 costs 33 AP/E.
          </p>
          <table style={{ width: "100%", marginTop: "0.75rem", borderCollapse: "collapse", color: "#e2e8f0" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #2d3748", paddingBottom: 4 }}>Tier</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #2d3748", paddingBottom: 4 }}>AP & Energy Cost</th>
              </tr>
            </thead>
            <tbody>
              {ASPECT_COSTS.map((row) => (
                <tr key={row.tier}>
                  <td style={{ padding: "4px 0" }}>Tier {row.tier}</td>
                  <td style={{ padding: "4px 0" }}>{row.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, marginBottom: "0.5rem" }}>Aspect Scaling</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", color: "#e2e8f0" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #2d3748", padding: "6px 4px" }}>Aspect</th>
                {ASPECT_COSTS.map((row) => (
                  <th key={row.tier} style={{ textAlign: "left", borderBottom: "1px solid #2d3748", padding: "6px 4px" }}>
                    Tier {row.tier}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(ASPECT_SCALE).map(([aspect, values]) => (
                <tr key={aspect}>
                  <td style={{ padding: "6px 4px", fontWeight: 700 }}>{aspect}</td>
                  {values.map((value, idx) => (
                    <td key={idx} style={{ padding: "6px 4px" }}>{value}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: "1.5rem" }}>
        {parsed.map((faculty) => (
          <FacultyCard key={faculty.name} faculty={faculty} />
        ))}
      </div>
    </div>
  );
};
