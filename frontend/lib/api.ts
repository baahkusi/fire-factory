import {apiBaseUrl} from "./config";

export interface SessionProfile {
  uid: string;
  email: string;
  displayName: string;
  roles: string[];
  updatedAt: string;
}

export interface SessionResponse {
  uid: string;
  email: string | null;
  roles: string[];
  profile: SessionProfile | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(
  path: string,
  token: string,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(`${apiBaseUrl()}${path}`, {...init, headers});
  const text = await response.text();
  const payload = text ? JSON.parse(text) as {error?: {code?: string; message?: string}} : {};
  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload.error?.code ?? "internal",
      payload.error?.message ?? response.statusText
    );
  }
  return payload as T;
}

export function getSession(token: string): Promise<SessionResponse> {
  return apiFetch<SessionResponse>("/api/session", token);
}

export function updateDisplayName(
  token: string,
  displayName: string
): Promise<{profile: SessionProfile; roles: string[]}> {
  return apiFetch("/api/session", token, {
    method: "PATCH",
    body: JSON.stringify({displayName}),
  });
}
