import React from "react";

interface Character {
  id: string;
  name: string;
  level: number;
}

export const CharactersPage: React.FC = () => {
  const [characters, setCharacters] = React.useState<Character[]>([]);
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    fetch("/api/characters")
      .then((r) => r.json())
      .then(setCharacters)
      .catch(() => {});
  }, []);

  const onCreate = async () => {
    if (!name.trim()) return;
    const res = await fetch("/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, level: 1 })
    });
    if (!res.ok) return;
    const created = (await res.json()) as Character;
    setCharacters((prev) => [...prev, created]);
    setName("");
  };

  return (
    <div>
      <h2>Characters</h2>
      <div style={{ marginBottom: "1rem" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New character name"
        />
        <button onClick={onCreate} style={{ marginLeft: 8 }}>
          Create
        </button>
      </div>
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

