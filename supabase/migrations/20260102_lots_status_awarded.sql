-- Extend lots status to include 'awarded'
alter table public.lots
  drop constraint if exists lots_status_check;

alter table public.lots
  add constraint lots_status_check
  check (
    status in (
      'draft',
      'open',
      'offers_received',
      'awarded',
      'sale_in_progress',
      'order_processing',
      'sold',
      'closed'
    )
  );

