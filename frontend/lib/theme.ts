export type ThemeChoice = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "ff-theme";

export function parseThemeChoice(value: string | null): ThemeChoice {
  if (value === "light" || value === "dark") return value;
  return "system";
}

/** System follows the OS. An explicit light or dark choice wins. */
export function resolveTheme(choice: ThemeChoice, systemDark: boolean): "light" | "dark" {
  if (choice === "light" || choice === "dark") return choice;
  return systemDark ? "dark" : "light";
}
