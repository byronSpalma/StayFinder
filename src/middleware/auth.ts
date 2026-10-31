import { createMiddleware } from "hono/factory";
import { createAuthClient, createUserClient } from "../lib/supabaseClient.js";
import type { AuthVariables } from "../types/auth.js";

// Extracts the token from an "Authorization: Bearer <token>" header.
export function getBearerToken(header: string | undefined): string | null {
  const [scheme, token, ...rest] = (header ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token || rest.length > 0) {
    return null;
  }
  return token;
}

// Protects a route: only requests with a valid Supabase access token get through.
export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    const token = getBearerToken(c.req.header("Authorization"));
    if (!token) {
      return c.json({ error: "Missing or malformed Authorization header" }, 401);
    }

    // Supabase checks the token's signature and that the session is still valid.
    const { data, error } = await createAuthClient().auth.getUser(token);
    if (error || !data.user) {
      return c.json({ error: "Invalid or expired access token" }, 401);
    }

    // The identity comes only from the verified token, never from the request.
    c.set("user", data.user);
    c.set("db", createUserClient(token));
    await next();
  }
);
