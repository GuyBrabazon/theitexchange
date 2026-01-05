-- Aggregated view for parts with availability/sold stats

create or replace view public.part_rollup as
select
  p.id,
  p.part_number,
  p.category,
  p.oem,
  p.description,
  coalesce(sum(case when o.qty_type = 'available' then o.qty end), 0)::int as total_available,
  coalesce(sum(case when o.qty_type = 'sold' then o.qty end), 0)::int as total_sold,
  max(o.observed_at) filter (where o.qty_type = 'available') as last_available,
  max(o.observed_at) filter (where o.qty_type = 'sold') as last_sold,
  max(o.observed_at) as last_observed,
  count(distinct o.lot_id) as lots_seen,
  count(distinct o.offer_id) filter (where o.offer_id is not null) as offers_count
from public.parts p
left join public.part_observations o on o.part_id = p.id
group by p.id;

