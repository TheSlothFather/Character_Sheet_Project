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

type SettingEntry = {
  id: string;
  title: string;
  category: string;
  content: string;
};

const createId = () => `setting-${Math.random().toString(36).slice(2, 10)}`;

export const SettingInfoPage: React.FC = () => {
  const [entries, setEntries] = React.useState<SettingEntry[]>([]);
  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [content, setContent] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState<SettingEntry | null>(null);

  const resetForm = () => {
    setTitle("");
    setCategory("");
    setContent("");
  };

  const handleCreate = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const newEntry: SettingEntry = {
      id: createId(),
      title: trimmed,
      category: category.trim(),
      content: content.trim()
    };
    setEntries((prev) => [newEntry, ...prev]);
    resetForm();
  };

  const startEdit = (entry: SettingEntry) => {
    setEditingId(entry.id);
    setEditDraft({ ...entry });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const saveEdit = () => {
    if (!editDraft) return;
    if (!editDraft.title.trim()) return;
    setEntries((prev) => prev.map((entry) => (entry.id === editDraft.id ? { ...editDraft, title: editDraft.title.trim() } : entry)));
    cancelEdit();
  };

  const deleteEntry = (id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    if (editingId === id) cancelEdit();
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
        <form onSubmit={handleCreate} style={{ display: "grid", gap: "0.75rem" }}>
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
            <span style={{ fontWeight: 700 }}>Category</span>
            <input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="Factions / Politics"
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
                        value={editDraft.category}
                        onChange={(event) => setEditDraft({ ...editDraft, category: event.target.value })}
                        placeholder="Category"
                        style={inputStyle}
                      />
                      <textarea
                        value={editDraft.content}
                        onChange={(event) => setEditDraft({ ...editDraft, content: event.target.value })}
                        rows={4}
                        placeholder="Content"
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
                          <div style={{ fontWeight: 700 }}>{entry.title}</div>
                          <div style={{ color: "#9ca3af", fontSize: 13 }}>{entry.category || "Uncategorized"}</div>
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
                      {entry.content && (
                        <p style={{ margin: 0, color: "#cbd5e1", fontSize: 14 }}>{entry.content}</p>
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
