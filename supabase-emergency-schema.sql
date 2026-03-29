-- Emergency dispatch support tables for Feedo
-- Run in Supabase SQL editor.

create table if not exists public.responder_presence (
  user_id text primary key,
  role text not null check (role in ('volunteer', 'receiver', 'ngo', 'recipient')),
  display_name text,
  lat double precision not null,
  lng double precision not null,
  capacity integer,
  required_meals integer,
  accepted_food_categories text[],
  nutrition_preferences text[],
  wanted_items text[],
  max_travel_minutes integer,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.responder_presence
  add column if not exists capacity integer;

alter table public.responder_presence
  add column if not exists required_meals integer;

alter table public.responder_presence
  add column if not exists accepted_food_categories text[];

alter table public.responder_presence
  add column if not exists nutrition_preferences text[];

alter table public.responder_presence
  add column if not exists wanted_items text[];

alter table public.responder_presence
  add column if not exists max_travel_minutes integer;

create index if not exists responder_presence_role_active_idx
  on public.responder_presence (role, active);

create table if not exists public.push_tokens (
  user_id text not null,
  token text primary key,
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx
  on public.push_tokens (user_id);

create table if not exists public.emergency_donations (
  id text primary key,
  listing_id text not null,
  supplier_user_id text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  safe_window_minutes integer not null,
  priority_state text not null,
  expected_response_minutes integer,
  status text not null,
  assigned_volunteer_id text,
  assigned_receiver_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists emergency_donations_status_expires_idx
  on public.emergency_donations (status, expires_at);

create table if not exists public.notification_outbox (
  id bigserial primary key,
  token text not null,
  title text not null,
  body text not null,
  data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists notification_outbox_created_idx
  on public.notification_outbox (created_at desc);

create table if not exists public.donation_event (
  id text primary key,
  supplier_user_id text not null,
  supplier_name text not null,
  event_name text not null,
  total_quantity integer not null,
  item_count integer not null,
  pickup_address text,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  safe_window_minutes integer not null,
  allocation_strategy text not null,
  allocation_summary text,
  status text not null,
  assigned_volunteer_id text,
  expected_response_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists donation_event_supplier_idx
  on public.donation_event (supplier_user_id, created_at desc);

create table if not exists public.donation_item (
  id text primary key,
  donation_event_id text not null references public.donation_event(id) on delete cascade,
  listing_id text,
  food_name text not null,
  food_category text not null,
  quantity integer not null,
  cooked_at timestamptz not null,
  packaging_condition text not null,
  storage_condition text not null,
  spoilage_score double precision not null,
  spoilage_label text not null,
  recommended_pickup_window_minutes integer not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists donation_item_event_idx
  on public.donation_item (donation_event_id);

create table if not exists public.donation_event_allocation (
  id text primary key,
  donation_event_id text not null references public.donation_event(id) on delete cascade,
  receiver_id text not null,
  receiver_name text not null,
  allocated_quantity integer not null,
  eta_minutes integer not null,
  allocation_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists donation_event_allocation_event_idx
  on public.donation_event_allocation (donation_event_id);

create table if not exists public.supplier_proof (
  id text primary key,
  supplier_user_id text not null,
  listing_id text,
  bucket text not null,
  file_path text not null,
  public_url text,
  mime_type text,
  size_bytes integer not null,
  created_at timestamptz not null default now()
);

create index if not exists supplier_proof_supplier_idx
  on public.supplier_proof (supplier_user_id, created_at desc);

create table if not exists public.receiver_need_request (
  id text primary key,
  receiver_user_id text not null,
  receiver_name text not null,
  need_title text not null,
  required_meals integer not null,
  food_preference text not null,
  meal_slot text not null,
  window_start_at timestamptz not null,
  window_end_at timestamptz not null,
  urgency_level text not null,
  note text,
  location_lat double precision not null,
  location_lng double precision not null,
  location_address text,
  radius_km double precision not null default 10,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists receiver_need_request_receiver_idx
  on public.receiver_need_request (receiver_user_id, created_at desc);

create index if not exists receiver_need_request_window_idx
  on public.receiver_need_request (status, window_start_at, window_end_at);

create table if not exists public.supplier_need_prompt (
  id text primary key,
  need_request_id text not null references public.receiver_need_request(id) on delete cascade,
  supplier_user_id text not null,
  supplier_name text,
  prompt_score integer not null,
  distance_km double precision,
  recent_listing_count integer,
  avg_quantity integer,
  prompt_status text not null default 'sent',
  sent_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists supplier_need_prompt_supplier_idx
  on public.supplier_need_prompt (supplier_user_id, sent_at desc);

create index if not exists supplier_need_prompt_need_idx
  on public.supplier_need_prompt (need_request_id, sent_at desc);

-- Mirror table used by API upserts. Create if missing so migration is idempotent.
create table if not exists public.food_listing (
  id text primary key,
  supplier_user_id text not null,
  bulk_event_id text,
  supplier_name text not null,
  food_name text not null,
  quantity integer not null,
  food_category text not null,
  cooked_at timestamptz not null,
  packaging_condition text not null,
  storage_condition text not null,
  pickup_address text,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  delivery_lat double precision,
  delivery_lng double precision,
  price integer not null,
  route_duration_minutes integer not null,
  route_distance_km double precision not null,
  weather_temp_c double precision not null,
  weather_humidity_pct integer not null,
  spoilage_score double precision not null,
  spoilage_label text not null,
  recommended_pickup_window_minutes integer not null,
  is_emergency boolean not null default false,
  priority_level text not null default 'normal',
  priority_state text not null default 'passive',
  expected_response_minutes integer,
  assigned_volunteer_id text,
  assigned_receiver_id text,
  emergency_activated_at timestamptz,
  emergency_expires_at timestamptz,
  last_dispatch_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_risk_calculated_at timestamptz not null default now()
);

create index if not exists food_listing_supplier_status_idx
  on public.food_listing (supplier_user_id, status, created_at desc);

-- Optional: ensure required columns exist on mirrored food_listing table.
alter table public.food_listing
  add column if not exists bulk_event_id text;
