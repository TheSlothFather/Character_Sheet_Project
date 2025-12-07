import React from "react";
import { CharactersPage } from "./characters/CharactersPage";
import { CampaignsPage } from "./campaigns/CampaignsPage";
import { DefinitionsProvider } from "./definitions/DefinitionsProvider";

type View = "characters" | "campaigns";

export const App: React.FC = () => {
  const [view, setView] = React.useState<View>("characters");

  return (
    <DefinitionsProvider>
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
          {view === "characters" ? <CharactersPage /> : <CampaignsPage />}
        </main>
      </div>
    </DefinitionsProvider>
  );
};

