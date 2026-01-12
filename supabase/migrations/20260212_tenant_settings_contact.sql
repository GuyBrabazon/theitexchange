-- Add organisation contact fields for POs/invoicing
alter table public.tenant_settings
  add column if not exists accounts_email text,
  add column if not exists registered_address text,
  add column if not exists eori text;

-- Seed blanks for existing tenants
update public.tenant_settings
set accounts_email = coalesce(accounts_email, ''),
    registered_address = coalesce(registered_address, ''),
    eori = coalesce(eori, '')
where true;
