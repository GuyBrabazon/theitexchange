-- Track first view of a lot
alter table public.lots
  add column if not exists first_viewed_at timestamptz,
  add column if not exists first_viewed_by uuid;

create index if not exists lots_first_viewed_idx on public.lots (first_viewed_at);
