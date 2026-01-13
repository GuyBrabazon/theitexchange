-- Add created_by for per-user scoping on reports

alter table public.lots
  add column if not exists created_by uuid references auth.users (id) on delete set null;

alter table public.offers
  add column if not exists created_by uuid references auth.users (id) on delete set null;

alter table public.awarded_lines
  add column if not exists created_by uuid references auth.users (id) on delete set null;

alter table public.purchase_orders
  add column if not exists created_by uuid references auth.users (id) on delete set null;

alter table public.inventory_items
  add column if not exists created_by uuid references auth.users (id) on delete set null;

-- Optional supporting indexes for filters
create index if not exists lots_created_by_idx on public.lots (created_by);
create index if not exists offers_created_by_idx on public.offers (created_by);
create index if not exists awarded_lines_created_by_idx on public.awarded_lines (created_by);
create index if not exists po_created_by_idx on public.purchase_orders (created_by);
create index if not exists inventory_items_created_by_idx on public.inventory_items (created_by);

-- Seed blanks to avoid null surprises (leave null if unknown)
update public.lots set created_by = created_by where true;
update public.offers set created_by = created_by where true;
update public.awarded_lines set created_by = created_by where true;
update public.purchase_orders set created_by = created_by where true;
update public.inventory_items set created_by = created_by where true;
