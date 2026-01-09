-- Add quoted price fields to RFQ lines so suppliers can record their quotes
alter table public.rfq_lines
  add column if not exists quoted_price numeric,
  add column if not exists quoted_currency text;
