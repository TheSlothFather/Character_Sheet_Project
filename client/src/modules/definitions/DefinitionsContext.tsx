import React from "react";
import { api, DefinitionsResponse, NamedDefinition } from "../../api/client";

interface DefinitionsContextValue {
  data: DefinitionsResponse | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const DefinitionsContext = React.createContext<DefinitionsContextValue | undefined>(undefined);

const isNamedDefinition = (value: unknown): value is NamedDefinition => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NamedDefinition>;
  return typeof candidate.id === "string" && typeof candidate.name === "string";
};

const ensureNamedList = (value: unknown, field: string): NamedDefinition[] => {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${field} to be an array`);
  }

  return value.map((item, idx) => {
    if (!isNamedDefinition(item)) {
      throw new Error(`Invalid ${field} entry at index ${idx}`);
    }
    return {
      id: item.id,
      name: item.name,
      description: typeof item.description === "string" ? item.description : undefined
    };
  });
};

const ensureArray = (value: unknown, field: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`Expected ${field} to be an array`);
  }
  return value;
};

const normalizeDefinitions = (data: unknown): DefinitionsResponse => {
  if (!data || typeof data !== "object") {
    throw new Error("Unexpected definitions response");
  }

  const raw = data as Partial<DefinitionsResponse>;

  return {
    ruleset: typeof raw.ruleset === "string" ? raw.ruleset : null,
    attributes: ensureNamedList(raw.attributes, "attributes"),
    skills: ensureNamedList(raw.skills, "skills"),
    races: ensureNamedList(raw.races, "races"),
    subraces: ensureNamedList(raw.subraces, "subraces"),
    feats: ensureNamedList(raw.feats, "feats"),
    items: ensureNamedList(raw.items, "items"),
    statusEffects: ensureNamedList(raw.statusEffects, "statusEffects"),
    derivedStats: ensureNamedList(raw.derivedStats, "derivedStats"),
    modifiers: ensureArray(raw.modifiers, "modifiers")
  };
};

export const DefinitionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = React.useState<DefinitionsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await api.getDefinitions();
      const normalized = normalizeDefinitions(raw);
      setData(normalized);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load definitions";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const value = React.useMemo<DefinitionsContextValue>(
    () => ({ data, loading, error, reload: load }),
    [data, loading, error, load]
  );

  return <DefinitionsContext.Provider value={value}>{children}</DefinitionsContext.Provider>;
};

export const useDefinitions = (): DefinitionsContextValue => {
  const ctx = React.useContext(DefinitionsContext);
  if (!ctx) {
    throw new Error("useDefinitions must be used within a DefinitionsProvider");
  }
  return ctx;
};

