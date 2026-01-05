-- Add group_token to lots to track sub-lot families
alter table public.lots
  add column if not exists group_token uuid;

create index if not exists lots_group_token_idx on public.lots (group_token);
