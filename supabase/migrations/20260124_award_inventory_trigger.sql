-- Adjust inventory on award insert
create or replace function public.awarded_lines_inventory_adjust()
returns trigger
language plpgsql
as $$
declare
  v_inv_id uuid;
  v_qty numeric;
  v_tenant uuid;
  v_inv inventory_items;
begin
  -- find inventory link
  select inventory_item_id, qty into v_inv_id, v_qty from public.line_items where id = new.line_item_id;
  if v_inv_id is null then
    return new;
  end if;
  if v_qty is null or v_qty <= 0 then
    v_qty := coalesce(new.qty, 0);
  end if;
  v_qty := coalesce(new.qty, v_qty, 0);
  if v_qty <= 0 then
    return new;
  end if;

  select tenant_id into v_tenant from public.lots where id = new.lot_id;

  update public.inventory_items
     set qty_available = qty_available - v_qty,
         updated_at = now()
   where id = v_inv_id
     and (v_tenant is null or tenant_id = v_tenant)
     and qty_available >= v_qty
   returning * into v_inv;

  if not found then
    raise exception 'insufficient_inventory' using detail = 'Not enough available inventory for awarded line';
  end if;

  insert into public.inventory_movements (inventory_item_id, tenant_id, change_type, qty_delta, reason, lot_id, line_item_id, offer_id)
  values (v_inv_id, coalesce(v_tenant, v_inv.tenant_id), 'sell', -v_qty, 'awarded line', new.lot_id, new.line_item_id, new.offer_id);

  -- mark line status
  update public.line_items set line_status = 'awarded' where id = new.line_item_id;

  return new;
end;
$$;

 drop trigger if exists trg_awarded_lines_inventory on public.awarded_lines;
 create trigger trg_awarded_lines_inventory
 after insert on public.awarded_lines
 for each row
 execute function public.awarded_lines_inventory_adjust();
