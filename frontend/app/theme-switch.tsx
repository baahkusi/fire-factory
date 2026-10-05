"use client";

import {useEffect, useState} from "react";
import {parseThemeChoice, resolveTheme, THEME_STORAGE_KEY, type ThemeChoice} from "../lib/theme";

const CHOICES: {value: ThemeChoice; label: string}[] = [
  {value: "light", label: "Light"},
  {value: "dark", label: "Dark"},
  {value: "system", label: "System"},
];

export function applyTheme(choice: ThemeChoice) {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const root = document.documentElement;
  root.dataset.theme = choice;
  root.dataset.resolved = resolveTheme(choice, systemDark);
}

export function ThemeSwitch() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    const stored = parseThemeChoice(window.localStorage.getItem(THEME_STORAGE_KEY));
    setChoice(stored);
    applyTheme(stored);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const current = parseThemeChoice(window.localStorage.getItem(THEME_STORAGE_KEY));
      applyTheme(current);
      setChoice(current);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function choose(next: ThemeChoice) {
    setChoice(next);
    if (next === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    applyTheme(next);
  }

  return (
    <div className="theme-switch" role="group" aria-label="Color theme">
      {CHOICES.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={choice === item.value}
          onClick={() => choose(item.value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
