import React from "react";
import { CharactersPage } from "./characters/CharactersPage";
import { CampaignsPage } from "./campaigns/CampaignsPage";
import { useDefinitions } from "./definitions/DefinitionsProvider";

type View = "characters" | "campaigns";

export const App: React.FC = () => {
  const [view, setView] = React.useState<View>("characters");
  const definitions = useDefinitions();

  const renderView = () => {
    if (view === "campaigns") {
      return <CampaignsPage />;
    }

    if (definitions.loading) {
      return <div>Loading ruleset definitions...</div>;
    }

    if (definitions.error || !definitions.data) {
      return <div>Failed to load ruleset definitions: {definitions.error ?? "Unknown error"}</div>;
    }

    return <CharactersPage definitions={definitions.data} />;
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#111", color: "#eee" }}>
      <nav
        style={{
          width: 220,
          borderRight: "1px solid #333",
          padding: "1rem",
          boxSizing: "border-box"
        }}
      >
        <h1 style={{ fontSize: 18, marginBottom: "1rem" }}>Adûrun Builder</h1>
        <button onClick={() => setView("characters")}>Characters</button>
        <button style={{ marginLeft: 8 }} onClick={() => setView("campaigns")}>
          Campaigns
        </button>
      </nav>
      <main style={{ flex: 1, padding: "1rem" }}>
        {renderView()}
      </main>
    </div>
  );
};

