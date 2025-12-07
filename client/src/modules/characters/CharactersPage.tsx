import React from "react";
import { useDefinitions } from "../definitions/DefinitionsProvider";

interface Character {
  id: string;
  name: string;
  level: number;
}

export const CharactersPage: React.FC = () => {
  const definitions = useDefinitions();
  const [characters, setCharacters] = React.useState<Character[]>([]);
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    fetch("/api/characters")
      .then((r) => r.json())
      .then(setCharacters)
      .catch(() => {});
  }, []);

  if (definitions.loading) {
    return <div>Loading ruleset definitions...</div>;
  }

  if (definitions.error || !definitions.data) {
    return <div>Failed to load ruleset definitions: {definitions.error ?? "Unknown error"}</div>;
  }

  const attributeByKey = React.useMemo(() => {
    return new Map(definitions.data.attributes.map((attr) => [attr.key, attr]));
  }, [definitions.data.attributes]);

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

      <section style={{ marginTop: "2rem" }}>
        <h3>Ruleset definitions</h3>
        <div style={{ marginBottom: "0.5rem" }}>
          Active ruleset: {definitions.data.ruleset?.name ?? "None specified"}
        </div>
        <div style={{ display: "flex", gap: "2rem" }}>
          <div>
            <h4>Attributes</h4>
            {definitions.data.attributes.length === 0 ? (
              <div style={{ color: "#aaa" }}>No attributes configured yet.</div>
            ) : (
              <ul>
                {definitions.data.attributes.map((attr) => (
                  <li key={attr.key}>
                    <strong>{attr.name}</strong> ({attr.key})
                    {attr.description ? ` — ${attr.description}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h4>Skills</h4>
            {definitions.data.skills.length === 0 ? (
              <div style={{ color: "#aaa" }}>No skills configured yet.</div>
            ) : (
              <ul>
                {definitions.data.skills.map((skill) => (
                  <li key={skill.key}>
                    <strong>{skill.name}</strong>
                    {skill.attributeKey
                      ? ` (uses ${attributeByKey.get(skill.attributeKey)?.name ?? skill.attributeKey})`
                      : ""}
                    {skill.description ? ` — ${skill.description}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

