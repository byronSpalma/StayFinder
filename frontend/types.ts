// Types matching the backend's auth responses (src/routes/auth.ts).

export interface SessionUser {
  id: string;
  email: string;
}

// What POST /auth/login and /auth/refresh return on success.
export interface Session {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at?: number;
  user: SessionUser;
}

// What GET /auth/me returns.
export interface MeResponse {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  created_at: string;
}

// What POST /auth/register returns when "Confirm email" is on (no tokens).
export interface RegisterResponse {
  message: string;
  email_confirmation_required: boolean;
}

// Error shapes the backend uses: { error } or { errors: [...] } from Zod.
export interface ApiErrorBody {
  error?: string;
  errors?: { path?: (string | number)[]; message: string }[];
}
