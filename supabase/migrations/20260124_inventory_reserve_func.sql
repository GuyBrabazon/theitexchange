-- Reserve inventory item and log movement
create or replace function public.reserve_inventory_item(
  p_item uuid,
  p_qty numeric,
  p_tenant uuid,
  p_reason text default 'lot reserve',
  p_lot uuid default null,
  p_line uuid default null
) returns public.inventory_items
language plpgsql
as $$
declare
  rec public.inventory_items;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'qty must be > 0';
  end if;

  update public.inventory_items
     set qty_available = qty_available - p_qty,
         updated_at = now()
   where id = p_item
     and tenant_id = p_tenant
     and qty_available >= p_qty
   returning * into rec;

  if not found then
    raise exception 'insufficient_qty';
  end if;

  insert into public.inventory_movements (inventory_item_id, tenant_id, change_type, qty_delta, reason, lot_id, line_item_id)
  values (p_item, p_tenant, 'reserve', -p_qty, p_reason, p_lot, p_line);

  return rec;
end;
$$;
