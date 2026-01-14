-- Per-unit inventory SIDs for batch items

create or replace function public.generate_inventory_unit_sid()
returns text
language plpgsql
as $$
declare
  v_sid text;
begin
  loop
    v_sid := 'SID-' || upper(encode(gen_random_bytes(6), 'hex'));
    exit when not exists (select 1 from public.inventory_units where unit_sid = v_sid);
  end loop;
  return v_sid;
end;
$$;

create table if not exists public.inventory_units (
  id uuid default gen_random_uuid() primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  unit_sid text not null default public.generate_inventory_unit_sid(),
  status text not null default 'available' check (status in ('available','reserved','auction','allocated','sold','withdrawn','flip')),
  created_at timestamptz default now() not null
);

create unique index if not exists inventory_units_sid_idx on public.inventory_units (unit_sid);
create index if not exists inventory_units_item_idx on public.inventory_units (inventory_item_id);
create index if not exists inventory_units_tenant_idx on public.inventory_units (tenant_id);

create or replace function public.inventory_units_sync()
returns trigger
language plpgsql
as $$
declare
  v_target int;
  v_existing int;
  v_to_create int;
begin
  v_target := coalesce(new.qty_available, 0);
  if v_target <= 0 then
    return new;
  end if;

  select count(*) into v_existing
  from public.inventory_units
  where inventory_item_id = new.id;

  v_to_create := v_target - v_existing;
  if v_to_create > 0 then
    insert into public.inventory_units (inventory_item_id, tenant_id, status)
    select new.id, new.tenant_id, 'available'
    from generate_series(1, v_to_create);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_inventory_units_sync on public.inventory_items;
create trigger trg_inventory_units_sync
after insert or update of qty_available on public.inventory_items
for each row
execute function public.inventory_units_sync();

with counts as (
  select
    ii.id,
    ii.tenant_id,
    coalesce(ii.qty_available, 0) as qty,
    coalesce(u.cnt, 0) as cnt
  from public.inventory_items ii
  left join (
    select inventory_item_id, count(*) as cnt
    from public.inventory_units
    group by inventory_item_id
  ) u on u.inventory_item_id = ii.id
  where coalesce(ii.qty_available, 0) > coalesce(u.cnt, 0)
)
insert into public.inventory_units (inventory_item_id, tenant_id, status)
select c.id, c.tenant_id, 'available'
from counts c
cross join generate_series(1, c.qty - c.cnt);
