import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PsionicsPage } from "../modules/psionics/PsionicsPage";
import { SelectedCharacterProvider } from "../modules/characters/SelectedCharacterContext";
import { DefinitionsProvider } from "../modules/definitions/DefinitionsContext";
import { PsionicAbility, evaluateFormula, isAbilityUnlocked } from "../modules/psionics/psionicsUtils";

const mockCharacter = {
  id: "char-1",
  name: "Test",
  level: 6,
  skillPoints: 100,
  skillAllocations: {},
  attributes: { MENTAL: 3 }
};
const mockFetch = vi.fn();

const mockDefinitions = {
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

const renderWithProviders = async () => {
  window.localStorage.setItem("selected_character_id", mockCharacter.id);
  (global as any).fetch = mockFetch;
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("/api/definitions")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify(mockDefinitions))
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify([mockCharacter]))
    });
  });

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
    mockFetch.mockReset();
  });

  afterEach(() => {
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
});
