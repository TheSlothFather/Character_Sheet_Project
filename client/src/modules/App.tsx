import React from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { CharactersPage } from "./characters/CharactersPage";
import { CharacterCreationPage } from "./characters/CharacterCreationPage";
import { SelectedCharacterProvider } from "./characters/SelectedCharacterContext";
import { DefinitionsProvider } from "./definitions/DefinitionsContext";
import { MartialProwessPage } from "./martial/MartialProwessPage";
import { PsionicsPage } from "./psionics/PsionicsPage";
import { MagicFacultiesPage } from "./magic/MagicFacultiesPage";
import { SpellCreationPage } from "./magic/SpellCreationPage";

const linkStyle: React.CSSProperties = {
  display: "block",
  padding: "0.5rem 0",
  color: "#eee",
  textDecoration: "none"
};

const activeLinkStyle: React.CSSProperties = {
  fontWeight: 700,
  color: "#9ae6b4"
};

const NotFound: React.FC = () => (
  <div>
    <h2>Page not found</h2>
    <p>The page you are looking for does not exist.</p>
  </div>
);

export const App: React.FC = () => {
  return (
    <DefinitionsProvider>
      <SelectedCharacterProvider>
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
            <NavLink to="/characters" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}>
              Characters
            </NavLink>
            <NavLink
              to="/character-creation"
              style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}
            >
              Character Creation
            </NavLink>
            <NavLink to="/martial" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}>
              Martial Prowess
            </NavLink>
            <NavLink to="/psionics" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}>
              Psionics
            </NavLink>
            <NavLink
              to="/magic-faculties"
              style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}
            >
              Magic Faculties
            </NavLink>
            <NavLink to="/spell-creation" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}>
              Spell Creation
            </NavLink>
          </nav>
          <main style={{ flex: 1, padding: "1rem" }}>
            <Routes>
              <Route path="/" element={<Navigate to="/characters" replace />} />
              <Route path="/characters" element={<CharactersPage />} />
              <Route path="/character-creation" element={<CharacterCreationPage />} />
              <Route path="/martial" element={<MartialProwessPage />} />
              <Route path="/psionics" element={<PsionicsPage />} />
              <Route path="/magic-faculties" element={<MagicFacultiesPage />} />
              <Route path="/spell-creation" element={<SpellCreationPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </SelectedCharacterProvider>
    </DefinitionsProvider>
  );
};

