-- PO numbering counters on tenant settings
alter table public.tenant_settings
  add column if not exists po_start_number numeric default 1000,
  add column if not exists po_current_number numeric default 1000;

-- seed defaults where missing
update public.tenant_settings
set po_start_number = coalesce(po_start_number, 1000),
    po_current_number = coalesce(po_current_number, 1000);
