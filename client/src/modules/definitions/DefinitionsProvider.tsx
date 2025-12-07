import React from "react";

type RulesetMeta = {
  key: string;
  name: string;
  description?: string;
};

type AttributeDefinition = {
  key: string;
  name: string;
  description?: string;
};

type SkillDefinition = {
  key: string;
  name: string;
  attributeKey?: string;
  description?: string;
};

type RaceDefinition = {
  key: string;
  name: string;
  description?: string;
};

type SubraceDefinition = RaceDefinition & {
  raceKey: string;
};

type FeatDefinition = RaceDefinition;

type ItemDefinition = RaceDefinition & { slot?: string };

type StatusEffectDefinition = RaceDefinition & {
  defaultDurationType?: "rounds" | "scene" | "session" | "permanent";
};

type DerivedStatDefinition = RaceDefinition & { expression: unknown };

type ModifierDefinition = {
  sourceType: string;
  sourceKey: string;
  targetPath: string;
  operation: string;
  stackingKey?: string;
  priority?: number;
  valueExpression: unknown;
  conditionExpression?: unknown;
};

type Definitions = {
  ruleset: RulesetMeta | null;
  attributes: AttributeDefinition[];
  skills: SkillDefinition[];
  races: RaceDefinition[];
  subraces: SubraceDefinition[];
  feats: FeatDefinition[];
  items: ItemDefinition[];
  statusEffects: StatusEffectDefinition[];
  derivedStats: DerivedStatDefinition[];
  modifiers: ModifierDefinition[];
};

type DefinitionsState = {
  data: Definitions | null;
  loading: boolean;
  error: string | null;
};

const defaultState: DefinitionsState = {
  data: null,
  loading: true,
  error: null
};

const DefinitionsContext = React.createContext<DefinitionsState>(defaultState);

let cachedDefinitions: Definitions | null = null;
let inFlight: Promise<Definitions> | null = null;

async function loadDefinitions(signal: AbortSignal): Promise<Definitions> {
  if (cachedDefinitions) return cachedDefinitions;
  if (!inFlight) {
    inFlight = fetch("/api/definitions", { signal }).then(async (res) => {
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
      return res.json();
    });
  }

  try {
    const result = await inFlight;
    cachedDefinitions = result;
    return result;
  } finally {
    inFlight = null;
  }
}

export const DefinitionsProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [state, setState] = React.useState<DefinitionsState>(cachedDefinitions
    ? { data: cachedDefinitions, loading: false, error: null }
    : defaultState);

  React.useEffect(() => {
    if (cachedDefinitions || !state.loading) return;

    let active = true;
    const controller = new AbortController();

    loadDefinitions(controller.signal)
      .then((data) => {
        if (!active) return;
        setState({ data, loading: false, error: null });
      })
      .catch((err: any) => {
        if (!active) return;
        if (err?.name === "AbortError") return;
        setState({ data: null, loading: false, error: err?.message || "Unknown error" });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [state.loading]);

  return <DefinitionsContext.Provider value={state}>{children}</DefinitionsContext.Provider>;
};

export const useDefinitions = () => React.useContext(DefinitionsContext);
