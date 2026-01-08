-- Backfill existing line_items into inventory_items and link them
-- Safe to rerun: checks for existing inventory_item_id

with candidates as (
  select li.id as line_id,
         li.lot_id,
         l.tenant_id,
         li.model,
         coalesce(li.description, li.model) as description,
         (li.specs->>'oem')::text as oem,
         li.qty as qty_total,
         li.qty as qty_available,
         li.cost,
         l.currency,
         li.specs
    from public.line_items li
    join public.lots l on l.id = li.lot_id
   where li.inventory_item_id is null
)
, inserted as (
  insert into public.inventory_items (tenant_id, model, description, oem, qty_total, qty_available, cost, currency, specs)
  select tenant_id, model, description, oem, qty_total, qty_available, cost, currency, coalesce(specs, '{}'::jsonb)
    from candidates
  returning id, tenant_id, model, description, oem, qty_total, qty_available, cost, currency
)
update public.line_items li
set inventory_item_id = ins.id
from candidates c
join inserted ins on ins.model is not distinct from c.model and ins.description is not distinct from c.description and ins.tenant_id = c.tenant_id
where li.id = c.line_id
  and li.inventory_item_id is null;
