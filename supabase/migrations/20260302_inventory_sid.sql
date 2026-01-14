-- Add Stock ID (SID) to inventory items for human-friendly referencing
create or replace function public.generate_inventory_sid()
returns text
language plpgsql
as $$
declare
  v_sid text;
begin
  loop
    v_sid := 'SID-' || upper(encode(gen_random_bytes(6), 'hex'));
    exit when not exists (select 1 from public.inventory_items where sid = v_sid);
  end loop;
  return v_sid;
end;
$$;

alter table public.inventory_items
  add column if not exists sid text;

create unique index if not exists inventory_items_sid_idx on public.inventory_items (sid);

alter table public.inventory_items
  alter column sid set default public.generate_inventory_sid();

update public.inventory_items
set sid = public.generate_inventory_sid()
where sid is null;

alter table public.inventory_items
  alter column sid set not null;
