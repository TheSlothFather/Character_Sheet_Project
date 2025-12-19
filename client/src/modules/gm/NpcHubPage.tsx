import React from "react";

const cardStyle: React.CSSProperties = {
  background: "#0f131a",
  border: "1px solid #1f2935",
  borderRadius: 12,
  padding: "1rem"
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.75rem",
  borderRadius: 8,
  border: "1px solid #2f3542",
  background: "#0b1017",
  color: "#e5e7eb",
  boxSizing: "border-box"
};

type Pin = {
  id: string;
  name: string;
  role: string;
  status: string;
  notes: string;
};

const createId = () => `npc-${Math.random().toString(36).slice(2, 10)}`;

export const NpcHubPage: React.FC = () => {
  const [pins, setPins] = React.useState<Pin[]>([]);
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState("");
  const [status, setStatus] = React.useState("Active");
  const [notes, setNotes] = React.useState("");

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const newPin: Pin = {
      id: createId(),
      name: trimmed,
      role: role.trim(),
      status: status.trim() || "Active",
      notes: notes.trim()
    };
    setPins((prev) => [newPin, ...prev]);
    setName("");
    setRole("");
    setStatus("Active");
    setNotes("");
  };

  const removePin = (id: string) => setPins((prev) => prev.filter((pin) => pin.id !== id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h2 style={{ margin: 0 }}>NPC Hub</h2>
        <p style={{ margin: "0.25rem 0 0", color: "#cbd5e1" }}>
          Pin recurring NPCs to keep story beats and hooks visible. Later, this space will host the roll inbox.
        </p>
      </header>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Pinboard Entry</h3>
        <form onSubmit={handleCreate} style={{ display: "grid", gap: "0.75rem" }}>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ fontWeight: 700 }}>NPC Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Marshal Elara"
              style={inputStyle}
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontWeight: 700 }}>Role</span>
              <input
                value={role}
                onChange={(event) => setRole(event.target.value)}
                placeholder="Town guard captain"
                style={inputStyle}
              />
            </label>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontWeight: 700 }}>Status</span>
              <input
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                placeholder="Active"
                style={inputStyle}
              />
            </label>
          </div>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ fontWeight: 700 }}>Hooks / Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Owes the party a favor; hiding an envoy from the Iron Choir."
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </label>
          <button
            type="submit"
            style={{
              padding: "0.6rem 0.9rem",
              borderRadius: 8,
              border: "1px solid #1d4ed8",
              background: "#2563eb",
              color: "#e6edf7",
              fontWeight: 700,
              width: "fit-content",
              cursor: "pointer"
            }}
          >
            Pin NPC
          </button>
        </form>
      </section>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Pinned NPCs</h3>
        {pins.length === 0 ? (
          <p style={{ color: "#94a3b8", margin: 0 }}>No NPCs pinned yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {pins.map((pin) => (
              <div
                key={pin.id}
                style={{
                  border: "1px solid #1f2935",
                  borderRadius: 10,
                  padding: "0.75rem",
                  background: "#0c111a",
                  display: "grid",
                  gap: "0.5rem"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{pin.name}</div>
                    <div style={{ color: "#9ca3af", fontSize: 13 }}>{pin.role || "No role noted"}</div>
                  </div>
                  <span style={{ color: "#9ae6b4", fontSize: 12, fontWeight: 700 }}>{pin.status || "Active"}</span>
                </div>
                {pin.notes && <p style={{ margin: 0, color: "#cbd5e1", fontSize: 14 }}>{pin.notes}</p>}
                <button
                  type="button"
                  onClick={() => removePin(pin.id)}
                  style={{
                    padding: "0.4rem 0.7rem",
                    borderRadius: 8,
                    border: "1px solid #3f2b2b",
                    background: "#2c1515",
                    color: "#fecaca",
                    fontWeight: 600,
                    cursor: "pointer",
                    width: "fit-content"
                  }}
                >
                  Remove Pin
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
