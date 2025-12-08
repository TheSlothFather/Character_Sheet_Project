import React from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { CharactersPage } from "./characters/CharactersPage";
import { SelectedCharacterProvider } from "./characters/SelectedCharacterContext";
import { DefinitionsProvider } from "./definitions/DefinitionsContext";
import { PsionicsPage } from "./psionics/PsionicsPage";

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
            <NavLink to="/psionics" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}>
              Psionics
            </NavLink>
          </nav>
          <main style={{ flex: 1, padding: "1rem" }}>
            <Routes>
              <Route path="/" element={<Navigate to="/characters" replace />} />
              <Route path="/characters" element={<CharactersPage />} />
              <Route path="/psionics" element={<PsionicsPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </SelectedCharacterProvider>
    </DefinitionsProvider>
  );
};

