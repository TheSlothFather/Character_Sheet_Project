import React from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { CharactersPage } from "./characters/CharactersPage";
import { CharacterCreationPage } from "./characters/CharacterCreationPage";
import { SelectedCharacterProvider } from "./characters/SelectedCharacterContext";
import { DefinitionsProvider } from "./definitions/DefinitionsContext";
import { AncillariesPage } from "./ancillaries/AncillariesPage";
import { MartialProwessPage } from "./martial/MartialProwessPage";
import { PsionicsPage } from "./psionics/PsionicsPage";
import { MagicFacultiesPage } from "./magic/MagicFacultiesPage";
import { SpellCreationPage } from "./magic/SpellCreationPage";
import { DeityRelationshipPage } from "./deity/DeityRelationshipPage";
import { GmApp } from "./gm/GmApp";
import { JoinCampaignPage } from "./join/JoinCampaignPage";
import { CampaignHubLayout } from "./campaigns/CampaignHubLayout";
import { CampaignCharactersPage } from "./campaigns/CampaignCharactersPage";
import { CampaignSettingsPage } from "./campaigns/CampaignSettingsPage";
import { ACTIVE_CAMPAIGN_STORAGE_KEY } from "./campaigns/campaignStorage";
import { CombatPage } from "./characters/CombatPage";
import { useTheme } from "../hooks/useTheme";

const linkStyle: React.CSSProperties = {
  display: "block",
  padding: "0.5rem 0",
  color: "var(--text)",
  textDecoration: "none"
};

const activeLinkStyle: React.CSSProperties = {
  fontWeight: 700,
  color: "var(--success)"
};

const NotFound: React.FC = () => (
  <div>
    <h2>Page not found</h2>
    <p>The page you are looking for does not exist.</p>
  </div>
);

const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useTheme();

  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 1000 }}>
      <label style={{ display: "grid", gap: 6, fontSize: 12, color: "var(--muted)" }}>
        <span style={{ fontWeight: 600 }}>Theme</span>
        <select
          value={theme}
          onChange={(event) => setTheme(event.target.value === "dark-fantasy" ? "dark-fantasy" : "parchment")}
          style={{
            padding: "0.4rem 0.6rem",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            color: "var(--text)",
            cursor: "pointer"
          }}
        >
          <option value="parchment">Parchment</option>
          <option value="dark-fantasy">Dark Fantasy</option>
        </select>
      </label>
    </div>
  );
};

const StartPage: React.FC = () => {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--background)", color: "var(--text)" }}>
      <div style={{ maxWidth: 560, width: "100%", padding: "2rem", textAlign: "center" }}>
        <h1 style={{ marginBottom: "0.5rem" }}>Adûrun Builder</h1>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          Choose your role to launch the correct workspace.
        </p>
        <div style={{ display: "grid", gap: "1rem", marginTop: "2rem" }}>
          <NavLink
            to="/player/characters"
            style={{
              padding: "0.9rem 1.2rem",
              borderRadius: 12,
              border: "1px solid var(--accent)",
              background: "var(--accent)",
              color: "var(--text)",
              fontWeight: 700,
              textDecoration: "none"
            }}
          >
            I am a Player
          </NavLink>
          <NavLink
            to="/gm/campaigns"
            style={{
              padding: "0.9rem 1.2rem",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              color: "var(--text)",
              fontWeight: 700,
              textDecoration: "none"
            }}
          >
            I am the GM
          </NavLink>
        </div>
      </div>
    </div>
  );
};

const PlayerApp: React.FC = () => {
  const [activeCampaignId, setActiveCampaignId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const readActiveCampaign = () => {
      setActiveCampaignId(window.localStorage.getItem(ACTIVE_CAMPAIGN_STORAGE_KEY));
    };
    readActiveCampaign();
    window.addEventListener("storage", readActiveCampaign);
    return () => window.removeEventListener("storage", readActiveCampaign);
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--background)", color: "var(--text)" }}>
      <nav
        style={{
          width: 220,
          borderRight: "1px solid var(--border)",
          padding: "1rem",
          boxSizing: "border-box"
        }}
      >
        <h1 style={{ fontSize: 18, marginBottom: "1rem" }}>Adûrun Builder</h1>
        <NavLink
          to="/player/characters"
          style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}
        >
          Characters
        </NavLink>
        {activeCampaignId && (
          <>
            <NavLink
              to={`/player/campaigns/${activeCampaignId}`}
              style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}
            >
              Campaign Hub
            </NavLink>
            <NavLink
              to={`/player/campaigns/${activeCampaignId}/combat`}
              style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}
            >
              Combat
            </NavLink>
          </>
        )}
        <NavLink
          to="/player/character-creation"
          style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}
        >
          Character Creation
        </NavLink>
        <NavLink
          to="/player/ancillaries"
          style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}
        >
          Ancillaries
        </NavLink>
        <NavLink to="/player/martial" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}>
          Martial Prowess
        </NavLink>
        <NavLink to="/player/psionics" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}>
          Psionics
        </NavLink>
        <NavLink
          to="/player/magic-faculties"
          style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}
        >
          Magic Faculties
        </NavLink>
        <NavLink
          to="/player/spell-creation"
          style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}
        >
          Spell Creation
        </NavLink>
        <NavLink
          to="/player/deity-relationship"
          style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}
        >
          Deity Relationship
        </NavLink>
      </nav>
      <main style={{ flex: 1, padding: "1rem" }}>
        <Routes>
          <Route path="/" element={<Navigate to="characters" replace />} />
          <Route path="campaigns/:campaignId" element={<CampaignHubLayout />}>
            <Route index element={<Navigate to="characters" replace />} />
            <Route path="characters" element={<CampaignCharactersPage />} />
            <Route path="settings" element={<CampaignSettingsPage />} />
            <Route path="combat" element={<CombatPage />} />
          </Route>
          <Route path="characters" element={<CharactersPage />} />
          <Route path="character-creation" element={<CharacterCreationPage />} />
          <Route path="ancillaries" element={<AncillariesPage />} />
          <Route path="martial" element={<MartialProwessPage />} />
          <Route path="psionics" element={<PsionicsPage />} />
          <Route path="magic-faculties" element={<MagicFacultiesPage />} />
          <Route path="spell-creation" element={<SpellCreationPage />} />
          <Route path="deity-relationship" element={<DeityRelationshipPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <DefinitionsProvider>
      <SelectedCharacterProvider>
        <ThemeToggle />
        <Routes>
          <Route path="/" element={<StartPage />} />
          <Route path="/join/:token" element={<JoinCampaignPage />} />
          <Route path="/gm/combat" element={<GmApp />} />
          <Route path="/gm/*" element={<GmApp />} />
          <Route path="/player/*" element={<PlayerApp />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </SelectedCharacterProvider>
    </DefinitionsProvider>
  );
};
