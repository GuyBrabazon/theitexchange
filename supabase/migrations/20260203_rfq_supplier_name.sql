-- Add supplier_name to RFQs so buyers can see who responded without cross-tenant lookup
alter table public.rfqs
  add column if not exists supplier_name text;
