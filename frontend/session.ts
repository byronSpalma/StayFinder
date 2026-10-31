// Session storage: keeps the user logged in across page reloads.
// Tokens are stored in localStorage but never shown in the UI or logged.

import type { Session } from "./types.js";

const STORAGE_KEY = "stayfinder_session";

// The session we keep in memory while the page is open.
let currentSession: Session | null = null;

export function getSession(): Session | null {
  return currentSession;
}

export function saveSession(session: Session): void {
  currentSession = session;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  currentSession = null;
  localStorage.removeItem(STORAGE_KEY);
}

// Reads the saved session when the page loads.
export function loadSession(): Session | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Session;
    if (typeof parsed.access_token !== "string" || typeof parsed.refresh_token !== "string") {
      clearSession();
      return null;
    }
    currentSession = parsed;
    return parsed;
  } catch {
    clearSession();
    return null;
  }
}

// True when the access token has expired (or is about to, within 30 seconds).
export function isAccessTokenExpired(session: Session): boolean {
  if (typeof session.expires_at !== "number") {
    return false;
  }
  return Date.now() >= session.expires_at * 1000 - 30_000;
}
