-- Email offers workflow: batches, parsed replies, and stable line references

alter table public.line_items
  add column if not exists line_ref text;

-- Backfill line_ref to L001-style identifiers per lot
with numbered as (
  select id, lot_id, row_number() over (partition by lot_id order by coalesce(created_at, now()), id) as rn
  from public.line_items
)
update public.line_items
set line_ref = 'L' || lpad(numbered.rn::text, 3, '0')
from numbered
where public.line_items.id = numbered.id and (line_ref is null or trim(line_ref) = '');

alter table public.line_items
  alter column line_ref set not null;

create unique index if not exists line_items_lot_line_ref_uq on public.line_items (lot_id, line_ref);

create table if not exists public.lot_email_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lot_id uuid not null references public.lots(id) on delete cascade,
  batch_key text not null unique,
  subject text not null,
  currency text null,
  created_by uuid null references auth.users(id),
  created_at timestamptz not null default now(),
  status text not null default 'draft'
);

create index if not exists lot_email_batches_tenant_lot_idx on public.lot_email_batches (tenant_id, lot_id);

create table if not exists public.email_offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lot_id uuid not null references public.lots(id) on delete cascade,
  batch_id uuid not null references public.lot_email_batches(id) on delete cascade,
  buyer_email text not null,
  buyer_name text null,
  buyer_id uuid null references public.buyers(id),
  message_id text not null unique,
  received_at timestamptz not null,
  currency text null,
  raw_html text null,
  status text not null default 'parsed'
);

create index if not exists email_offers_tenant_lot_received_idx on public.email_offers (tenant_id, lot_id, received_at);

create table if not exists public.email_offer_lines (
  id uuid primary key default gen_random_uuid(),
  email_offer_id uuid not null references public.email_offers(id) on delete cascade,
  line_ref text not null,
  qty integer null,
  offer_amount numeric null,
  offer_type text not null default 'per_unit',
  parse_notes text null
);

create index if not exists email_offer_lines_offer_idx on public.email_offer_lines (email_offer_id, line_ref);
