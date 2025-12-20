import React from "react";
import "./NpcHubPage.css";

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
    <div className="npc-hub">
      <header>
        <h2 className="npc-hub__title">NPC Hub</h2>
        <p className="npc-hub__subtitle">
          Pin recurring NPCs to keep story beats and hooks visible. Later, this space will host the roll inbox.
        </p>
      </header>

      <section className="npc-hub__card">
        <h3 className="npc-hub__card-title">Pinboard Entry</h3>
        <form onSubmit={handleCreate} className="npc-hub__form">
          <label className="npc-hub__field">
            <span className="npc-hub__label">NPC Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Marshal Elara"
              className="npc-hub__input"
            />
          </label>
          <div className="npc-hub__grid">
            <label className="npc-hub__field">
              <span className="npc-hub__label">Role</span>
              <input
                value={role}
                onChange={(event) => setRole(event.target.value)}
                placeholder="Town guard captain"
                className="npc-hub__input"
              />
            </label>
            <label className="npc-hub__field">
              <span className="npc-hub__label">Status</span>
              <input
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                placeholder="Active"
                className="npc-hub__input"
              />
            </label>
          </div>
          <label className="npc-hub__field">
            <span className="npc-hub__label">Hooks / Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Owes the party a favor; hiding an envoy from the Iron Choir."
              className="npc-hub__input npc-hub__input--textarea"
            />
          </label>
          <button
            type="submit"
            className="npc-hub__button npc-hub__button--primary"
          >
            Pin NPC
          </button>
        </form>
      </section>

      <section className="npc-hub__card">
        <h3 className="npc-hub__card-title">Pinned NPCs</h3>
        {pins.length === 0 ? (
          <p className="npc-hub__muted">No NPCs pinned yet.</p>
        ) : (
          <div className="npc-hub__list">
            {pins.map((pin) => (
              <div key={pin.id} className="npc-hub__item">
                <div className="npc-hub__item-header">
                  <div>
                    <div className="npc-hub__item-title">{pin.name}</div>
                    <div className="npc-hub__item-meta">{pin.role || "No role noted"}</div>
                  </div>
                  <span className="npc-hub__status">{pin.status || "Active"}</span>
                </div>
                {pin.notes && <p className="npc-hub__notes">{pin.notes}</p>}
                <button
                  type="button"
                  onClick={() => removePin(pin.id)}
                  className="npc-hub__button npc-hub__button--danger"
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
