-- Define roles and extend tenant settings with feature flags

-- Normalize roles on profiles
alter table public.profiles
  add column if not exists role text;

alter table public.profiles
  alter column role set default 'broker';

alter table public.profiles
  add constraint profiles_role_chk check (role in ('admin','broker','ops','finance','readonly'));

-- Tenant-level feature flags and policies
alter table public.tenant_settings
  add column if not exists margins_visible_to_brokers boolean default true,
  add column if not exists ops_can_edit_costs boolean default false,
  add column if not exists require_finance_approval_for_award boolean default false,
  add column if not exists work_email_domain text;

-- Seed settings rows for any tenants missing (safe to run)
insert into public.tenant_settings (tenant_id, default_currency)
select t.id, coalesce(ts.default_currency, 'USD')
from public.tenants t
left join public.tenant_settings ts on ts.tenant_id = t.id
where ts.tenant_id is null;
