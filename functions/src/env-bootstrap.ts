/**
 * Load functions/.env for local Node. Cloud Functions also injects that file.
 * Existing process env wins, so shell and emulator vars are not overwritten.
 */
import {existsSync, readdirSync, readFileSync} from "node:fs";
import {resolve} from "node:path";

function loadDotEnv(filePath: string): void {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv(resolve(__dirname, "../.env"));

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  const scriptsDir = resolve(__dirname, "../../scripts");
  if (existsSync(scriptsDir)) {
    const match = readdirSync(scriptsDir)
      .filter(
        (name) =>
          name.includes("firebase-adminsdk") && name.endsWith(".json")
      )
      .sort()[0];
    if (match) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = resolve(scriptsDir, match);
    }
  }
}
