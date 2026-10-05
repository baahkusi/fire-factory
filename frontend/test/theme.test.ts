import {describe, expect, it} from "vitest";
import {parseThemeChoice, resolveTheme} from "../lib/theme";

describe("theme", () => {
  it("treats a missing or unknown value as system", () => {
    expect(parseThemeChoice(null)).toBe("system");
    expect(parseThemeChoice("sepia")).toBe("system");
    expect(parseThemeChoice("dark")).toBe("dark");
  });

  it("follows the system only when the choice is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});
