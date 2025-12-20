import React from "react";
import { useParams } from "react-router-dom";
import { gmApi, type Campaign, type CampaignSetting } from "../../api/gm";
import "./SettingInfoPage.css";

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
    <div className="gm-setting-info">
      <header>
        <h2 className="gm-setting-info__title">Setting Info</h2>
        <p className="gm-setting-info__subtitle">
          Create and maintain campaign setting notes for quick reference.
        </p>
      </header>

      <section className="gm-setting-info__card">
        <h3 className="gm-setting-info__card-title">Add Setting Note</h3>
        {error && <div className="gm-setting-info__message gm-setting-info__message--error">{error}</div>}
        {loading && <div className="gm-setting-info__message gm-setting-info__message--loading">Loading...</div>}
        {!campaignId && campaigns.length === 0 ? (
          <p className="gm-setting-info__muted">Create a campaign first to manage setting notes.</p>
        ) : (
          <form onSubmit={handleCreate} className="gm-setting-info__form">
            {!campaignId && (
              <label className="gm-setting-info__field">
                <span className="gm-setting-info__label">Campaign</span>
                <select
                  value={selectedCampaignId}
                  onChange={(event) => setSelectedCampaignId(event.target.value)}
                  className="gm-setting-info__input"
                >
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="gm-setting-info__field">
              <span className="gm-setting-info__label">Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Shatterglass Accord"
                className="gm-setting-info__input"
              />
            </label>
            <label className="gm-setting-info__field">
              <span className="gm-setting-info__label">Tags</span>
              <input
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
                placeholder="Factions, Politics"
                className="gm-setting-info__input"
              />
            </label>
            <label className="gm-setting-info__field">
              <span className="gm-setting-info__label">Content</span>
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={4}
                placeholder="Three city-states bound by a fragile alliance..."
                className="gm-setting-info__input gm-setting-info__input--textarea"
              />
            </label>
            <label className="gm-setting-info__toggle">
              <input
                type="checkbox"
                checked={isPlayerVisible}
                onChange={(event) => setIsPlayerVisible(event.target.checked)}
              />
              Share with players
            </label>
            <button
              type="submit"
              className="gm-setting-info__button gm-setting-info__button--primary"
            >
              Add Note
            </button>
          </form>
        )}
      </section>

      <section className="gm-setting-info__card">
        <h3 className="gm-setting-info__card-title">Setting Notes</h3>
        {entries.length === 0 ? (
          <p className="gm-setting-info__muted">No setting notes yet.</p>
        ) : (
          <div className="gm-setting-info__list">
            {entries.map((entry) => {
              const isEditing = editingId === entry.id;
              return (
                <div key={entry.id} className="gm-setting-info__item">
                  {isEditing && editDraft ? (
                    <div className="gm-setting-info__edit">
                      <input
                        value={editDraft.title}
                        onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })}
                        className="gm-setting-info__input"
                      />
                      <input
                        value={editTags}
                        onChange={(event) => setEditTags(event.target.value)}
                        placeholder="Tags"
                        className="gm-setting-info__input"
                      />
                      <textarea
                        value={editDraft.body ?? ""}
                        onChange={(event) => setEditDraft({ ...editDraft, body: event.target.value })}
                        rows={4}
                        placeholder="Content"
                        className="gm-setting-info__input gm-setting-info__input--textarea"
                      />
                      <label className="gm-setting-info__toggle">
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
                      <div className="gm-setting-info__actions">
                        <button
                          type="button"
                          onClick={saveEdit}
                          className="gm-setting-info__button gm-setting-info__button--primary"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="gm-setting-info__button gm-setting-info__button--secondary"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="gm-setting-info__item-header">
                        <div>
                          <div className="gm-setting-info__item-title">{entry.title}</div>
                          <div className="gm-setting-info__item-tags">
                            {entry.tags?.length ? entry.tags.join(" · ") : "Uncategorized"}
                          </div>
                          <div
                            className={`gm-setting-info__visibility ${
                              entry.isPlayerVisible ? "gm-setting-info__visibility--shared" : "gm-setting-info__visibility--gm"
                            }`}
                          >
                            {entry.isPlayerVisible ? "Shared with players" : "GM only"}
                          </div>
                        </div>
                        <div className="gm-setting-info__actions">
                          <button
                            type="button"
                            onClick={() => startEdit(entry)}
                            className="gm-setting-info__button gm-setting-info__button--secondary"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteEntry(entry.id)}
                            className="gm-setting-info__button gm-setting-info__button--danger"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      {entry.body && <p className="gm-setting-info__body">{entry.body}</p>}
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
