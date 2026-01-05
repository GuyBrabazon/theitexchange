-- Allow new status 'offers_received' for lots
alter table public.lots
  drop constraint if exists lots_status_check;

alter table public.lots
  add constraint lots_status_check
  check (
    status in (
      'draft',
      'open',
      'offers_received',
      'sale_in_progress',
      'order_processing',
      'sold',
      'closed'
    )
  );

