-- Tenant settings table for org-level preferences
create table if not exists public.tenant_settings (
  tenant_id uuid primary key references public.tenants (id) on delete cascade,
  default_currency text default 'USD',
  prefs jsonb default '{}'::jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- If existing tenants lack a settings row, seed one with defaults
insert into public.tenant_settings (tenant_id, default_currency)
select t.id, 'USD'
from public.tenants t
left join public.tenant_settings ts on ts.tenant_id = t.id
where ts.tenant_id is null;
