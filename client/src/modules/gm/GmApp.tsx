import React from "react";
import type { User } from "@supabase/supabase-js";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { getSupabaseClient } from "../../api/supabaseClient";
import { CampaignsPage } from "./CampaignsPage";
import { BestiaryPage } from "./BestiaryPage";
import { NpcHubPage } from "./NpcHubPage";
import { SettingInfoPage } from "./SettingInfoPage";
import { PlayerCharactersPage } from "./PlayerCharactersPage";
import { CombatPage } from "./CombatPage";

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

const cardStyle: React.CSSProperties = {
  background: "#0f131a",
  border: "1px solid #1f2935",
  borderRadius: 12,
  padding: "1.5rem",
  boxShadow: "0 20px 50px rgba(15, 23, 42, 0.35)"
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.75rem",
  borderRadius: 8,
  border: "1px solid #2f3542",
  background: "#0b1017",
  color: "#e5e7eb",
  boxSizing: "border-box"
};

export const GmApp: React.FC = () => {
  const client = getSupabaseClient();
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [authMode, setAuthMode] = React.useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    client.auth.getUser().then(({ data, error: authError }) => {
      if (!active) return;
      if (authError) {
        setError(`Auth check failed: ${authError.message}`);
      }
      setUser(data?.user ?? null);
      setLoading(false);
    });

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }

    if (authMode === "sign-in") {
      const { error: signInError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      if (signInError) {
        setError(signInError.message);
      }
      return;
    }

    const { error: signUpError } = await client.auth.signUp({
      email: email.trim(),
      password
    });
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    setNotice("Check your email to confirm the account, then sign in.");
  };

  const handleSignOut = async () => {
    setError(null);
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b0f16", color: "#e5e7eb" }}>
        <div>Checking session...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b0f16", color: "#e5e7eb" }}>
        <form onSubmit={handleAuth} style={{ width: "100%", maxWidth: 420 }}>
          <div style={cardStyle}>
            <h2 style={{ marginTop: 0 }}>{authMode === "sign-in" ? "GM Sign In" : "Create GM Account"}</h2>
            <p style={{ color: "#94a3b8", marginTop: 0 }}>
              You must be signed in for GM actions (campaigns, invites, bestiary, settings).
            </p>
            {error && <div style={{ color: "#fca5a5", marginBottom: "0.75rem" }}>{error}</div>}
            {notice && <div style={{ color: "#9ae6b4", marginBottom: "0.75rem" }}>{notice}</div>}
            <label style={{ display: "grid", gap: "0.35rem", marginBottom: "0.75rem" }}>
              <span style={{ fontWeight: 600 }}>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                style={inputStyle}
                autoComplete="email"
              />
            </label>
            <label style={{ display: "grid", gap: "0.35rem", marginBottom: "1rem" }}>
              <span style={{ fontWeight: 600 }}>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                style={inputStyle}
                autoComplete={authMode === "sign-in" ? "current-password" : "new-password"}
              />
            </label>
            <button
              type="submit"
              style={{
                padding: "0.6rem 0.9rem",
                borderRadius: 8,
                border: "1px solid #1d4ed8",
                background: "#2563eb",
                color: "#e6edf7",
                fontWeight: 700,
                width: "100%",
                cursor: "pointer"
              }}
            >
              {authMode === "sign-in" ? "Sign In" : "Create Account"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in");
                setError(null);
                setNotice(null);
              }}
              style={{
                marginTop: "0.75rem",
                width: "100%",
                padding: "0.55rem 0.9rem",
                borderRadius: 8,
                border: "1px solid #2f3542",
                background: "#111827",
                color: "#e5e7eb",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              {authMode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </form>
      </div>
    );
  }

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
        <h1 style={{ fontSize: 18, marginBottom: "0.5rem" }}>GM Console</h1>
        <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: "1rem" }}>
          {user.email ?? "Signed in"}
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              marginTop: "0.35rem",
              width: "100%",
              padding: "0.35rem 0.6rem",
              borderRadius: 8,
              border: "1px solid #2f3542",
              background: "#111827",
              color: "#e5e7eb",
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Sign Out
          </button>
        </div>
        <NavLink to="/gm/campaigns" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}>
          Campaigns
        </NavLink>
        <NavLink to="/gm/bestiary" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}>
          Bestiary
        </NavLink>
        <NavLink to="/gm/combat" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeLinkStyle } : linkStyle)}>
          Combat
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
          <Route path="/" element={<Navigate to="campaigns" replace />} />
          <Route path="campaigns" element={<CampaignsPage />} />
          <Route path="bestiary" element={<BestiaryPage />} />
          <Route path="combat" element={<CombatPage />} />
          <Route path="npc-hub" element={<NpcHubPage />} />
          <Route path="setting-info" element={<SettingInfoPage />} />
          <Route path="player-characters" element={<PlayerCharactersPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
};
