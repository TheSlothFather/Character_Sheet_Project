import React from "react";

interface SelectedCharacterContextValue {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}

const SelectedCharacterContext = React.createContext<SelectedCharacterContextValue | undefined>(
  undefined
);

const STORAGE_KEY = "selected_character_id";

const readInitialSelection = (): string | null => {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored && stored.trim() ? stored : null;
};

export const SelectedCharacterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedId, setSelectedId] = React.useState<string | null>(() => readInitialSelection());

  const updateSelection = React.useCallback((id: string | null) => {
    setSelectedId(id);
    if (typeof window === "undefined") return;
    if (id) {
      window.localStorage.setItem(STORAGE_KEY, id);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const value = React.useMemo(
    () => ({ selectedId, setSelectedId: updateSelection }),
    [selectedId, updateSelection]
  );

  return <SelectedCharacterContext.Provider value={value}>{children}</SelectedCharacterContext.Provider>;
};

export const useSelectedCharacter = (): SelectedCharacterContextValue => {
  const ctx = React.useContext(SelectedCharacterContext);
  if (!ctx) {
    throw new Error("useSelectedCharacter must be used within SelectedCharacterProvider");
  }
  return ctx;
};
