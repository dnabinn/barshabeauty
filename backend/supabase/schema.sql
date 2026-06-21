-- Barsha Beauty Salon — Supabase Schema
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query)

-- ── BOOKINGS ──
create table if not exists bookings (
  id               uuid        primary key default gen_random_uuid(),
  ref              text        unique not null,
  service          text        not null,
  duration         integer     not null default 0,
  price            numeric(8,2) not null,
  date             date        not null,
  time             text        not null,
  name             text        not null,
  email            text        not null,
  phone            text        not null,
  notes            text,
  payment_intent_id text,
  pay_method       text        not null default 'card'
                   check (pay_method in ('card', 'mb_way', 'revolut_pay', 'whatsapp', 'cash', 'unknown')),
  status           text        not null default 'confirmed'
                   check (status in ('pending', 'confirmed', 'cancelled')),
  created_at       timestamptz not null default now()
);

-- ── BLOCKED SLOTS ──
-- Populated automatically on each confirmed booking. Single location, so no location column needed.
create table if not exists blocked_slots (
  id         uuid  primary key default gen_random_uuid(),
  date       date  not null,
  time       text  not null,
  unique (date, time)
);

-- ── ROW LEVEL SECURITY ──
-- The backend uses the service_role key which bypasses RLS.
alter table bookings      enable row level security;
alter table blocked_slots enable row level security;

create policy "public can read blocked_slots"
  on blocked_slots for select using (true);

-- ── INDEXES ──
create index if not exists idx_bookings_date on bookings (date);
create index if not exists idx_blocked_date  on blocked_slots (date);
