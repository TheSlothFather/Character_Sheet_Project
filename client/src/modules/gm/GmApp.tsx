import React from "react";
import type { User } from "@supabase/supabase-js";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { getSupabaseClient } from "../../api/supabaseClient";
import { CampaignsPage } from "./CampaignsPage";
import { BestiaryPage } from "./BestiaryPage";
import { NpcHubPage } from "./NpcHubPage";
import { SettingInfoPage } from "./SettingInfoPage";
import { PlayerCharactersPage } from "./PlayerCharactersPage";
import { CombatPageNew } from "./CombatPageNew";
import { GmCampaignLayout } from "./GmCampaignLayout";
import "./GmApp.css";

const NotFound: React.FC = () => (
  <div>
    <h2>GM page not found</h2>
    <p>The GM page you are looking for does not exist.</p>
  </div>
);

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
      <div className="gm-app__center">
        <div className="gm-app__muted">Checking session...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="gm-app__center">
        <form onSubmit={handleAuth} className="gm-app__auth">
          <div className="gm-app__card">
            <h2 className="gm-app__card-title h2">{authMode === "sign-in" ? "GM Sign In" : "Create GM Account"}</h2>
            <p className="gm-app__subtitle subtitle muted">
              You must be signed in for GM actions (campaigns, invites, bestiary, settings).
            </p>
            {error && <div className="gm-app__message gm-app__message--error">{error}</div>}
            {notice && <div className="gm-app__message gm-app__message--success">{notice}</div>}
            <label className="gm-app__field">
              <span className="gm-app__label">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="gm-app__input"
                autoComplete="email"
              />
            </label>
            <label className="gm-app__field gm-app__field--spaced">
              <span className="gm-app__label">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="gm-app__input"
                autoComplete={authMode === "sign-in" ? "current-password" : "new-password"}
              />
            </label>
            <button
              type="submit"
              className="gm-app__button"
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
              className="gm-app__button gm-app__button--secondary"
            >
              {authMode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  const location = useLocation();
  const campaignMatch = location.pathname.match(/^\/gm\/campaigns\/([^/]+)/);
  const campaignId = campaignMatch?.[1] ?? null;

  return (
    <div className="gm-app">
      <nav className="gm-app__nav">
        <h1 className="gm-app__title h2">GM Console</h1>
        <div className="gm-app__meta caption muted">
          {user.email ?? "Signed in"}
          <button
            type="button"
            onClick={handleSignOut}
            className="gm-app__button gm-app__button--compact"
          >
            Sign Out
          </button>
        </div>
        <NavLink to="/gm" className={({ isActive }) => (isActive ? "gm-app__link gm-app__link--active" : "gm-app__link")}>
          Campaigns
        </NavLink>
        {campaignId && (
          <>
            <NavLink
              to={`/gm/campaigns/${campaignId}/bestiary`}
              className={({ isActive }) => (isActive ? "gm-app__link gm-app__link--active" : "gm-app__link")}
            >
              Bestiary
            </NavLink>
            <NavLink
              to={`/gm/campaigns/${campaignId}/combat`}
              className={({ isActive }) => (isActive ? "gm-app__link gm-app__link--active" : "gm-app__link")}
            >
              Combat
            </NavLink>
            <NavLink
              to={`/gm/campaigns/${campaignId}/npc-hub`}
              className={({ isActive }) => (isActive ? "gm-app__link gm-app__link--active" : "gm-app__link")}
            >
              NPC Hub
            </NavLink>
            <NavLink
              to={`/gm/campaigns/${campaignId}/setting-info`}
              className={({ isActive }) => (isActive ? "gm-app__link gm-app__link--active" : "gm-app__link")}
            >
              Setting Info
            </NavLink>
            <div className="gm-app__section-label caption muted">
              Player Views
            </div>
            <NavLink
              to={`/gm/campaigns/${campaignId}/player-characters`}
              className={({ isActive }) => (isActive ? "gm-app__link gm-app__link--active" : "gm-app__link")}
            >
              Player Characters
            </NavLink>
          </>
        )}
      </nav>
      <main className="gm-app__main">
        <Routes>
          <Route index element={<CampaignsPage />} />
          <Route path="campaigns/:campaignId" element={<GmCampaignLayout />}>
            <Route index element={<Navigate to="bestiary" replace />} />
            <Route path="bestiary" element={<BestiaryPage />} />
            <Route path="combat" element={<CombatPageNew />} />
            <Route path="npc-hub" element={<NpcHubPage />} />
            <Route path="setting-info" element={<SettingInfoPage />} />
            <Route path="player-characters" element={<PlayerCharactersPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
};
