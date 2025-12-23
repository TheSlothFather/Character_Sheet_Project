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
import { CombatPageNew } from "./characters/CombatPageNew";
import { useTheme } from "../hooks/useTheme";
import "./App.css";

const NotFound: React.FC = () => (
  <div>
    <h2>Page not found</h2>
    <p>The page you are looking for does not exist.</p>
  </div>
);

const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useTheme();

  return (
    <div className="app-theme-toggle">
      <label htmlFor="theme-toggle" className="app-theme-toggle__label caption">
        Theme
      </label>
      <select
        id="theme-toggle"
        value={theme}
        onChange={(event) => setTheme(event.target.value as "parchment" | "dark-fantasy")}
        className="select app-theme-toggle__select caption"
      >
        <option value="parchment">Parchment</option>
        <option value="dark-fantasy">Dark Fantasy</option>
      </select>
    </div>
  );
};

const StartPage: React.FC = () => {
  return (
    <div className="app-start">
      <div className="app-start__content">
        <h1 className="app-start__title h1">Adûrun Builder</h1>
        <p className="app-start__subtitle subtitle muted">
          Choose your role to launch the correct workspace.
        </p>
        <div className="app-start__actions">
          <NavLink
            to="/player/characters"
            className="btn btn--primary app-start__link app-start__link--player"
          >
            I am a Player
          </NavLink>
          <NavLink
            to="/gm/campaigns"
            className="btn app-start__link app-start__link--gm"
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
    <div className="app-shell">
      <nav className="app-shell__nav">
        <h1 className="app-shell__title h2">Adûrun Builder</h1>
        <NavLink
          to="/player/characters"
          className={({ isActive }) => (isActive ? "app-shell__link app-shell__link--active" : "app-shell__link")}
        >
          Characters
        </NavLink>
        {activeCampaignId && (
          <>
            <NavLink
              to={`/player/campaigns/${activeCampaignId}`}
              className={({ isActive }) => (isActive ? "app-shell__link app-shell__link--active" : "app-shell__link")}
            >
              Campaign Hub
            </NavLink>
            <NavLink
              to={`/player/campaigns/${activeCampaignId}/combat`}
              className={({ isActive }) => (isActive ? "app-shell__link app-shell__link--active" : "app-shell__link")}
            >
              Combat
            </NavLink>
          </>
        )}
        <NavLink
          to="/player/character-creation"
          className={({ isActive }) => (isActive ? "app-shell__link app-shell__link--active" : "app-shell__link")}
        >
          Character Creation
        </NavLink>
        <NavLink
          to="/player/ancillaries"
          className={({ isActive }) => (isActive ? "app-shell__link app-shell__link--active" : "app-shell__link")}
        >
          Ancillaries
        </NavLink>
        <NavLink
          to="/player/martial"
          className={({ isActive }) => (isActive ? "app-shell__link app-shell__link--active" : "app-shell__link")}
        >
          Martial Prowess
        </NavLink>
        <NavLink
          to="/player/psionics"
          className={({ isActive }) => (isActive ? "app-shell__link app-shell__link--active" : "app-shell__link")}
        >
          Psionics
        </NavLink>
        <NavLink
          to="/player/magic-faculties"
          className={({ isActive }) => (isActive ? "app-shell__link app-shell__link--active" : "app-shell__link")}
        >
          Magic Faculties
        </NavLink>
        <NavLink
          to="/player/spell-creation"
          className={({ isActive }) => (isActive ? "app-shell__link app-shell__link--active" : "app-shell__link")}
        >
          Spell Creation
        </NavLink>
        <NavLink
          to="/player/deity-relationship"
          className={({ isActive }) => (isActive ? "app-shell__link app-shell__link--active" : "app-shell__link")}
        >
          Deity Relationship
        </NavLink>
      </nav>
      <main className="app-shell__main">
        <Routes>
          <Route path="/" element={<Navigate to="characters" replace />} />
          <Route path="campaigns/:campaignId" element={<CampaignHubLayout />}>
            <Route index element={<Navigate to="characters" replace />} />
            <Route path="characters" element={<CampaignCharactersPage />} />
            <Route path="settings" element={<CampaignSettingsPage />} />
            <Route path="combat" element={<CombatPageNew />} />
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
