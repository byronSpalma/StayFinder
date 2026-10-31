-- Step B3: Row Level Security. Run once in the Supabase dashboard:
-- Project -> SQL Editor -> New query.
--
-- Requires step-b-ownership.sql to have been run first (owner_id / user_id must exist).
-- Safe to run more than once.
--
-- The API forwards each user's JWT to the database, so inside Postgres:
--   auth.uid()  = the logged-in user's id (null for anonymous requests)
--   role        = "authenticated" for logged-in users, "anon" for everyone else
-- A policy only allows a row if its condition is true; with RLS on and no matching
-- policy, access is denied. Rows with owner_id / user_id = null match no ownership
-- policy, so logged-in users cannot change or see those old rows (properties stay
-- readable by everyone).

-- 1. Remove any old policies on the two tables (whatever they are called).
do $$
declare
  p record;
begin
  for p in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public' and tablename in ('properties', 'bookings')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- 2. Turn RLS on.
alter table public.properties enable row level security;
alter table public.bookings enable row level security;

-- 3. Table privileges. RLS decides which rows; these decide which operations are possible at all.
-- anon may only read properties and gets nothing on bookings.
revoke all on public.properties from anon;
revoke all on public.bookings from anon;
grant select on public.properties to anon;
grant select, insert, update, delete on public.properties to authenticated;
grant select, insert, update, delete on public.bookings to authenticated;

-- 4. properties: everyone can read, only the owner can write.
create policy "properties are readable by everyone"
  on public.properties for select
  to anon, authenticated
  using (true);

create policy "users can create their own properties"
  on public.properties for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "owners can update their properties"
  on public.properties for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "owners can delete their properties"
  on public.properties for delete
  to authenticated
  using (owner_id = auth.uid());

-- 5. bookings: logged-in users can only see and change their own bookings.
create policy "users can read their own bookings"
  on public.bookings for select
  to authenticated
  using (user_id = auth.uid());

create policy "users can create their own bookings"
  on public.bookings for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users can update their own bookings"
  on public.bookings for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users can delete their own bookings"
  on public.bookings for delete
  to authenticated
  using (user_id = auth.uid());

-- To undo (kept as a comment, not run):
-- alter table public.properties disable row level security;
-- alter table public.bookings disable row level security;
