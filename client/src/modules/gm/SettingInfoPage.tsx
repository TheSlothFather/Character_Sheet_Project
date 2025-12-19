import React from "react";
import { useParams } from "react-router-dom";
import { gmApi, type Campaign, type CampaignSetting } from "../../api/gm";

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

const parseTags = (value: string): string[] | undefined => {
  const tags = value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return tags.length ? tags : undefined;
};

const formatTags = (tags?: string[]): string => (tags && tags.length ? tags.join(", ") : "");

export const SettingInfoPage: React.FC = () => {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = React.useState<string>(campaignId ?? "");
  const [entries, setEntries] = React.useState<CampaignSetting[]>([]);
  const [title, setTitle] = React.useState("");
  const [tagsInput, setTagsInput] = React.useState("");
  const [content, setContent] = React.useState("");
  const [isPlayerVisible, setIsPlayerVisible] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState<CampaignSetting | null>(null);
  const [editTags, setEditTags] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const resetForm = () => {
    setTitle("");
    setTagsInput("");
    setContent("");
    setIsPlayerVisible(false);
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
        const data = await gmApi.listSettings(selectedCampaignId);
        if (!active) return;
        setEntries(data);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load setting notes.");
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
    const trimmed = title.trim();
    if (!trimmed) return;
    setError(null);
    try {
      const created = await gmApi.createSetting({
        campaignId: selectedCampaignId,
        title: trimmed,
        body: content.trim() || undefined,
        tags: parseTags(tagsInput),
        isPlayerVisible
      });
      setEntries((prev) => [created, ...prev]);
      resetForm();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create setting note.");
    }
  };

  const startEdit = (entry: CampaignSetting) => {
    setEditingId(entry.id);
    setEditDraft({ ...entry });
    setEditTags(formatTags(entry.tags));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
    setEditTags("");
  };

  const saveEdit = async () => {
    if (!editDraft) return;
    if (!editDraft.title.trim()) return;
    setError(null);
    try {
      const updated = await gmApi.updateSetting(editDraft.id, {
        title: editDraft.title.trim(),
        body: editDraft.body?.trim() || undefined,
        tags: parseTags(editTags),
        isPlayerVisible: editDraft.isPlayerVisible
      });
      setEntries((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
      cancelEdit();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update setting note.");
    }
  };

  const deleteEntry = async (id: string) => {
    setError(null);
    try {
      await gmApi.deleteSetting(id);
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
      if (editingId === id) cancelEdit();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete setting note.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <header>
        <h2 style={{ margin: 0 }}>Setting Info</h2>
        <p style={{ margin: "0.25rem 0 0", color: "#cbd5e1" }}>
          Create and maintain campaign setting notes for quick reference.
        </p>
      </header>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Add Setting Note</h3>
        {error && <div style={{ marginBottom: "0.75rem", color: "#fca5a5" }}>{error}</div>}
        {loading && <div style={{ marginBottom: "0.75rem", color: "#94a3b8" }}>Loading...</div>}
        {!campaignId && campaigns.length === 0 ? (
          <p style={{ color: "#94a3b8", margin: 0 }}>Create a campaign first to manage setting notes.</p>
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
              <span style={{ fontWeight: 700 }}>Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Shatterglass Accord"
                style={inputStyle}
              />
            </label>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontWeight: 700 }}>Tags</span>
              <input
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
                placeholder="Factions, Politics"
                style={inputStyle}
              />
            </label>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span style={{ fontWeight: 700 }}>Content</span>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={4}
                placeholder="Three city-states bound by a fragile alliance..."
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={isPlayerVisible}
                onChange={(event) => setIsPlayerVisible(event.target.checked)}
              />
              Share with players
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
              Add Note
            </button>
          </form>
        )}
      </section>

      <section style={cardStyle}>
        <h3 style={{ marginTop: 0 }}>Setting Notes</h3>
        {entries.length === 0 ? (
          <p style={{ color: "#94a3b8", margin: 0 }}>No setting notes yet.</p>
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
                        value={editDraft.title}
                        onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })}
                        style={inputStyle}
                      />
                      <input
                        value={editTags}
                        onChange={(event) => setEditTags(event.target.value)}
                        placeholder="Tags"
                        style={inputStyle}
                      />
                      <textarea
                        value={editDraft.body ?? ""}
                        onChange={(event) => setEditDraft({ ...editDraft, body: event.target.value })}
                        rows={4}
                        placeholder="Content"
                        style={{ ...inputStyle, resize: "vertical" }}
                      />
                      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          checked={editDraft.isPlayerVisible ?? false}
                          onChange={(event) =>
                            setEditDraft({
                              ...editDraft,
                              isPlayerVisible: event.target.checked
                            })
                          }
                        />
                        Share with players
                      </label>
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
                          <div style={{ fontWeight: 700 }}>{entry.title}</div>
                          <div style={{ color: "#9ca3af", fontSize: 13 }}>
                            {entry.tags?.length ? entry.tags.join(" · ") : "Uncategorized"}
                          </div>
                          <div style={{ color: entry.isPlayerVisible ? "#86efac" : "#94a3b8", fontSize: 12 }}>
                            {entry.isPlayerVisible ? "Shared with players" : "GM only"}
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
                      {entry.body && <p style={{ margin: 0, color: "#cbd5e1", fontSize: 14 }}>{entry.body}</p>}
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
