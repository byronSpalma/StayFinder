-- Step C: optional image URL for properties. Run once in the Supabase dashboard:
-- Project -> SQL Editor -> New query.
--
-- Adds a nullable image_url column. The check constraint only allows https links
-- (or null), so no other protocols can be stored. Safe to run more than once.

alter table properties add column if not exists image_url text;

alter table properties drop constraint if exists properties_image_url_https;

alter table properties add constraint properties_image_url_https
  check (image_url is null or (image_url ~* '^https://' and char_length(image_url) <= 2048));
