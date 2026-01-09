-- Store supplier contact email on RFQs for buyer communication
alter table public.rfqs
  add column if not exists supplier_email text;
