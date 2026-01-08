-- RFQ tables to support cross-tenant requests
create table if not exists public.rfqs (
  id uuid primary key default gen_random_uuid(),
  buyer_tenant_id uuid not null references public.tenants (id) on delete cascade,
  supplier_tenant_id uuid not null references public.tenants (id) on delete cascade,
  status text not null default 'new' check (status in ('new','sent','quoted','closed','cancelled')),
  subject text,
  note text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists rfqs_buyer_idx on public.rfqs (buyer_tenant_id, created_at desc);
create index if not exists rfqs_supplier_idx on public.rfqs (supplier_tenant_id, created_at desc);

create table if not exists public.rfq_lines (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references public.rfqs (id) on delete cascade,
  inventory_item_id uuid references public.inventory_items (id) on delete set null,
  qty_requested numeric,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists rfq_lines_rfq_idx on public.rfq_lines (rfq_id);
