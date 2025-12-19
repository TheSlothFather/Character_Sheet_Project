import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { api, type Character } from "../../api/client";
import { getSupabaseClient } from "../../api/supabaseClient";
import { ACTIVE_CAMPAIGN_STORAGE_KEY } from "../campaigns/campaignStorage";
import { useSelectedCharacter } from "../characters/SelectedCharacterContext";

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0b0f16",
  color: "#e5e7eb",
  display: "grid",
  placeItems: "center",
  padding: "2rem"
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 720,
  background: "#0f131a",
  border: "1px solid #1f2935",
  borderRadius: 16,
  padding: "2rem",
  boxShadow: "0 25px 60px rgba(15, 23, 42, 0.4)"
};

const buttonStyle: React.CSSProperties = {
  padding: "0.7rem 1.2rem",
  borderRadius: 10,
  border: "1px solid #1d4ed8",
  background: "#2563eb",
  color: "#e6edf7",
  fontWeight: 700,
  cursor: "pointer"
};

const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  border: "1px solid #2f3542",
  background: "#111827",
  color: "#e5e7eb"
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

type CampaignInviteRow = {
  token: string;
  campaign_id: string;
  expires_at?: string | null;
};

export const JoinCampaignPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const client = getSupabaseClient();
  const { selectedId, setSelectedId } = useSelectedCharacter();

  const [loading, setLoading] = React.useState(true);
  const [joinLoading, setJoinLoading] = React.useState(false);
  const [characters, setCharacters] = React.useState<Character[]>([]);
  const [invite, setInvite] = React.useState<CampaignInviteRow | null>(null);
  const [user, setUser] = React.useState<User | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = React.useState<string | null>(selectedId);
  const [authMode, setAuthMode] = React.useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [authNotice, setAuthNotice] = React.useState<string | null>(null);
  const [anonLoading, setAnonLoading] = React.useState(false);

  React.useEffect(() => {
    setSelectedCharacterId(selectedId);
  }, [selectedId]);

  React.useEffect(() => {
    let active = true;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    const loadData = async () => {
      setLoading(true);
      setError(null);
      setNotice(null);

      if (!token) {
        setError("Invite token missing.");
        setLoading(false);
        return;
      }

      try {
        const [{ data: inviteData, error: inviteError }, { data: userData, error: userError }] =
          await Promise.all([
            client
              .from("campaign_invites")
              .select("token, campaign_id, expires_at")
              .eq("token", token)
              .maybeSingle() as Promise<{ data: CampaignInviteRow | null; error: { message: string } | null }>,
            client.auth.getUser()
          ]);

        if (!active) return;

        if (inviteError || !inviteData) {
          setError(inviteError?.message ?? "Invite link is invalid.");
          setInvite(null);
          setLoading(false);
          return;
        }

        if (inviteData.expires_at) {
          const expiry = new Date(inviteData.expires_at).getTime();
          if (!Number.isNaN(expiry) && expiry < Date.now()) {
            setError("Invite link has expired.");
            setInvite(null);
            setLoading(false);
            return;
          }
        }

        if (userError) {
          setError(`Auth check failed: ${userError.message}`);
        }
        setUser(userData?.user ?? null);
        setInvite(inviteData);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load invite.");
      }

      try {
        const data = await api.listCharacters();
        if (!active) return;
        setCharacters(data);
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load characters.");
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client, token]);

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthError(null);
    setAuthNotice(null);

    if (!email.trim() || !password) {
      setAuthError("Email and password are required.");
      return;
    }

    if (authMode === "sign-in") {
      const { error: signInError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      if (signInError) {
        setAuthError(signInError.message);
      }
      return;
    }

    const { error: signUpError } = await client.auth.signUp({
      email: email.trim(),
      password
    });
    if (signUpError) {
      setAuthError(signUpError.message);
      return;
    }
    setAuthNotice("Check your email to confirm the account, then sign in.");
  };

  const handleAnonSignIn = async () => {
    setAuthError(null);
    setAuthNotice(null);
    setAnonLoading(true);
    try {
      const { error } = await client.auth.signInAnonymously();
      if (error) {
        setAuthError(error.message);
        return;
      }
      setAuthNotice("Signed in anonymously.");
    } finally {
      setAnonLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!invite) {
      setError("Invite data is missing.");
      return;
    }
    setJoinLoading(true);
    setError(null);
    setNotice(null);

    try {
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError) {
        throw new Error(authError.message);
      }
      const currentUser = authData?.user;
      if (!currentUser) {
        setError("You must be signed in before joining a campaign.");
        setJoinLoading(false);
        return;
      }

      const existing = await client
        .from("campaign_members")
        .select("campaign_id, player_user_id")
        .eq("campaign_id", invite.campaign_id)
        .eq("player_user_id", currentUser.id)
        .maybeSingle();

      if (existing.error) {
        throw new Error(existing.error.message);
      }

      if (existing.data) {
        const { error: updateError } = await client
          .from("campaign_members")
          .update({ character_id: selectedCharacterId ?? null })
          .eq("campaign_id", invite.campaign_id)
          .eq("player_user_id", currentUser.id);
        if (updateError) {
          throw new Error(updateError.message);
        }
      } else {
        const { error: insertError } = await client.from("campaign_members").insert({
          campaign_id: invite.campaign_id,
          player_user_id: currentUser.id,
          character_id: selectedCharacterId ?? null,
          role: "player"
        });
        if (insertError) {
          throw new Error(insertError.message);
        }
      }

      setSelectedId(selectedCharacterId ?? null);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ACTIVE_CAMPAIGN_STORAGE_KEY, invite.campaign_id);
      }
      setNotice("Joined campaign successfully.");
      navigate(`/player/campaigns/${invite.campaign_id}`);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Failed to join campaign.");
    } finally {
      setJoinLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={pageStyle}>
        <div>Loading invite...</div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={{ marginTop: 0 }}>Join Campaign</h1>
        <p style={{ color: "#94a3b8", marginTop: 0 }}>
          Use this invite link to join a campaign with one of your characters.
        </p>
        {error && <div style={{ color: "#fca5a5", marginBottom: "1rem" }}>{error}</div>}
        {notice && <div style={{ color: "#9ae6b4", marginBottom: "1rem" }}>{notice}</div>}
        {!user && (
          <form onSubmit={handleAuth} style={{ marginBottom: "1.5rem" }}>
            <div style={{ fontWeight: 700, marginBottom: "0.5rem" }}>
              {authMode === "sign-in" ? "Sign in to join" : "Create an account to join"}
            </div>
            {authError && <div style={{ color: "#fca5a5", marginBottom: "0.75rem" }}>{authError}</div>}
            {authNotice && <div style={{ color: "#9ae6b4", marginBottom: "0.75rem" }}>{authNotice}</div>}
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
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button type="submit" style={buttonStyle}>
                {authMode === "sign-in" ? "Sign In" : "Create Account"}
              </button>
              <button type="button" style={secondaryButtonStyle} onClick={handleAnonSignIn} disabled={anonLoading}>
                {anonLoading ? "Signing in..." : "Continue as Guest"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in");
                  setAuthError(null);
                  setAuthNotice(null);
                }}
                style={secondaryButtonStyle}
              >
                {authMode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
              </button>
            </div>
          </form>
        )}
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontWeight: 700, marginBottom: "0.5rem" }}>Choose a character (optional)</div>
          {characters.length === 0 ? (
            <div style={{ color: "#94a3b8" }}>No characters found yet. You can join and create one later.</div>
          ) : (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              {characters.map((character) => (
                <label
                  key={character.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.75rem",
                    borderRadius: 10,
                    border: "1px solid #1f2935",
                    background: selectedCharacterId === character.id ? "#172036" : "#0b1017",
                    cursor: "pointer"
                  }}
                >
                  <input
                    type="radio"
                    name="join-character"
                    value={character.id}
                    checked={selectedCharacterId === character.id}
                    onChange={() => {
                      setSelectedCharacterId(character.id);
                      setSelectedId(character.id);
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 700 }}>{character.name}</div>
                    <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>Level {character.level}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button type="button" style={buttonStyle} onClick={handleJoin} disabled={joinLoading}>
            {joinLoading ? "Joining..." : "Join Campaign"}
          </button>
          <button type="button" style={secondaryButtonStyle} onClick={() => navigate("/player/characters")}>
            Back to Characters
          </button>
        </div>
      </div>
    </div>
  );
};
