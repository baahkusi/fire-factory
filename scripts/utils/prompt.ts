import * as readline from "node:readline/promises";
import {stdin as input, stdout as output} from "node:process";

export async function ask(
  label: string,
  options?: {default?: string; required?: boolean}
): Promise<string> {
  const rl = readline.createInterface({input, output});
  try {
    const suffix =
      options?.default !== undefined && options.default !== "" ?
        ` [${options.default}]` :
        "";
    const raw = (await rl.question(`${label}${suffix}: `)).trim();
    const value = raw || options?.default || "";
    if (options?.required !== false && !value) {
      throw new Error(`${label} is required`);
    }
    return value;
  } finally {
    rl.close();
  }
}

export async function askChoice(
  label: string,
  choices: string[],
  defaultValue: string
): Promise<string> {
  const list = choices.join(" / ");
  const value = (
    await ask(`${label} (${list})`, {default: defaultValue})
  ).toLowerCase();
  if (!choices.includes(value)) {
    throw new Error(`Choose one of: ${list}`);
  }
  return value;
}

export async function confirm(
  label: string,
  defaultYes = true
): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  const raw = (await ask(`${label} [${hint}]`, {required: false})).toLowerCase();
  if (!raw) return defaultYes;
  return raw === "y" || raw === "yes";
}
