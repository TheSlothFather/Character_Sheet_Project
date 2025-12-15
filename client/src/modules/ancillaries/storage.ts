export const ANCILLARY_STORAGE_PREFIX = "ancillaries:selected";

export type AncillaryMetadata = Record<string, Record<string, unknown>>;

export type AncillarySelectionState = {
  selected: string[];
  metadata: AncillaryMetadata;
};

const buildDefaultState = (): AncillarySelectionState => ({ selected: [], metadata: {} });

export const getAncillaryStorageKey = (characterId: string | null | undefined) =>
  `${ANCILLARY_STORAGE_PREFIX}:${characterId ?? "unassigned"}`;

export const readAncillarySelection = (characterId: string | null | undefined): AncillarySelectionState => {
  if (typeof window === "undefined") return buildDefaultState();
  const key = getAncillaryStorageKey(characterId);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return buildDefaultState();
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return { selected: parsed, metadata: {} };
    }

    const selected = Array.isArray(parsed.selected) ? parsed.selected : [];
    const metadata = parsed.metadata && typeof parsed.metadata === "object" ? (parsed.metadata as AncillaryMetadata) : {};
    return { selected, metadata };
  } catch (err) {
    console.warn("Unable to read ancillary selection", err);
    return buildDefaultState();
  }
};

export const persistAncillarySelection = (
  characterId: string | null | undefined,
  state: AncillarySelectionState
): void => {
  if (typeof window === "undefined") return;
  const key = getAncillaryStorageKey(characterId);
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch (err) {
    console.warn("Unable to persist ancillary selection", err);
  }
};
