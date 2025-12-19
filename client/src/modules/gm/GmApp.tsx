import React from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { CampaignsPage } from "./CampaignsPage";
import { BestiaryPage } from "./BestiaryPage";
import { NpcHubPage } from "./NpcHubPage";
import { SettingInfoPage } from "./SettingInfoPage";
import { PlayerCharactersPage } from "./PlayerCharactersPage";

const linkStyle: React.CSSProperties = {
  display: "block",
  padding: "0.5rem 0",
  color: "#e5e7eb",
  textDecoration: "none"
};

const activeLinkStyle: React.CSSProperties = {
  fontWeight: 700,
  color: "#9ae6b4"
};

const NotFound: React.FC = () => (
  <div>
    <h2>GM page not found</h2>
    <p>The GM page you are looking for does not exist.</p>
  </div>
);

export const GmApp: React.FC = () => {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0b0f16", color: "#e5e7eb" }}>
      <nav
        style={{
          width: 240,
          borderRight: "1px solid #1f2935",
          padding: "1rem",
          boxSizing: "border-box"
        }}
      >
        <h1 style={{ fontSize: 18, marginBottom: "1rem" }}>GM Console</h1>
        <NavLink to="/gm/campaigns" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}>
          Campaigns
        </NavLink>
        <NavLink to="/gm/bestiary" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}>
          Bestiary
        </NavLink>
        <NavLink to="/gm/npc-hub" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}>
          NPC Hub
        </NavLink>
        <NavLink to="/gm/setting-info" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}>
          Setting Info
        </NavLink>
        <div
          style={{
            marginTop: "1rem",
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#94a3b8"
          }}
        >
          Player Views
        </div>
        <NavLink to="/gm/player-characters" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}>
          Player Characters
        </NavLink>
      </nav>
      <main style={{ flex: 1, padding: "1rem" }}>
        <Routes>
          <Route path="/" element={<Navigate to="/gm/campaigns" replace />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/bestiary" element={<BestiaryPage />} />
          <Route path="/npc-hub" element={<NpcHubPage />} />
          <Route path="/setting-info" element={<SettingInfoPage />} />
          <Route path="/player-characters" element={<PlayerCharactersPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
};
