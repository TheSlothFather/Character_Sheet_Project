import React from "react";
import { useParams } from "react-router-dom";
import { gmApi, type BestiaryEntry as ApiBestiaryEntry, type Campaign } from "../../api/gm";

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

type BestiaryEntry = {
  id: string;
  name: string;
  type: string;
  threat: string;
  description: string;
};

const mapApiEntry = (entry: ApiBestiaryEntry): BestiaryEntry => {
  const statsSkills = entry.statsSkills;
  const type = typeof statsSkills?.type === "string" ? statsSkills.type : "";
  const threat = typeof statsSkills?.threat === "string" ? statsSkills.threat : "";
  const description = typeof statsSkills?.description === "string" ? statsSkills.description : "";
  return {
    id: entry.id,
    name: entry.name,
    type,
    threat,
    description
  };
};

const toStatsSkills = (entry: BestiaryEntry): Record<string, string> => {
  const statsSkills: Record<string, string> = {};
  const type = entry.type.trim();
  const threat = entry.threat.trim();
  const description = entry.description.trim();
  if (type) statsSkills.type = type;
  if (threat) statsSkills.threat = threat;
  if (description) statsSkills.description = description;
  return statsSkills;
};

export const BestiaryPage: React.FC = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<string>(campaignId ?? "");
  const [entries, setEntries] = React.useState<BestiaryEntry[]>([]);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState("");
  const [threat, setThreat] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState<BestiaryEntry | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setType("");
    setThreat("");
    setDescription("");
  };

  React.useEffect(() => {
    if (campaignId) {
      setSelectedCampaignId(campaignId);
      return;
    }
    let active = true;
    const loadCampaigns = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await gmApi.listCampaigns();
        if (!active) return;
        setCampaigns(data);
        setSelectedCampaignId((current) => current || data[0]?.id || "");
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load campaigns.");
      } finally {
        if (active) setLoading(false);
      }
    };
    loadCampaigns();
    return () => {
      active = false;
    };
  }, [campaignId]);

  React.useEffect(() => {
    if (!selectedCampaignId) {
      setEntries([]);
      return;
    }
    let active = true;
    const loadEntries = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await gmApi.listBestiaryEntries(selectedCampaignId);
        if (!active) return;
        setEntries(data.map(mapApiEntry));
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load bestiary entries.");
      } finally {
        if (active) setLoading(false);
      }
    };
    loadEntries();
    return () => {
      active = false;
    };
  }, [selectedCampaignId]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCampaignId) {
      setError("Select a campaign before adding entries.");
      return;
    }
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const created = await gmApi.createBestiaryEntry({
        campaignId: selectedCampaignId,
        name: trimmed,
        statsSkills: {
          type: type.trim(),
          threat: threat.trim(),
          description: description.trim()
        }
      });
      setEntries((prev) => [mapApiEntry(created), ...prev]);
      resetForm();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create bestiary entry.");
    }
  };

  const startEdit = (entry: BestiaryEntry) => {
    setEditingId(entry.id);
    setEditDraft({ ...entry });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const saveEdit = async () => {
    if (!editDraft) return;
    if (!editDraft.name.trim()) return;
    setError(null);
    try {
      const updated = await gmApi.updateBestiaryEntry(editDraft.id, {
        name: editDraft.name.trim(),
        statsSkills: toStatsSkills(editDraft)
      });
      setEntries((prev) => prev.map((entry) => (entry.id === updated.id ? mapApiEntry(updated) : entry)));
      cancelEdit();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update bestiary entry.");
    }
  };

  const deleteEntry = async (id: string) => {
    setError(null);
    try {
      await gmApi.deleteBestiaryEntry(id);
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
      if (editingId === id) cancelEdit();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete bestiary entry.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h2 style={{ margin: 0 }}>Bestiary</h2>
        <p style={{ margin: "0.25rem 0 0", color: "#cbd5e1" }}>
          Maintain monster entries with quick edit controls.
        </p>
      </header>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Add Creature</h3>
        {error && <div style={{ marginBottom: "0.75rem", color: "#fca5a5" }}>{error}</div>}
        {loading && <div style={{ marginBottom: "0.75rem", color: "#94a3b8" }}>Loading...</div>}
        {!campaignId && campaigns.length === 0 ? (
          <p style={{ color: "#94a3b8", margin: 0 }}>Create a campaign first to manage a bestiary.</p>
        ) : (
        <form onSubmit={handleCreate} style={{ display: "grid", gap: "0.75rem" }}>
          {!campaignId && (
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontWeight: 700 }}>Campaign</span>
              <select
                value={selectedCampaignId}
                onChange={(event) => setSelectedCampaignId(event.target.value)}
                style={inputStyle}
              >
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ fontWeight: 700 }}>Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ash Drake"
              style={inputStyle}
            />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem" }}>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontWeight: 700 }}>Type</span>
              <input
                value={type}
                onChange={(event) => setType(event.target.value)}
                placeholder="Dragon"
                style={inputStyle}
              />
            </label>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontWeight: 700 }}>Threat Tier</span>
              <input
                value={threat}
                onChange={(event) => setThreat(event.target.value)}
                placeholder="Tier 3"
                style={inputStyle}
              />
            </label>
          </div>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ fontWeight: 700 }}>Tactics / Notes</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Breath weapon on round two, vulnerable to cold iron."
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
            Add Entry
          </button>
        </form>
        )}
      </section>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Entries</h3>
        {entries.length === 0 ? (
          <p style={{ color: "#94a3b8", margin: 0 }}>No entries yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {entries.map((entry) => {
              const isEditing = editingId === entry.id;
              return (
                <div
                  key={entry.id}
                  style={{
                    border: "1px solid #1f2935",
                    borderRadius: 10,
                    padding: "0.75rem",
                    background: "#0c111a",
                    display: "grid",
                    gap: "0.6rem"
                  }}
                >
                  {isEditing && editDraft ? (
                    <div style={{ display: "grid", gap: "0.6rem" }}>
                      <input
                        value={editDraft.name}
                        onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })}
                        style={inputStyle}
                      />
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.6rem" }}>
                        <input
                          value={editDraft.type}
                          onChange={(event) => setEditDraft({ ...editDraft, type: event.target.value })}
                          placeholder="Type"
                          style={inputStyle}
                        />
                        <input
                          value={editDraft.threat}
                          onChange={(event) => setEditDraft({ ...editDraft, threat: event.target.value })}
                          placeholder="Threat"
                          style={inputStyle}
                        />
                      </div>
                      <textarea
                        value={editDraft.description}
                        onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })}
                        rows={3}
                        placeholder="Notes"
                        style={{ ...inputStyle, resize: "vertical" }}
                      />
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={saveEdit}
                          style={{
                            padding: "0.45rem 0.8rem",
                            borderRadius: 8,
                            border: "1px solid #1d4ed8",
                            background: "#2563eb",
                            color: "#e6edf7",
                            fontWeight: 600,
                            cursor: "pointer"
                          }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          style={{
                            padding: "0.45rem 0.8rem",
                            borderRadius: 8,
                            border: "1px solid #2b3747",
                            background: "#1f2935",
                            color: "#e5e7eb",
                            fontWeight: 600,
                            cursor: "pointer"
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{entry.name}</div>
                          <div style={{ color: "#9ca3af", fontSize: 13 }}>
                            {entry.type || "Unknown type"} • {entry.threat || "Unrated"}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                          <button
                            type="button"
                            onClick={() => startEdit(entry)}
                            style={{
                              padding: "0.4rem 0.7rem",
                              borderRadius: 8,
                              border: "1px solid #2b3747",
                              background: "#1f2935",
                              color: "#e5e7eb",
                              fontWeight: 600,
                              cursor: "pointer"
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteEntry(entry.id)}
                            style={{
                              padding: "0.4rem 0.7rem",
                              borderRadius: 8,
                              border: "1px solid #3f2b2b",
                              background: "#2c1515",
                              color: "#fecaca",
                              fontWeight: 600,
                              cursor: "pointer"
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      {entry.description && (
                        <p style={{ margin: 0, color: "#cbd5e1", fontSize: 14 }}>{entry.description}</p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
