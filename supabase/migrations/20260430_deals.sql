-- Deals workflow foundations: deals, deal_lines, threads, buyer tags, email_offer links

create table if not exists public.deals (
  id uuid not null primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  buyer_id uuid not null references public.buyers(id),
  title text not null,
  status text not null default 'draft' check (status in ('draft','outreach','negotiating','agreed','ordered','fulfilled','closed','lost')),
  deal_type text not null default 'sell' check (deal_type in ('sell','buy','broker')),
  currency text not null default 'USD',
  source text not null default 'mixed' check (source in ('inventory','flip','mixed')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  expected_close_date date,
  stage_notes text
);

create index if not exists deals_tenant_status_idx on public.deals (tenant_id, status);
create index if not exists deals_tenant_buyer_idx on public.deals (tenant_id, buyer_id);
create index if not exists deals_tenant_activity_idx on public.deals (tenant_id, last_activity_at desc);

create table if not exists public.deal_lines (
  id uuid not null primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id),
  inventory_item_id uuid references public.inventory_items(id),
  inventory_unit_id uuid references public.inventory_units(id),
  source text not null check (source in ('inventory','flip')),
  oem text,
  model text,
  description text,
  qty numeric not null default 1,
  ask_price numeric,
  cost_snapshot numeric,
  currency text,
  meta jsonb not null default '{}'::jsonb,
  line_ref text not null,
  status text not null default 'draft' check (status in ('draft','quoted','offered','agreed','ordered','allocated','shipped','delivered','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists deal_lines_deal_ref_uq on public.deal_lines (deal_id, line_ref);
create index if not exists deal_lines_tenant_deal_idx on public.deal_lines (tenant_id, deal_id);
create index if not exists deal_lines_tenant_inventory_idx on public.deal_lines (tenant_id, inventory_item_id);

create table if not exists public.deal_threads (
  id uuid not null primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  deal_id uuid not null references public.deals(id) on delete cascade,
  buyer_email text not null,
  subject_key text not null unique,
  subject_template text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','closed'))
);

alter table public.buyers
  add column if not exists oem_tags text[] not null default '{}'::text[],
  add column if not exists model_tags text[] not null default '{}'::text[];

alter table public.email_offers
  add column if not exists deal_id uuid references public.deals(id),
  add column if not exists deal_thread_id uuid references public.deal_threads(id);

create index if not exists email_offers_deal_idx on public.email_offers (deal_id);
create index if not exists email_offers_deal_thread_idx on public.email_offers (deal_thread_id);
