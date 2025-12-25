/**
 * Combat Lobby - Pre-combat preparation interface
 *
 * Medieval war council aesthetic with parchment, seals, and tactical planning
 */

import React, { useState } from 'react';
import './CombatLobby.css';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface LobbyPlayer {
  id: string;
  name: string;
  characterName?: string;
  isReady: boolean;
  isConnected: boolean;
}

export interface LobbyCombatant {
  id: string;
  bestiaryEntryId?: string;
  characterId?: string;
  name: string;
  faction: 'ally' | 'enemy';
  tier: number;
  energyMax: number;
  apMax: number;
}

export interface LobbyPlayerCharacter {
  playerId: string;
  playerName: string;
  characterId: string;
  characterName: string;
  isDeployed: boolean;
}

export interface BestiaryEntryPreview {
  id: string;
  name: string;
  tier: number;
  energyMax?: number;
  apMax?: number;
  rank?: string;
}

export type InitiativeMode = 'players-first' | 'enemies-first' | 'interleaved';

// ═══════════════════════════════════════════════════════════════════════════
// GM COMBAT LOBBY
// ═══════════════════════════════════════════════════════════════════════════

export interface GmCombatLobbyProps {
  campaignName: string;
  players: LobbyPlayer[];
  combatants: LobbyCombatant[];
  playerCharacters: LobbyPlayerCharacter[];
  bestiaryEntries: BestiaryEntryPreview[];
  initiativeMode: InitiativeMode;
  manualInitiative: boolean;
  onManualInitiativeChange: (enabled: boolean) => void;
  onInitiativeModeChange: (mode: InitiativeMode) => void;
  onAddCombatant: (bestiaryEntryId: string, faction: 'ally' | 'enemy') => void;
  onAddPlayerCharacter: (characterId: string) => void;
  onRemoveCombatant: (combatantId: string) => void;
  onStartCombat: () => void;
  isStarting?: boolean;
}

