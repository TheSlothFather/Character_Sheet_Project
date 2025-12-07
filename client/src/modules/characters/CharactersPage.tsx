import React from "react";
import { api, Character, ApiError } from "../../api/client";

const isCharacter = (value: unknown): value is Character => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Character>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.level === "number"
  );
};

const isCharacterArray = (value: unknown): value is Character[] =>
  Array.isArray(value) && value.every(isCharacter);

export const CharactersPage: React.FC = () => {
  const [characters, setCharacters] = React.useState<Character[]>([]);
  const [name, setName] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    api
      .listCharacters()
      .then((data) => {
        if (!isMounted) return;
        if (!isCharacterArray(data)) {
          throw new Error("Unexpected response when loading characters");
        }
        setCharacters(data);
      })
      .catch((err) => {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : "Failed to load characters";
        setError(message);
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const onCreate = async () => {
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const created = await api.createCharacter({ name: name.trim(), level: 1 });
      if (!created || !isCharacter(created)) {
        setError("Unexpected response when creating character.");
        return;
      }
      setCharacters((prev) => [...prev, created]);
      setName("");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Failed to create character";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <h2>Characters</h2>
      <div style={{ marginBottom: "1rem" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New character name"
          disabled={isSubmitting}
        />
        <button
          onClick={onCreate}
          style={{ marginLeft: 8 }}
          disabled={isSubmitting || !name.trim()}
        >
          {isSubmitting ? "Creating..." : "Create"}
        </button>
      </div>

      {loading && <p>Loading characters...</p>}
      {error && <p style={{ color: "#f55" }}>{error}</p>}

      {!loading && !error && characters.length === 0 && <p>No characters yet.</p>}

      <ul>
        {characters.map((c) => (
          <li key={c.id}>
            {c.name} (Lv {c.level})
          </li>
        ))}
      </ul>
    </div>
  );
};
