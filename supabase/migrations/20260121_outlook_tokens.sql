-- Store Outlook OAuth tokens per user (service key required)
create table if not exists public.outlook_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz not null,
  scope text,
  token_type text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

create index if not exists outlook_tokens_expires_idx on public.outlook_tokens (expires_at);
