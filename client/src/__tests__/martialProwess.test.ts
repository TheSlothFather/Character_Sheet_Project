import { describe, expect, it } from "vitest";
import { parseMartialCsv } from "../modules/martial/martialUtils";

const csvSample = `Category,Energy Cost,Action Point Cost,Damage,Type,Range,MP,Two-Handed?,Ability Name,Ability Type,Description
Small Blades,1,1,3,Sharp,0-1,5,Yes,Slash,Active,Deals extra damage
,,,,,,,,,,
`;

const armorSample = `Category,Energy Cost,Action Point Cost,Damage,Type,Range,MP,Ability Name,Ability Type,Description
Shield,1,1,2,blunt,0-1,7,Bash,Active,2 blunt at 0-1 range
`;

describe("parseMartialCsv", () => {
  it("skips blank rows and builds stable ids", () => {
    const result = parseMartialCsv(csvSample, "Weapon");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "Weapon:Small Blades:Slash",
      category: "Small Blades",
      name: "Slash",
      mpCost: 5,
      twoHanded: true
    });
  });

  it("handles armor data without two-handed flag", () => {
    const result = parseMartialCsv(armorSample, "Armor");
    expect(result).toHaveLength(1);
    expect(result[0].twoHanded).toBeUndefined();
    expect(result[0].id).toBe("Armor:Shield:Bash");
  });
});
