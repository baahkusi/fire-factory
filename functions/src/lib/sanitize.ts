/**
 * Request sanitizing. Control characters are stripped. Angle brackets are
 * removed so stored text cannot carry a tag, and the API can return the
 * string for React to render as text without entity double-encoding.
 */

const HTML_ESCAPE_LOOKUP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  if (!value) return "";
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPE_LOOKUP[char] ?? char);
}

export function stripControlChars(value: string): string {
  if (!value) return "";
  // Keep newline, carriage return, and tab. Drop the other C0 controls.
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

export function isSafeHttpUrl(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  const trimmed = stripControlChars(value).trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      Boolean(parsed.hostname)
    );
  } catch {
    return false;
  }
}

/** Strip control characters and angle brackets. Trim. */
export function sanitizeText(value: string): string {
  if (!value || typeof value !== "string") return "";
  return stripControlChars(value).replace(/[<>]/g, "").trim();
}

const PRESERVE_KEYS = new Set([
  "password",
  "currentPassword",
  "newPassword",
  "token",
]);

function isUrlKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.endsWith("url") || lower.endsWith("href") || lower === "url";
}

export function sanitizeInput<T>(input: T): T {
  if (input === null || input === undefined) return input;
  if (typeof input === "string") return sanitizeText(input) as unknown as T;
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeInput(item)) as unknown as T;
  }
  if (typeof input !== "object") return input;
  if (input instanceof Date) return input;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(input)) return input;

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") {
      if (PRESERVE_KEYS.has(key)) {
        output[key] = stripControlChars(value);
      } else if (isUrlKey(key)) {
        const cleaned = stripControlChars(value).trim();
        output[key] = cleaned && !isSafeHttpUrl(cleaned) ? "" : cleaned;
      } else {
        output[key] = sanitizeText(value);
      }
    } else {
      output[key] = sanitizeInput(value);
    }
  }
  return output as T;
}
