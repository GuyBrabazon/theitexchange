-- Enable cross-tenant customer lookup with opt-in discovery.

alter table public.tenant_settings
  add column if not exists discoverable boolean default false;

alter table public.buyers
  add column if not exists linked_tenant_id uuid references public.tenants (id) on delete set null,
  add column if not exists accounts_email text;

create index if not exists buyers_linked_tenant_idx on public.buyers (linked_tenant_id);
