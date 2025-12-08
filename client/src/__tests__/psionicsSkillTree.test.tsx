import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { PsionicsPage } from "../modules/psionics/PsionicsPage";
import { PsionicAbility, evaluateFormula, isAbilityUnlocked } from "../modules/psionics/psionicsUtils";

describe("psionics skill tree", () => {
  beforeEach(() => {
    window.localStorage.clear();
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

  it("spends psi points when purchasing an unlocked ability", () => {
    render(<PsionicsPage />);

    const psiDisplay = screen.getByText(/Psi Points Remaining/i).parentElement as HTMLElement;
    expect(psiDisplay).toHaveTextContent("15");

    const telepathyButton = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.trim().startsWith("Telepathy")) as HTMLButtonElement;
    expect(telepathyButton).toBeDefined();
    fireEvent.click(telepathyButton);

    expect(psiDisplay).toHaveTextContent("10");
    expect(telepathyButton).toBeDisabled();
  });
});
