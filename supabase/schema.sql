-- Schema and seed data for the StayFinder tables in Supabase (Postgres).
-- Run this once in the Supabase dashboard: Project -> SQL Editor -> New query.

create table if not exists properties (
  property_id text primary key,
  title text not null,
  description text not null,
  location text not null,
  price_per_night numeric not null,
  max_guests integer not null
);

create table if not exists bookings (
  booking_id text primary key,
  property_id text not null references properties (property_id),
  guest_name text not null,
  guest_email text not null,
  check_in date not null,
  check_out date not null,
  guests integer not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled'))
);

-- Seed data mirroring src/data/properties.json
insert into properties (property_id, title, description, location, price_per_night, max_guests)
values
  ('property_1001', 'Cozy Studio in Södermalm', 'A bright and cozy studio apartment close to cafés, parks and public transport.', 'Stockholm, Sweden', 850, 2),
  ('property_1002', 'Modern Loft by the Harbor', 'Spacious loft with harbor views, perfect for couples or small families.', 'Gothenburg, Sweden', 1200, 4),
  ('property_1003', 'Countryside Cabin', 'A peaceful wooden cabin surrounded by forest, ideal for a quiet getaway.', 'Dalarna, Sweden', 650, 6),
  ('property_1004', 'City Center Apartment', 'Newly renovated apartment right in the heart of the city, walking distance to everything.', 'Malmö, Sweden', 950, 3)
on conflict (property_id) do nothing;

-- Seed data mirroring src/data/bookings.json
insert into bookings (booking_id, property_id, guest_name, guest_email, check_in, check_out, guests, status)
values
  ('booking_2', 'property_1002', 'Erik Johansson', 'erik.johansson@example.com', '2026-11-12', '2026-11-15', 3, 'pending'),
  ('booking_3', 'property_1003', 'Sara Lindqvist', 'sara.lindqvist@example.com', '2026-12-20', '2026-12-27', 5, 'confirmed'),
  ('booking_4', 'property_1004', 'Oskar Nilsson', 'oskar.nilsson@example.com', '2026-09-30', '2026-10-02', 1, 'cancelled'),
  ('booking_8002', 'property_1001', 'Test Guest', 'test@example.com', '2026-12-01', '2026-12-03', 2, 'pending'),
  ('booking_1489', 'property_1001', 'Test Guest', 'test@example.com', '2026-12-01', '2026-12-03', 2, 'pending'),
  ('booking_6527', 'property_1001', 'Test Guest', 'test@example.com', '2026-12-01', '2026-12-03', 2, 'pending'),
  ('booking_9195', 'property_1002', 'Räkan Johansson', 'erik.johansson@example.com', '2027-11-12', '2027-11-15', 3, 'pending')
on conflict (booking_id) do nothing;
