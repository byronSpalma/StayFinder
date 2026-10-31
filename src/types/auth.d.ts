import type { AuthUser, SupabaseClient } from "@supabase/supabase-js";

// Values the requireAuth middleware stores on the Hono context (c.get / c.set).
export type AuthVariables = {
  // The user Supabase verified from the access token. Never taken from the request body.
  user: AuthUser;
  // Client that forwards the user's JWT, for RLS-protected database access.
  db: SupabaseClient;
};
