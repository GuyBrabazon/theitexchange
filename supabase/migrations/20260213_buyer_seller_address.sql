-- Add address fields to buyers and sellers for full contact info

alter table public.buyers
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists country text,
  add column if not exists postcode text;

alter table public.sellers
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists country text,
  add column if not exists postcode text;

-- Seed blanks to avoid null surprises in existing rows
update public.buyers
set address_line1 = coalesce(address_line1, ''),
    address_line2 = coalesce(address_line2, ''),
    city = coalesce(city, ''),
    state = coalesce(state, ''),
    country = coalesce(country, ''),
    postcode = coalesce(postcode, '');

update public.sellers
set address_line1 = coalesce(address_line1, ''),
    address_line2 = coalesce(address_line2, ''),
    city = coalesce(city, ''),
    state = coalesce(state, ''),
    country = coalesce(country, ''),
    postcode = coalesce(postcode, '');
