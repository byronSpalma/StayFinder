// Small fetch wrapper for the StayFinder API.
// Adds the access token when logged in, refreshes it when expired,
// and turns error responses into readable messages.

import type { ApiErrorBody, Session } from "./types.js";
import {
  clearSession,
  getSession,
  isAccessTokenExpired,
  saveSession,
} from "./session.js";

// Thrown by apiFetch; the message is always safe to show to the user.
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Turns the backend's error body ({ error } or { errors: [...] }) into one readable string.
function readErrorMessage(body: ApiErrorBody | null, fallback: string): string {
  if (body?.errors && body.errors.length > 0) {
    return body.errors.map((issue) => issue.message).join(" ");
  }
  if (body?.error) {
    return body.error;
  }
  return fallback;
}

// Asks the backend for a new access token using the refresh token.
async function refreshSession(session: Session): Promise<Session> {
  const response = await fetch("/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });

  if (!response.ok) {
    clearSession();
    throw new ApiError(response.status, "Your session has expired. Please log in again.");
  }

  const fresh = (await response.json()) as Session;
  saveSession(fresh);
  return fresh;
}

// Returns a valid access token, refreshing it first if it has expired.
async function getAccessToken(): Promise<string | null> {
  let session = getSession();
  if (!session) {
    return null;
  }
  if (isAccessTokenExpired(session)) {
    session = await refreshSession(session);
  }
  return session.access_token;
}

interface ApiFetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  // Set to false for calls that must not send a token (login, register).
  auth?: boolean;
}

// fetch() against our own API with JSON handling and readable errors.
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (auth) {
    const token = await getAccessToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Could not reach the server. Is it running?");
  }

  const text = await response.text();
  const parsed: unknown = text === "" ? null : JSON.parse(text);

  if (!response.ok) {
    throw new ApiError(response.status, readErrorMessage(parsed as ApiErrorBody | null, `Request failed (${response.status})`));
  }

  return parsed as T;
}
