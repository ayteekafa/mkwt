-- MKWT Time Trial schema
-- Applied remotely via Supabase on 2026-04-25.
-- Kept in-repo so the database shape stays documented with the app code.

create table if not exists public.time_trial_characters (
  name text primary key,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.time_trial_karts (
  name text primary key,
  vehicle_type text not null check (vehicle_type in ('Kart', 'Bike', 'Trike', 'Mobile')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.time_trial_world_records (
  track_name text not null references public.tracks(name) on update cascade on delete restrict,
  category text not null check (category in ('shroom', 'shroomless')),
  wr_time_text text not null,
  wr_time_ms integer not null check (wr_time_ms > 0),
  holder_name text not null,
  character_name text,
  kart_name text,
  source_site text not null default 'mkwrs',
  source_url text not null,
  last_recorded_at date,
  fetched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (track_name, category)
);

create table if not exists public.time_trial_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  track_name text not null references public.tracks(name) on update cascade on delete restrict,
  category text not null check (category in ('shroom', 'shroomless')),
  time_text text not null,
  time_ms integer not null check (time_ms > 0),
  character_name text not null references public.time_trial_characters(name) on update cascade on delete restrict,
  kart_name text not null references public.time_trial_karts(name) on update cascade on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, track_name, category)
);

alter table public.time_trial_characters enable row level security;
alter table public.time_trial_karts enable row level security;
alter table public.time_trial_world_records enable row level security;
alter table public.time_trial_entries enable row level security;

drop policy if exists "time_trial_characters_public_read" on public.time_trial_characters;
create policy "time_trial_characters_public_read"
on public.time_trial_characters
for select
to anon, authenticated
using (true);

drop policy if exists "time_trial_karts_public_read" on public.time_trial_karts;
create policy "time_trial_karts_public_read"
on public.time_trial_karts
for select
to anon, authenticated
using (true);

drop policy if exists "time_trial_world_records_public_read" on public.time_trial_world_records;
create policy "time_trial_world_records_public_read"
on public.time_trial_world_records
for select
to anon, authenticated
using (true);

drop policy if exists "time_trial_entries_select_own" on public.time_trial_entries;
create policy "time_trial_entries_select_own"
on public.time_trial_entries
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "time_trial_entries_insert_own" on public.time_trial_entries;
create policy "time_trial_entries_insert_own"
on public.time_trial_entries
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "time_trial_entries_update_own" on public.time_trial_entries;
create policy "time_trial_entries_update_own"
on public.time_trial_entries
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "time_trial_entries_delete_own" on public.time_trial_entries;
create policy "time_trial_entries_delete_own"
on public.time_trial_entries
for delete
to authenticated
using (auth.uid() = user_id);

insert into public.time_trial_characters (name, sort_order, source)
values
  ('Baby Peach', 1, 'seed'),
  ('Baby Daisy', 2, 'seed'),
  ('Para-Biddybud', 3, 'seed'),
  ('Swoop', 4, 'seed'),
  ('Baby Mario', 5, 'seed'),
  ('Goomba', 6, 'seed'),
  ('Spike', 7, 'seed'),
  ('Baby Luigi', 8, 'seed'),
  ('Dry Bones', 9, 'seed'),
  ('Peepa', 10, 'seed'),
  ('Baby Rosalina', 11, 'seed'),
  ('Sidestepper', 12, 'seed'),
  ('Fish Bone', 13, 'seed'),
  ('Toadette', 14, 'seed'),
  ('Nabbit', 15, 'seed'),
  ('Toad', 16, 'seed'),
  ('Shy Guy', 17, 'seed'),
  ('Stingby', 18, 'seed'),
  ('Koopa Troopa', 19, 'seed'),
  ('Lakitu', 20, 'seed'),
  ('Cheep Cheep', 21, 'seed'),
  ('Peach', 22, 'seed'),
  ('Daisy', 23, 'seed'),
  ('Coin Coffer', 24, 'seed'),
  ('Yoshi', 25, 'seed'),
  ('Monty Mole', 26, 'seed'),
  ('Bowser Jr.', 27, 'seed'),
  ('Dolphin', 28, 'seed'),
  ('Mario', 29, 'seed'),
  ('Rocky Wrench', 30, 'seed'),
  ('Luigi', 31, 'seed'),
  ('Hammer Bro', 32, 'seed'),
  ('Pokey', 33, 'seed'),
  ('Birdo', 34, 'seed'),
  ('Penguin', 35, 'seed'),
  ('Pauline', 36, 'seed'),
  ('Piranha Plant', 37, 'seed'),
  ('Snowman', 38, 'seed'),
  ('King Boo', 39, 'seed'),
  ('Conkdor', 40, 'seed'),
  ('Rosalina', 41, 'seed'),
  ('Cataquack', 42, 'seed'),
  ('Wario', 43, 'seed'),
  ('Wiggler', 44, 'seed'),
  ('Donkey Kong', 45, 'seed'),
  ('Cow', 46, 'seed'),
  ('Chargin'' Chuck', 47, 'seed'),
  ('Waluigi', 48, 'seed'),
  ('Pianta', 49, 'seed'),
  ('Bowser', 50, 'seed')
on conflict (name) do update
set sort_order = excluded.sort_order,
    source = excluded.source,
    updated_at = now();

insert into public.time_trial_karts (name, vehicle_type, sort_order, source)
values
  ('Standard Bike', 'Bike', 1, 'seed'),
  ('Cute Scoot', 'Bike', 2, 'seed'),
  ('Tune Thumper', 'Bike', 3, 'seed'),
  ('Rally Bike', 'Bike', 4, 'seed'),
  ('Hyper Pipe', 'Bike', 5, 'seed'),
  ('Fin Twin', 'Bike', 6, 'seed'),
  ('Dolphin Dasher', 'Bike', 7, 'seed'),
  ('Pipe Frame', 'Kart', 8, 'seed'),
  ('Mach Rocket', 'Bike', 9, 'seed'),
  ('R.O.B. H.O.G.', 'Bike', 10, 'seed'),
  ('Biddybuggy', 'Kart', 11, 'seed'),
  ('Baby Blooper', 'Kart', 12, 'seed'),
  ('Loco Moto', 'Bike', 13, 'seed'),
  ('Blastronaut III', 'Trike', 14, 'seed'),
  ('Standard Kart', 'Kart', 15, 'seed'),
  ('Plushbuggy', 'Kart', 16, 'seed'),
  ('Funky Dorrie', 'Trike', 17, 'seed'),
  ('Hot Rod', 'Kart', 18, 'seed'),
  ('Roadster Royale', 'Kart', 19, 'seed'),
  ('B Dasher', 'Kart', 20, 'seed'),
  ('Bumble V', 'Kart', 21, 'seed'),
  ('Rally Kart', 'Kart', 22, 'seed'),
  ('Zoom Buggy', 'Kart', 23, 'seed'),
  ('Ribbit Revster', 'Kart', 24, 'seed'),
  ('Carpet Flyer', 'Kart', 25, 'seed'),
  ('Cloud 9', 'Kart', 26, 'seed'),
  ('Dread Sled', 'Mobile', 27, 'seed'),
  ('W-Twin Chopper', 'Bike', 28, 'seed'),
  ('Junkyard Hog', 'Trike', 29, 'seed'),
  ('Rallygator', 'Trike', 30, 'seed'),
  ('Reel Racer', 'Kart', 31, 'seed'),
  ('Big Horn', 'Kart', 32, 'seed'),
  ('Billdozer', 'Kart', 33, 'seed'),
  ('Lobster Roller', 'Trike', 34, 'seed'),
  ('Chargin'' Truck', 'Kart', 35, 'seed'),
  ('Tiny Titan', 'Kart', 36, 'seed'),
  ('Li''l Dumpy', 'Kart', 37, 'seed'),
  ('Bowser Bruiser', 'Kart', 38, 'seed'),
  ('Mecha Trike', 'Trike', 39, 'seed'),
  ('Stellar Sled', 'Mobile', 40, 'seed')
on conflict (name) do update
set vehicle_type = excluded.vehicle_type,
    sort_order = excluded.sort_order,
    source = excluded.source,
    updated_at = now();

create or replace function public.refresh_time_trial_world_records(p_records jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  rec jsonb;
  v_track text;
  v_category text;
  v_time_text text;
  v_time_ms integer;
  v_holder text;
  v_character text;
  v_kart text;
  v_source_url text;
  v_last_recorded_at date;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if coalesce(jsonb_typeof(p_records), '') <> 'array' then
    raise exception 'Expected an array payload';
  end if;

  for rec in select value from jsonb_array_elements(p_records)
  loop
    v_track := btrim(coalesce(rec->>'track_name', ''));
    v_category := lower(btrim(coalesce(rec->>'category', '')));
    v_time_text := btrim(coalesce(rec->>'wr_time_text', ''));
    v_time_ms := nullif(rec->>'wr_time_ms', '')::integer;
    v_holder := btrim(coalesce(rec->>'holder_name', ''));
    v_character := nullif(btrim(coalesce(rec->>'character_name', '')), '');
    v_kart := nullif(btrim(coalesce(rec->>'kart_name', '')), '');
    v_source_url := btrim(coalesce(rec->>'source_url', ''));
    v_last_recorded_at := case
      when coalesce(rec->>'last_recorded_at', '') ~ '^\d{4}-\d{2}-\d{2}$' then (rec->>'last_recorded_at')::date
      else null
    end;

    if v_track = '' then
      raise exception 'World record payload missing track_name';
    end if;

    insert into public.tracks(name)
    values (v_track)
    on conflict (name) do nothing;

    if v_category not in ('shroom', 'shroomless') then
      raise exception 'Invalid category in world record payload: %', v_category;
    end if;
    if v_time_text = '' or v_time_ms is null or v_time_ms <= 0 then
      raise exception 'Invalid time in world record payload for % / %', v_track, v_category;
    end if;
    if v_holder = '' then
      raise exception 'World record payload missing holder_name for % / %', v_track, v_category;
    end if;
    if v_source_url = '' then
      raise exception 'World record payload missing source_url for % / %', v_track, v_category;
    end if;

    insert into public.time_trial_world_records (
      track_name,
      category,
      wr_time_text,
      wr_time_ms,
      holder_name,
      character_name,
      kart_name,
      source_url,
      source_site,
      last_recorded_at,
      fetched_at,
      updated_at
    ) values (
      v_track,
      v_category,
      v_time_text,
      v_time_ms,
      v_holder,
      v_character,
      v_kart,
      v_source_url,
      'mkwrs',
      v_last_recorded_at,
      now(),
      now()
    )
    on conflict (track_name, category) do update
    set wr_time_text = excluded.wr_time_text,
        wr_time_ms = excluded.wr_time_ms,
        holder_name = excluded.holder_name,
        character_name = excluded.character_name,
        kart_name = excluded.kart_name,
        source_url = excluded.source_url,
        source_site = excluded.source_site,
        last_recorded_at = excluded.last_recorded_at,
        fetched_at = excluded.fetched_at,
        updated_at = now();

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.refresh_time_trial_world_records(jsonb) to authenticated;
