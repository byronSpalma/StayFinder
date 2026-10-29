import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables. " +
      "Copy .env.example to .env and fill in your Supabase project settings."
  );
}

// Client using the anon key, so Row Level Security applies to every query.
// Keep the key in .env and never commit it.
export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
