
-- The user who created the property. If that user is deleted, their properties are deleted too.
alter table properties
  add column if not exists owner_id uuid references auth.users (id) on delete cascade;

-- The user the booking belongs to. If that user is deleted, their bookings are deleted too.
alter table bookings
  add column if not exists user_id uuid references auth.users (id) on delete cascade;
