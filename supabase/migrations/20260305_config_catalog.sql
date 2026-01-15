-- Catalog tables for configurations + compatibility

create table if not exists public.system_models (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  machine_type text not null check (machine_type in ('server','storage','network')),
  manufacturer text not null,
  family text,
  model text not null,
  form_factor text,
  tags text[] default '{}'::text[],
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now() not null
);

create index if not exists system_models_lookup_idx on public.system_models (machine_type, manufacturer, family, model);
create index if not exists system_models_tenant_idx on public.system_models (tenant_id);

create table if not exists public.component_models (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants (id) on delete cascade,
  component_type text not null
    check (component_type in ('cpu','memory','drive','gpu','nic','controller','transceiver','module','power','cable','other')),
  manufacturer text,
  model text not null,
  part_number text,
  tags text[] default '{}'::text[],
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now() not null
);

create index if not exists component_models_lookup_idx on public.component_models (component_type, manufacturer, model);
create index if not exists component_models_tenant_idx on public.component_models (tenant_id);
create index if not exists component_models_tags_idx on public.component_models using gin (tags);

create table if not exists public.compat_rules_global_models (
  id uuid primary key default gen_random_uuid(),
  system_model_id uuid not null references public.system_models (id) on delete cascade,
  component_model_id uuid references public.component_models (id) on delete cascade,
  component_tag text,
  note text,
  created_at timestamptz default now() not null,
  constraint compat_rules_global_models_one_target check (component_model_id is not null or component_tag is not null)
);

create index if not exists compat_rules_global_models_system_idx on public.compat_rules_global_models (system_model_id);
create index if not exists compat_rules_global_models_component_idx on public.compat_rules_global_models (component_model_id);
create index if not exists compat_rules_global_models_tag_idx on public.compat_rules_global_models (component_tag);

create table if not exists public.compat_rules_tenant_models (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  system_model_id uuid not null references public.system_models (id) on delete cascade,
  component_model_id uuid references public.component_models (id) on delete cascade,
  component_tag text,
  note text,
  created_at timestamptz default now() not null,
  constraint compat_rules_tenant_models_one_target check (component_model_id is not null or component_tag is not null)
);

create index if not exists compat_rules_tenant_models_tenant_idx on public.compat_rules_tenant_models (tenant_id);
create index if not exists compat_rules_tenant_models_system_idx on public.compat_rules_tenant_models (system_model_id);
create index if not exists compat_rules_tenant_models_component_idx on public.compat_rules_tenant_models (component_model_id);
create index if not exists compat_rules_tenant_models_tag_idx on public.compat_rules_tenant_models (component_tag);

create or replace view public.compat_rules_union_models as
select
  'global'::text as scope,
  null::uuid as tenant_id,
  id,
  system_model_id,
  component_model_id,
  component_tag,
  note,
  created_at
from public.compat_rules_global_models
union all
select
  'tenant'::text as scope,
  tenant_id,
  id,
  system_model_id,
  component_model_id,
  component_tag,
  note,
  created_at
from public.compat_rules_tenant_models;

create or replace function public.get_compatible_components(
  p_system_model_id uuid,
  p_tenant_id uuid default null
)
returns setof public.component_models
language sql
stable
as $$
  with rules as (
    select system_model_id, component_model_id, component_tag
    from public.compat_rules_global_models
    where system_model_id = p_system_model_id
    union all
    select system_model_id, component_model_id, component_tag
    from public.compat_rules_tenant_models
    where system_model_id = p_system_model_id
      and (p_tenant_id is null or tenant_id = p_tenant_id)
  ),
  explicit as (
    select cm.*
    from rules r
    join public.component_models cm on cm.id = r.component_model_id
  ),
  tagged as (
    select cm.*
    from rules r
    join public.component_models cm
      on r.component_tag is not null
     and cm.tags @> array[r.component_tag]
  )
  select distinct * from explicit
  union
  select distinct * from tagged;
$$;

alter table public.system_models enable row level security;
alter table public.component_models enable row level security;
alter table public.compat_rules_global_models enable row level security;
alter table public.compat_rules_tenant_models enable row level security;

drop policy if exists system_models_read on public.system_models;
create policy system_models_read
on public.system_models for select
using (true);

drop policy if exists system_models_tenant_write on public.system_models;
create policy system_models_tenant_write
on public.system_models for insert
with check (
  tenant_id is not null
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = tenant_id
  )
);

drop policy if exists system_models_tenant_update on public.system_models;
create policy system_models_tenant_update
on public.system_models for update
using (
  tenant_id is not null
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = tenant_id
  )
);

drop policy if exists system_models_tenant_delete on public.system_models;
create policy system_models_tenant_delete
on public.system_models for delete
using (
  tenant_id is not null
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = tenant_id
  )
);

drop policy if exists system_models_global_write on public.system_models;
create policy system_models_global_write
on public.system_models for insert
with check (
  tenant_id is null
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists system_models_global_update on public.system_models;
create policy system_models_global_update
on public.system_models for update
using (
  tenant_id is null
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists system_models_global_delete on public.system_models;
create policy system_models_global_delete
on public.system_models for delete
using (
  tenant_id is null
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists component_models_read on public.component_models;
create policy component_models_read
on public.component_models for select
using (true);

drop policy if exists component_models_tenant_write on public.component_models;
create policy component_models_tenant_write
on public.component_models for insert
with check (
  tenant_id is not null
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = tenant_id
  )
);

drop policy if exists component_models_tenant_update on public.component_models;
create policy component_models_tenant_update
on public.component_models for update
using (
  tenant_id is not null
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = tenant_id
  )
);

drop policy if exists component_models_tenant_delete on public.component_models;
create policy component_models_tenant_delete
on public.component_models for delete
using (
  tenant_id is not null
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = tenant_id
  )
);

drop policy if exists component_models_global_write on public.component_models;
create policy component_models_global_write
on public.component_models for insert
with check (
  tenant_id is null
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists component_models_global_update on public.component_models;
create policy component_models_global_update
on public.component_models for update
using (
  tenant_id is null
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists component_models_global_delete on public.component_models;
create policy component_models_global_delete
on public.component_models for delete
using (
  tenant_id is null
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists compat_rules_global_models_read on public.compat_rules_global_models;
create policy compat_rules_global_models_read
on public.compat_rules_global_models for select
using (true);

drop policy if exists compat_rules_global_models_write on public.compat_rules_global_models;
create policy compat_rules_global_models_write
on public.compat_rules_global_models for insert
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists compat_rules_global_models_update on public.compat_rules_global_models;
create policy compat_rules_global_models_update
on public.compat_rules_global_models for update
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists compat_rules_global_models_delete on public.compat_rules_global_models;
create policy compat_rules_global_models_delete
on public.compat_rules_global_models for delete
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists compat_rules_tenant_models_read on public.compat_rules_tenant_models;
create policy compat_rules_tenant_models_read
on public.compat_rules_tenant_models for select
using (true);

drop policy if exists compat_rules_tenant_models_write on public.compat_rules_tenant_models;
create policy compat_rules_tenant_models_write
on public.compat_rules_tenant_models for insert
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = tenant_id
  )
);

drop policy if exists compat_rules_tenant_models_update on public.compat_rules_tenant_models;
create policy compat_rules_tenant_models_update
on public.compat_rules_tenant_models for update
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = tenant_id
  )
);

drop policy if exists compat_rules_tenant_models_delete on public.compat_rules_tenant_models;
create policy compat_rules_tenant_models_delete
on public.compat_rules_tenant_models for delete
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = tenant_id
  )
);
