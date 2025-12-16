import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PsionicsPage } from "../modules/psionics/PsionicsPage";
import { SelectedCharacterProvider } from "../modules/characters/SelectedCharacterContext";
import { DefinitionsProvider } from "../modules/definitions/DefinitionsContext";
import { PsionicAbility, evaluateFormula, isAbilityUnlocked } from "../modules/psionics/psionicsUtils";
import { setSupabaseClient } from "../api/supabaseClient";

let mockCharacter: any;
let mockDefinitions: any;

type TableData = Record<string, any[]>;

class MockQuery<T> {
  private data: any[];
  private filter: { column: string; value: unknown } | null = null;

  constructor(private table: string, private tables: TableData) {
    this.data = tables[table] ?? [];
  }

  select(): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filter = { column, value };
    this.data = (this.tables[this.table] ?? []).filter((row) => row[column] === value);
    return this;
  }

  limit(count: number): this {
    this.data = (this.data ?? []).slice(0, count);
    return this;
  }

  order(): this {
    return this;
  }

  maybeSingle() {
    return Promise.resolve({ data: this.data[0] ?? null, error: null });
  }

  single() {
    return Promise.resolve({ data: this.data[0] ?? null, error: null });
  }

  insert(payload: any): this {
    const rows = Array.isArray(payload) ? payload : [payload];
    if (!this.tables[this.table]) this.tables[this.table] = [];
    rows.forEach((row) => {
      const nextId = row.id ?? `id-${this.tables[this.table].length + 1}`;
      this.tables[this.table].push({ ...row, id: nextId });
    });
    this.data = rows.map((row, idx) => ({ ...row, id: row.id ?? `id-${(this.tables[this.table].length - rows.length) + idx + 1}` }));
    return this;
  }

  update(payload: any): this {
    if (!this.tables[this.table]) this.tables[this.table] = [];
    this.tables[this.table] = this.tables[this.table].map((row) =>
      this.filter && row[this.filter.column] === this.filter.value ? { ...row, ...payload } : row
    );
    this.data = this.tables[this.table].filter((row) =>
      this.filter ? row[this.filter.column] === this.filter.value : true
    );
    return this;
  }

  delete() {
    if (this.filter) {
      this.tables[this.table] = (this.tables[this.table] ?? []).filter(
        (row) => row[this.filter!.column] !== this.filter!.value
      );
    }
    return Promise.resolve({ data: null, error: null });
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: T; error: null }) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ) {
    const result = { data: this.data as any, error: null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

class MockSupabaseClient {
  constructor(private tables: TableData) {}

  from(table: string) {
    return new MockQuery(table, this.tables);
  }
}

const toCharacterRow = (character: any) => ({
  id: character.id,
  name: character.name,
  level: character.level,
  race_key: character.raceKey ?? null,
  subrace_key: character.subraceKey ?? null,
  notes: character.notes ?? null,
  attribute_points_available: character.attributePointsAvailable ?? null,
  skill_points: character.skillPoints ?? 0,
  skill_allocations: character.skillAllocations ?? {},
  skill_allocation_minimums: character.skillAllocationMinimums ?? null,
  skill_bonuses: character.skillBonuses ?? null,
  backgrounds: character.backgrounds ?? null,
  attributes: character.attributes ?? null,
  fate_points: character.fatePoints ?? null,
  weapon_notes: character.weaponNotes ?? null,
  defense_notes: character.defenseNotes ?? null,
  gear_notes: character.gearNotes ?? null,
  created_at: character.createdAt ?? null,
  updated_at: character.updatedAt ?? null
});

const refreshSupabase = () => {
  const tables: TableData = {
    content_rulesets: [{ id: 1, key: "default", name: "Default" }],
    content_attributes: (mockDefinitions.attributes ?? []).map((attr: any) => ({
      ruleset_id: 1,
      key: attr.id,
      name: attr.name ?? attr.id,
      description: attr.description ?? null
    })),
    content_skills: (mockDefinitions.skills ?? []).map((skill: any) => ({
      ruleset_id: 1,
      key: skill.id,
      name: skill.name ?? skill.id,
      description: skill.description ?? null,
      attribute_key: skill.attributeKey ?? null
    })),
    content_races: (mockDefinitions.races ?? []).map((race: any) => ({
      ruleset_id: 1,
      key: race.id,
      name: race.name ?? race.id,
      description: race.description ?? null
    })),
    content_subraces: (mockDefinitions.subraces ?? []).map((subrace: any) => ({
      ruleset_id: 1,
      race_key: subrace.parentId,
      key: subrace.id,
      name: subrace.name ?? subrace.id,
      description: subrace.description ?? null
    })),
    content_feats: [],
    content_items: [],
    content_status_effects: [],
    content_derived_stats: [],
    content_modifiers: [],
    content_race_details: Object.entries(mockDefinitions.raceDetails ?? {}).map(([raceKey, details]: any) => ({
      ruleset_id: 1,
      race_key: raceKey,
      attributes: details.attributes ?? {},
      skills: details.skills ?? {},
      disciplines: details.disciplines ?? {},
      deity_cap_per_spirit: details.deityCapPerSpirit ?? null
    })),
    characters: [toCharacterRow(mockCharacter)]
  };

  (globalThis as any).__SUPABASE_ENV__ = {
    VITE_SUPABASE_URL: "http://localhost",
    VITE_SUPABASE_ANON_KEY: "anon"
  };
  setSupabaseClient(new MockSupabaseClient(tables) as any);
};

const renderWithProviders = async () => {
  window.localStorage.setItem("selected_character_id", mockCharacter.id);
  refreshSupabase();

  render(
    <DefinitionsProvider>
      <SelectedCharacterProvider>
        <PsionicsPage />
      </SelectedCharacterProvider>
    </DefinitionsProvider>
  );

  await screen.findByText(/Psi Points Remaining/i);
};

describe("psionics skill tree", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockCharacter = {
      id: "char-1",
      name: "Test",
      level: 6,
      skillPoints: 100,
      skillAllocations: {},
      attributes: { MENTAL: 3 }
    };
    mockDefinitions = {
      ruleset: null,
      attributes: [{ id: "MENTAL", name: "MENTAL" }],
      skills: [],
      races: [],
      subraces: [],
      feats: [],
      items: [],
      statusEffects: [],
      derivedStats: [],
      modifiers: [],
      raceDetails: {}
    };
  });

  afterEach(() => {
    setSupabaseClient(null as any);
    delete (globalThis as any).__SUPABASE_ENV__;
    vi.restoreAllMocks();
  });

  it("evaluates Mental based formulas", () => {
    expect(evaluateFormula("Mental*5", 3)).toBe(15);
  });

  it("checks prerequisite unlocking", () => {
    const ability: PsionicAbility = {
      id: "Test:Advanced",
      tree: "Test",
      name: "Advanced",
      tier: 2,
      prerequisiteNames: ["Basic"],
      prerequisiteIds: ["Test:Basic"],
      description: "",
      energyCost: 5
    };

    expect(isAbilityUnlocked(ability, new Set())).toBe(false);
    expect(isAbilityUnlocked(ability, new Set(["Test:Basic"]))).toBe(true);
  });

  it("keeps tier 1 locked until purchased when configured", () => {
    const starter: PsionicAbility = {
      id: "Psi:Awaken",
      tree: "Psi",
      name: "Awaken",
      tier: 1,
      prerequisiteNames: [],
      prerequisiteIds: [],
      description: "",
      energyCost: 5
    };

    expect(isAbilityUnlocked(starter, new Set(), { allowTier1WithoutPrereq: false })).toBe(false);
    expect(isAbilityUnlocked(starter, new Set([starter.id]), { allowTier1WithoutPrereq: false })).toBe(true);
  });

  it("spends psi points when purchasing an unlocked ability", async () => {
    await renderWithProviders();

    const psiDisplay = screen.getByText(/Psi Points Remaining/i).parentElement as HTMLElement;
    expect(psiDisplay).toHaveTextContent("30");

    const telepathyButton = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.trim().startsWith("Telepathy")) as HTMLButtonElement;
    expect(telepathyButton).toBeDefined();
    fireEvent.click(telepathyButton);

    expect(psiDisplay).toHaveTextContent("29");
    expect(telepathyButton).toBeDisabled();
  });

  it("keeps Interfere locked until Telepathy is purchased", async () => {
    await renderWithProviders();

    const telepathyButton = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.trim().startsWith("Telepathy")) as HTMLButtonElement;

    const interfereButton = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.trim().startsWith("Interfere")) as HTMLButtonElement;

    expect(telepathyButton).toBeDefined();
    expect(interfereButton).toBeDefined();
    expect(interfereButton).toBeDisabled();

    fireEvent.click(telepathyButton);

    expect(interfereButton).not.toBeDisabled();
  });

  it("allows spending psi at level 1 during the initial advancement window", async () => {
    mockCharacter = {
      id: "char-1",
      name: "Psi Novice",
      level: 1,
      raceKey: "psi-race",
      skillPoints: 0,
      skillAllocations: {},
      attributes: { MENTAL: 2 }
    };

    mockDefinitions = {
      ...mockDefinitions,
      raceDetails: {
        "psi-race": {
          attributes: {},
          skills: {},
          disciplines: { martialProwess: 0, ildakarFaculty: 0, psiPoints: 2, deityCapPerSpirit: 0 }
        }
      }
    };

    await renderWithProviders();

    const psiDisplay = screen.getByText(/Psi Points Remaining/i).parentElement as HTMLElement;
    expect(psiDisplay).toHaveTextContent("2");

    const telepathyButton = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.trim().startsWith("Telepathy")) as HTMLButtonElement;

    expect(telepathyButton).toBeDefined();
    expect(telepathyButton).not.toBeDisabled();

    fireEvent.click(telepathyButton);

    expect(psiDisplay).toHaveTextContent("1");
  });
});
