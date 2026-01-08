-- Quotes and Sales Orders schema

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  buyer_id uuid not null references public.buyers (id) on delete cascade,
  status text not null default 'sent' check (status in ('draft','sent','accepted','rejected','ordered')),
  subject text,
  note text,
  sent_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quotes_tenant_idx on public.quotes (tenant_id, created_at desc);

create table if not exists public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  inventory_item_id uuid references public.inventory_items (id) on delete set null,
  description text,
  model text,
  oem text,
  qty numeric not null,
  price numeric,
  currency text,
  cost_snapshot numeric,
  created_at timestamptz not null default now()
);

create index if not exists quote_lines_quote_idx on public.quote_lines (quote_id);

-- Sales Orders (placeholder for conversions)
create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  buyer_id uuid not null references public.buyers (id) on delete cascade,
  quote_id uuid references public.quotes (id) on delete set null,
  status text not null default 'draft' check (status in ('draft','pending','confirmed','cancelled')),
  currency text,
  total numeric,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_orders_tenant_idx on public.sales_orders (tenant_id, created_at desc);

create table if not exists public.sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references public.sales_orders (id) on delete cascade,
  quote_line_id uuid references public.quote_lines (id) on delete set null,
  inventory_item_id uuid references public.inventory_items (id) on delete set null,
  description text,
  model text,
  oem text,
  qty numeric not null,
  price numeric,
  currency text,
  created_at timestamptz not null default now()
);

create index if not exists sales_order_lines_so_idx on public.sales_order_lines (sales_order_id);
