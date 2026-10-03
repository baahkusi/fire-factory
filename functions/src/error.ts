import {z} from "zod";

export type AppErrorCode =
  | "invalid-request"
  | "not-found"
  | "unauthenticated"
  | "forbidden"
  | "conflict"
  | "internal";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;

  constructor(code: AppErrorCode, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function statusForCode(code: AppErrorCode): number {
  switch (code) {
  case "unauthenticated":
    return 401;
  case "forbidden":
    return 403;
  case "not-found":
    return 404;
  case "conflict":
    return 409;
  case "internal":
    return 500;
  default:
    return 400;
  }
}

export function formatZodError(error: z.ZodError): string {
  const issues = error.issues;
  if (!issues || issues.length === 0) {
    return "Invalid request data.";
  }
  const messages = issues.map((issue) => {
    const field = issue.path
      .filter((part) => typeof part === "string" || typeof part === "number")
      .join(".");
    if (field) return `${field}: ${issue.message}`;
    return issue.message;
  });
  return Array.from(new Set(messages)).join("; ");
}

export function sanitizeErrorMessage(message: string): string {
  if (!message) return "An unexpected error occurred.";
  const trimmed = message.trim();

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return formatZodError(new z.ZodError(parsed));
      }
    } catch {
      /* not a Zod issue array */
    }
  }

  const sensitivePatterns = [
    /(\/[a-zA-Z0-9_.-]+){3,}/,
    /at\s+[\w.<>]+\s+\(/,
    /node_modules|npm run|FAILED_PRECONDITION/,
    /requires an index|FirebaseError|TypeError/,
    /ReferenceError|SyntaxError|ECONNREFUSED|getaddrinfo/,
  ];
  if (sensitivePatterns.some((pattern) => pattern.test(trimmed))) {
    return "The request could not be processed. Please check your details and try again.";
  }

  return trimmed;
}
