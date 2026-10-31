import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables. " +
      "Copy .env.example to .env and fill in your Supabase project settings."
  );
}

// Client using the anon key, so Row Level Security applies to every query.
// Keep the key in .env and never commit it.
// Shared client without a user: used by the existing properties/bookings routes.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// A client keeps its session in memory. Auth must therefore never run on the
// shared client above, or one user's session would leak into other requests.
const statelessAuthOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
};

// New client for a single auth call (sign up, sign in, refresh, ...).
export const createAuthClient = () =>
  createClient(supabaseUrl, supabaseAnonKey, { auth: statelessAuthOptions });

// New client for one authenticated request. It still uses the anon key, but
// forwards the user's JWT so the database sees the user (role "authenticated")
// and Row Level Security policies can apply.
export const createUserClient = (accessToken: string) =>
  createClient(supabaseUrl, supabaseAnonKey, {
    auth: statelessAuthOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
