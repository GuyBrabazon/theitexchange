-- Part tracking schema for component-level history
-- Uses a unique index on expressions to allow nullable OEM/category with a stable key.

create table if not exists public.parts (
  id uuid default gen_random_uuid() primary key,
  part_number text not null,
  category text default '' not null,
  oem text default '' not null,
  description text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Unique across part_number + oem + category.
alter table public.parts
  add constraint parts_unique_key unique (part_number, oem, category);

create table if not exists public.part_observations (
  id uuid default gen_random_uuid() primary key,
  part_id uuid references public.parts (id) on delete cascade,
  lot_id uuid references public.lots (id) on delete cascade,
  line_item_id uuid references public.line_items (id) on delete cascade,
  offer_id uuid references public.offers (id) on delete set null,
  qty int not null,
  qty_type text not null check (qty_type in ('available', 'sold')),
  source text,
  observed_at timestamptz default now() not null
);

create index if not exists part_observations_part_id_idx on public.part_observations (part_id);
create index if not exists part_observations_lot_offer_idx on public.part_observations (lot_id, offer_id);

create or replace function public.log_part_observation(
  p_part_number text,
  p_category text,
  p_oem text default null,
  p_description text default null,
  p_qty int default 1,
  p_qty_type text default 'available',
  p_lot uuid default null,
  p_line uuid default null,
  p_offer uuid default null,
  p_source text default 'app'
) returns uuid
language plpgsql
as $$
declare
  v_part_id uuid;
begin
  if coalesce(trim(p_part_number), '') = '' then
    return null;
  end if;

  insert into public.parts (part_number, category, oem, description)
  values (p_part_number, p_category, p_oem, p_description)
  on conflict (part_number, oem, category)
  do update set
    description = coalesce(excluded.description, public.parts.description),
    updated_at = now()
  returning id into v_part_id;

  insert into public.part_observations (part_id, lot_id, line_item_id, offer_id, qty, qty_type, source)
  values (v_part_id, p_lot, p_line, p_offer, coalesce(p_qty, 0), p_qty_type, p_source);

  return v_part_id;
end;
$$;
