import { describe, expect, it } from "vitest";
import facultiesText from "../data/magic-faculties.txt?raw";
import { MAGIC_FACULTIES, parseMagicFaculties } from "../modules/magic/magicParser";

describe("parseMagicFaculties", () => {
  const parsed = parseMagicFaculties(facultiesText);

  it("returns one entry per configured faculty", () => {
    expect(parsed).toHaveLength(MAGIC_FACULTIES.length);
    expect(parsed.map((f) => f.name)).toEqual(MAGIC_FACULTIES.map((f) => f.name));
  });

  it("extracts tier data when present", () => {
    const thermo = parsed.find((f) => f.name === "Thermomancy");
    expect(thermo?.sourceFound).toBe(true);
    expect((thermo?.tiers.length ?? 0)).toBeGreaterThan(0);
  });

  it("flags missing faculty text", () => {
    const tribo = parsed.find((f) => f.name === "Tribomancy");
    expect(tribo?.sourceFound).toBe(false);
  });
});
