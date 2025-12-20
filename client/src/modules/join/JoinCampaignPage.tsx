import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { api, type Character } from "../../api/client";
import { getSupabaseClient } from "../../api/supabaseClient";
import { ACTIVE_CAMPAIGN_STORAGE_KEY } from "../campaigns/campaignStorage";
import { useSelectedCharacter } from "../characters/SelectedCharacterContext";
import "./JoinCampaignPage.css";

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
      <div className="join-campaign">
        <div className="join-campaign__loading">Loading invite...</div>
      </div>
    );
  }

  return (
    <div className="join-campaign">
      <div className="join-campaign__card">
        <h1 className="join-campaign__title">Join Campaign</h1>
        <p className="join-campaign__subtitle">
          Use this invite link to join a campaign with one of your characters.
        </p>
        {error && <div className="join-campaign__message join-campaign__message--error">{error}</div>}
        {notice && <div className="join-campaign__message join-campaign__message--success">{notice}</div>}
        {!user && (
          <form onSubmit={handleAuth} className="join-campaign__auth">
            <div className="join-campaign__auth-title">
              {authMode === "sign-in" ? "Sign in to join" : "Create an account to join"}
            </div>
            {authError && <div className="join-campaign__message join-campaign__message--error">{authError}</div>}
            {authNotice && <div className="join-campaign__message join-campaign__message--success">{authNotice}</div>}
            <label className="join-campaign__field">
              <span className="join-campaign__label">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="join-campaign__input"
                autoComplete="email"
              />
            </label>
            <label className="join-campaign__field join-campaign__field--spaced">
              <span className="join-campaign__label">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="join-campaign__input"
                autoComplete={authMode === "sign-in" ? "current-password" : "new-password"}
              />
            </label>
            <div className="join-campaign__button-row">
              <button type="submit" className="join-campaign__button">
                {authMode === "sign-in" ? "Sign In" : "Create Account"}
              </button>
              <button
                type="button"
                className="join-campaign__button join-campaign__button--secondary"
                onClick={handleAnonSignIn}
                disabled={anonLoading}
              >
                {anonLoading ? "Signing in..." : "Continue as Guest"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === "sign-in" ? "sign-up" : "sign-in");
                  setAuthError(null);
                  setAuthNotice(null);
                }}
                className="join-campaign__button join-campaign__button--secondary"
              >
                {authMode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
              </button>
            </div>
          </form>
        )}
        <div className="join-campaign__characters">
          <div className="join-campaign__characters-title">Choose a character (optional)</div>
          {characters.length === 0 ? (
            <div className="join-campaign__muted">No characters found yet. You can join and create one later.</div>
          ) : (
            <div className="join-campaign__character-list">
              {characters.map((character) => (
                <label
                  key={character.id}
                  className={`join-campaign__character${selectedCharacterId === character.id ? " join-campaign__character--selected" : ""}`}
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
                    <div className="join-campaign__character-name">{character.name}</div>
                    <div className="join-campaign__character-meta">Level {character.level}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="join-campaign__button-row">
          <button type="button" className="join-campaign__button" onClick={handleJoin} disabled={joinLoading}>
            {joinLoading ? "Joining..." : "Join Campaign"}
          </button>
          <button
            type="button"
            className="join-campaign__button join-campaign__button--secondary"
            onClick={() => navigate("/player/characters")}
          >
            Back to Characters
          </button>
        </div>
      </div>
    </div>
  );
};
