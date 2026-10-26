import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables. " +
      "Copy .env.example to .env and fill in your Supabase project settings."
  );
}

// Server-only client using the service_role key, so it bypasses Row Level
// Security. Never import this module into client-side/browser code.
export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