export const GmCombatLobby: React.FC<GmCombatLobbyProps> = ({
  campaignName,
  players,
  combatants,
  playerCharacters,
  bestiaryEntries,
  initiativeMode,
  manualInitiative,
  onManualInitiativeChange,
  onInitiativeModeChange,
  onAddCombatant,
  onAddPlayerCharacter,
  onRemoveCombatant,
  onStartCombat,
  isStarting = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFaction, setSelectedFaction] = useState<'ally' | 'enemy'>('enemy');

  const filteredBestiary = bestiaryEntries.filter(entry =>
    entry.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const readyCount = players.filter(p => p.isReady).length;
  const canStart = combatants.length > 0;

  const allies = combatants.filter(c => c.faction === 'ally');
  const enemies = combatants.filter(c => c.faction === 'enemy');

  return (
    <div className="combat-lobby combat-lobby--gm">
      {/* PARCHMENT HEADER */}
      <header className="lobby-header">
        <div className="lobby-header__seal">⚔️</div>
        <div className="lobby-header__content">
          <h1 className="lobby-header__title">{campaignName}</h1>
          <p className="lobby-header__subtitle">War Council Chamber</p>
        </div>
        <div className="lobby-header__seal lobby-header__seal--right">🛡️</div>
      </header>

      <div className="lobby-content">
        {/* LEFT COLUMN: Bestiary Browser */}
        <aside className="lobby-sidebar lobby-sidebar--left">
          <div className="player-roster">
            <div className="player-roster__header">
              <h2 className="section-title">
                <span className="section-title__icon">🧑</span>
                Player Characters
              </h2>
            </div>
            <div className="player-roster__list">
              {playerCharacters.length === 0 ? (
                <div className="player-roster__empty">No player characters assigned</div>
              ) : (
                playerCharacters.map((member) => (
                  <div
                    key={member.characterId}
                    className={`player-roster-card ${member.isDeployed ? "player-roster-card--deployed" : ""}`}
                  >
                    <div className="player-roster-card__header">
                      <h3 className="player-roster-card__name">{member.characterName}</h3>
                      {member.isDeployed && <span className="player-roster-card__status">Deployed</span>}
                    </div>
                    <p className="player-roster-card__player">Player: {member.playerName}</p>
                    <button
                      className="player-roster-card__add"
                      onClick={() => onAddPlayerCharacter(member.characterId)}
                      disabled={member.isDeployed}
                    >
                      {member.isDeployed ? "Already Deployed" : "Deploy player character"}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="bestiary-browser">
            <div className="bestiary-browser__header">
              <h2 className="section-title">
                <span className="section-title__icon">📜</span>
                Bestiary Codex
              </h2>
            </div>

            {/* Faction Selector */}
            <div className="faction-selector">
              <button
                className={`faction-btn ${selectedFaction === 'ally' ? 'faction-btn--active' : ''}`}
                onClick={() => setSelectedFaction('ally')}
              >
                <span className="faction-btn__icon">⚔️</span>
                Allies
              </button>
              <button
                className={`faction-btn ${selectedFaction === 'enemy' ? 'faction-btn--active' : ''}`}
                onClick={() => setSelectedFaction('enemy')}
              >
                <span className="faction-btn__icon">☠️</span>
                Enemies
              </button>
            </div>

            {/* Search */}
            <div className="bestiary-search">
              <input
                type="text"
                className="bestiary-search__input"
                placeholder="Search creatures..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Bestiary List */}
            <div className="bestiary-list">
              {filteredBestiary.length === 0 ? (
                <div className="bestiary-list__empty">No creatures found</div>
              ) : (
                filteredBestiary.map(entry => (
                  <div key={entry.id} className="bestiary-card">
                    <div className="bestiary-card__header">
                      <h3 className="bestiary-card__name">{entry.name}</h3>
                      <span className="bestiary-card__tier">Tier {entry.tier}</span>
                    </div>
                    <div className="bestiary-card__stats">
                      {entry.rank && <span className="stat-badge">{entry.rank}</span>}
                    </div>
                    <button
                      className="bestiary-card__add"
                      onClick={() => onAddCombatant(entry.id, selectedFaction)}
                    >
                      <span className="bestiary-card__add-icon">+</span>
                      Deploy to {selectedFaction === 'ally' ? 'Allies' : 'Enemies'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* CENTER COLUMN: Battle Roster */}
        <main className="lobby-main">
          <div className="battle-roster">
            <div className="battle-roster__header">
              <h2 className="section-title">
                <span className="section-title__icon">⚔️</span>
                Battle Roster
              </h2>
              <span className="combatant-count">{combatants.length} Combatants</span>
            </div>

            {/* Allied Forces */}
            <div className="roster-section">
              <h3 className="roster-section__title">
                <span className="roster-section__icon">⚔️</span>
                Allied Forces ({allies.length})
              </h3>
              <div className="roster-list">
                {allies.length === 0 ? (
                  <div className="roster-list__empty">No allies deployed</div>
                ) : (
                  allies.map(combatant => (
                    <div key={combatant.id} className="roster-card roster-card--ally">
                      <div className="roster-card__header">
                        <h4 className="roster-card__name">{combatant.name}</h4>
                        <button
                          className="roster-card__remove"
                          onClick={() => onRemoveCombatant(combatant.id)}
                          title="Remove from roster"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="roster-card__stats">
                        <span className="stat-chip">Tier {combatant.tier}</span>
                        <span className="stat-chip">{combatant.energyMax} HP</span>
                        <span className="stat-chip">{combatant.apMax} AP</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Enemy Forces */}
            <div className="roster-section">
              <h3 className="roster-section__title roster-section__title--enemy">
                <span className="roster-section__icon">☠️</span>
                Enemy Forces ({enemies.length})
              </h3>
              <div className="roster-list">
                {enemies.length === 0 ? (
                  <div className="roster-list__empty">No enemies deployed</div>
                ) : (
                  enemies.map(combatant => (
                    <div key={combatant.id} className="roster-card roster-card--enemy">
                      <div className="roster-card__header">
                        <h4 className="roster-card__name">{combatant.name}</h4>
                        <button
                          className="roster-card__remove"
                          onClick={() => onRemoveCombatant(combatant.id)}
                          title="Remove from roster"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="roster-card__stats">
                        <span className="stat-chip">Tier {combatant.tier}</span>
                        <span className="stat-chip">{combatant.energyMax} HP</span>
                        <span className="stat-chip">{combatant.apMax} AP</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Initiative Mode Selector */}
            <div className="initiative-selector">
              <h3 className="initiative-selector__label">Initiative Order:</h3>
              <div className="initiative-options">
                <button
                  className={`initiative-btn ${initiativeMode === 'players-first' ? 'initiative-btn--active' : ''}`}
                  onClick={() => onInitiativeModeChange('players-first')}
                >
                  Players First
                </button>
                <button
                  className={`initiative-btn ${initiativeMode === 'enemies-first' ? 'initiative-btn--active' : ''}`}
                  onClick={() => onInitiativeModeChange('enemies-first')}
                >
                  Enemies First
                </button>
                <button
                  className={`initiative-btn ${initiativeMode === 'interleaved' ? 'initiative-btn--active' : ''}`}
                  onClick={() => onInitiativeModeChange('interleaved')}
                >
                  Interleaved
                </button>
              </div>
              <label className="initiative-manual">
                <input
                  type="checkbox"
                  checked={manualInitiative}
                  onChange={(event) => onManualInitiativeChange(event.target.checked)}
                />
                <span>Manual Initiative Rolls (players roll)</span>
              </label>
            </div>

            {/* Start Combat Button */}
            <div className="lobby-actions">
              <button
                className="start-combat-btn"
                onClick={onStartCombat}
                disabled={!canStart || isStarting}
              >
                <span className="start-combat-btn__icon">⚔️</span>
                <span className="start-combat-btn__text">
                  {isStarting ? 'Initiating Combat...' : 'Begin Battle'}
                </span>
                <span className="start-combat-btn__icon">⚔️</span>
              </button>
              {!canStart && (
                <p className="lobby-actions__hint">Deploy at least one combatant to begin</p>
              )}
            </div>
          </div>
        </main>

        {/* RIGHT COLUMN: Player Readiness */}
        <aside className="lobby-sidebar lobby-sidebar--right">
          <div className="readiness-panel">
            <div className="readiness-panel__header">
              <h2 className="section-title">
                <span className="section-title__icon">👥</span>
                Adventurers
              </h2>
              <span className="readiness-count">
                {readyCount}/{players.length} Ready
              </span>
            </div>

            <div className="player-list">
              {players.length === 0 ? (
                <div className="player-list__empty">No players connected</div>
              ) : (
                players.map(player => (
                  <div
                    key={player.id}
                    className={`player-card ${player.isReady ? 'player-card--ready' : ''} ${!player.isConnected ? 'player-card--disconnected' : ''}`}
                  >
                    <div className="player-card__seal">
                      {player.isReady ? '✓' : '○'}
                    </div>
                    <div className="player-card__info">
                      <h4 className="player-card__name">{player.name}</h4>
                      {player.characterName && (
                        <p className="player-card__character">{player.characterName}</p>
                      )}
                      {!player.isConnected && (
                        <p className="player-card__status">Disconnected</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// PLAYER COMBAT LOBBY
// ═══════════════════════════════════════════════════════════════════════════

export interface PlayerCombatLobbyProps {
  campaignName: string;
  playerName: string;
  characterName?: string;
  isReady: boolean;
  onToggleReady: (newReadyState: boolean) => void;
  otherPlayers: LobbyPlayer[];
}

export const PlayerCombatLobby: React.FC<PlayerCombatLobbyProps> = ({
  campaignName,
  playerName,
  characterName,
  isReady,
  onToggleReady,
  otherPlayers,
}) => {
  const totalPlayers = otherPlayers.length + 1;
  const readyCount = otherPlayers.filter(p => p.isReady).length + (isReady ? 1 : 0);

  return (
    <div className="combat-lobby combat-lobby--player">
      {/* PARCHMENT HEADER */}
      <header className="lobby-header">
        <div className="lobby-header__seal">⚔️</div>
        <div className="lobby-header__content">
          <h1 className="lobby-header__title">{campaignName}</h1>
          <p className="lobby-header__subtitle">War Council Chamber</p>
        </div>
        <div className="lobby-header__seal lobby-header__seal--right">🛡️</div>
      </header>

      <div className="lobby-content lobby-content--centered">
        <main className="player-lobby-main">
          {/* Your Character Panel */}
          <div className="character-panel">
            <div className="character-panel__header">
              <h2 className="section-title">
                <span className="section-title__icon">⚔️</span>
                Your Character
              </h2>
            </div>
            <div className="character-display">
              <div className="character-display__portrait">
                <div className="character-display__portrait-frame">
                  {characterName ? characterName.charAt(0).toUpperCase() : playerName.charAt(0).toUpperCase()}
                </div>
              </div>
              <div className="character-display__info">
                <h3 className="character-display__name">
                  {characterName || 'No Character Selected'}
                </h3>
                <p className="character-display__player">Played by {playerName}</p>
              </div>
            </div>
          </div>

          {/* Ready Toggle */}
          <div className="ready-section">
            <button
              className={`ready-toggle ${isReady ? 'ready-toggle--ready' : ''}`}
              onClick={() => onToggleReady(!isReady)}
            >
              <span className="ready-toggle__seal">
                {isReady ? '✓' : '○'}
              </span>
              <span className="ready-toggle__text">
                {isReady ? 'READY FOR BATTLE' : 'Mark as Ready'}
              </span>
            </button>
            <p className="ready-section__hint">
              {isReady
                ? 'Waiting for Game Master to begin combat...'
                : 'Click to signal you\'re prepared for combat'}
            </p>
          </div>

          {/* Other Players */}
          <div className="adventurers-panel">
            <div className="adventurers-panel__header">
              <h2 className="section-title">
                <span className="section-title__icon">👥</span>
                Fellow Adventurers
              </h2>
              <span className="readiness-count">
                {readyCount}/{totalPlayers} Ready
              </span>
            </div>

            <div className="adventurer-list">
              {otherPlayers.length === 0 ? (
                <div className="adventurer-list__empty">
                  You are the only adventurer in the lobby
                </div>
              ) : (
                otherPlayers.map(player => (
                  <div
                    key={player.id}
                    className={`adventurer-card ${player.isReady ? 'adventurer-card--ready' : ''} ${!player.isConnected ? 'adventurer-card--disconnected' : ''}`}
                  >
                    <div className="adventurer-card__seal">
                      {player.isReady ? '✓' : '○'}
                    </div>
                    <div className="adventurer-card__info">
                      <h4 className="adventurer-card__name">{player.name}</h4>
                      {player.characterName && (
                        <p className="adventurer-card__character">{player.characterName}</p>
                      )}
                      {!player.isConnected && (
                        <p className="adventurer-card__status">Disconnected</p>
                      )}
                    </div>
                    <div className="adventurer-card__status-text">
                      {player.isReady ? 'Ready' : 'Not Ready'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
