-- Inventory as source of truth

-- inventory_items: organisation-owned stock
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid references public.sellers(id) on delete set null,
  sku text,
  model text,
  description text,
  oem text,
  condition text,
  location text,
  status text default 'available' check (status in ('available','reserved','auction','allocated','sold','withdrawn','flip')),
  qty_total numeric,
  qty_available numeric,
  cost numeric,
  currency text,
  specs jsonb default '{}'::jsonb,
  received_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists inventory_items_tenant_status_idx on public.inventory_items (tenant_id, status);

-- Movements: audit trail of quantity changes
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  change_type text not null check (change_type in ('add','reserve','allocate','release','sell','adjust')),
  qty_delta numeric not null,
  reason text,
  lot_id uuid references public.lots(id) on delete set null,
  line_item_id uuid references public.line_items(id) on delete set null,
  offer_id uuid references public.offers(id) on delete set null,
  created_at timestamptz default now() not null
);

create index if not exists inventory_movements_item_idx on public.inventory_movements (inventory_item_id, created_at desc);
create index if not exists inventory_movements_tenant_idx on public.inventory_movements (tenant_id, created_at desc);

-- Link line_items to inventory and track line status
alter table public.line_items
  add column if not exists inventory_item_id uuid references public.inventory_items(id) on delete set null;

alter table public.line_items
  add column if not exists line_status text check (line_status in ('draft','quoted','awarded','po_received','fulfilled')) default 'draft';

-- Mark lot source
alter table public.lots
  add column if not exists source text check (source in ('inventory','flip')) default 'inventory';
