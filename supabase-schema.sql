create extension if not exists pgcrypto;

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  price integer not null default 0 check (price >= 0),
  section text not null check (section in ('new-arrivals', 'collections', 'lookbook', 'product', 'ferris-wheel')),
  label text default 'Malteaser',
  image_url text not null,
  storage_path text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.catalog_items
drop constraint if exists catalog_items_section_check;

alter table public.catalog_items
add constraint catalog_items_section_check
check (section in ('new-arrivals', 'collections', 'lookbook', 'product', 'ferris-wheel'));

alter table public.catalog_items
add column if not exists inventory jsonb not null
default '{"S": 3, "M": 3, "L": 3, "XL": 3}'::jsonb;

alter table public.catalog_items
add column if not exists flash_slot smallint;

-- Normalise earlier deck labels, then assign their existing products to the
-- first available positions in each five-card deck.
update public.catalog_items
set label = case
  when label ~* '^(flash card|ferris wheel) 1$' or label = 'Essential Forms' then 'Flash Card 1'
  when label ~* '^(flash card|ferris wheel) 2$' or label = 'Maison Noir' then 'Flash Card 2'
  when label ~* '^(flash card|ferris wheel) 3$' or label = 'Modern Classics' then 'Flash Card 3'
  else label
end
where section = 'ferris-wheel';

with ranked_flash_cards as (
  select
    id,
    row_number() over (
      partition by label
      order by sort_order asc, created_at asc, id asc
    ) as slot_number
  from public.catalog_items
  where section = 'ferris-wheel'
    and label in ('Flash Card 1', 'Flash Card 2', 'Flash Card 3')
)
update public.catalog_items as item
set flash_slot = ranked.slot_number
from ranked_flash_cards as ranked
where item.id = ranked.id
  and item.flash_slot is null
  and ranked.slot_number between 1 and 5;

create unique index if not exists catalog_flash_card_slot_unique
on public.catalog_items (label, flash_slot)
where section = 'ferris-wheel'
  and is_active = true
  and flash_slot between 1 and 5;

create or replace function public.validate_flash_card_slot()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.section = 'ferris-wheel' then
    if new.label not in ('Flash Card 1', 'Flash Card 2', 'Flash Card 3')
       or new.flash_slot not between 1 and 5 then
      raise exception 'FLASH_SLOT_INVALID|Choose Homepage, Flash Card 1, 2, or 3, and Slot 1 to 5';
    end if;
  else
    new.flash_slot := null;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_flash_card_slot_on_catalog on public.catalog_items;
create trigger validate_flash_card_slot_on_catalog
before insert or update of section, label, flash_slot, is_active
on public.catalog_items
for each row execute function public.validate_flash_card_slot();

-- Move existing size quantities out of the legacy description marker and into
-- a proper inventory field. The marker is left in place for older clients.
update public.catalog_items
set inventory = jsonb_build_object(
  'S',  (regexp_match(description, '\[malteaser_stock:S=(\d+),M=(\d+),L=(\d+),XL=(\d+)\]'))[1]::integer,
  'M',  (regexp_match(description, '\[malteaser_stock:S=(\d+),M=(\d+),L=(\d+),XL=(\d+)\]'))[2]::integer,
  'L',  (regexp_match(description, '\[malteaser_stock:S=(\d+),M=(\d+),L=(\d+),XL=(\d+)\]'))[3]::integer,
  'XL', (regexp_match(description, '\[malteaser_stock:S=(\d+),M=(\d+),L=(\d+),XL=(\d+)\]'))[4]::integer
)
where description ~ '\[malteaser_stock:S=\d+,M=\d+,L=\d+,XL=\d+\]';

alter table public.catalog_items enable row level security;

drop policy if exists "Public catalog read" on public.catalog_items;
drop policy if exists "Admin catalog read" on public.catalog_items;
drop policy if exists "Admin catalog insert" on public.catalog_items;
drop policy if exists "Admin catalog update" on public.catalog_items;
drop policy if exists "Admin catalog delete" on public.catalog_items;

create policy "Public catalog read"
on public.catalog_items for select
to anon, authenticated
using (is_active = true);

create policy "Admin catalog read"
on public.catalog_items for select
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admin catalog insert"
on public.catalog_items for insert
to authenticated
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admin catalog update"
on public.catalog_items for update
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admin catalog delete"
on public.catalog_items for delete
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

insert into storage.buckets (id, name, public)
values ('catalog', 'catalog', true)
on conflict (id) do update set public = true;

drop policy if exists "Public catalog image read" on storage.objects;
drop policy if exists "Admin catalog image upload" on storage.objects;
drop policy if exists "Admin catalog image update" on storage.objects;
drop policy if exists "Admin catalog image delete" on storage.objects;

create policy "Public catalog image read"
on storage.objects for select
to public
using (bucket_id = 'catalog');

create policy "Admin catalog image upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'catalog'
  and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

create policy "Admin catalog image update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'catalog'
  and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
)
with check (
  bucket_id = 'catalog'
  and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

create policy "Admin catalog image delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'catalog'
  and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  address_line1 text not null,
  address_line2 text default '',
  city text not null,
  state text not null,
  pincode text not null,
  country text not null default 'India',
  delivery_notes text not null default '',
  items jsonb not null default '[]'::jsonb,
  subtotal integer not null default 0 check (subtotal >= 0),
  discount integer not null default 0 check (discount >= 0),
  total integer not null default 0 check (total >= 0),
  status text not null default 'new' check (status in ('new', 'processing', 'packed', 'shipped', 'delivered', 'cancelled')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  email_status text not null default 'pending' check (email_status in ('pending', 'sent', 'failed')),
  email_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
add column if not exists delivery_notes text not null default '';

create index if not exists orders_created_at_idx on public.orders (created_at desc);
create index if not exists orders_customer_email_idx on public.orders (lower(customer_email));
create index if not exists orders_customer_id_idx on public.orders (customer_id);

alter table public.orders enable row level security;

drop policy if exists "Customers create orders" on public.orders;
drop policy if exists "Customers read own orders" on public.orders;
drop policy if exists "Admins read orders" on public.orders;
drop policy if exists "Admins update orders" on public.orders;

create policy "Customers create orders"
on public.orders for insert
to anon, authenticated
with check (customer_id is null or customer_id = auth.uid());

create policy "Customers read own orders"
on public.orders for select
to authenticated
using (customer_id = auth.uid());

create policy "Admins read orders"
on public.orders for select
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admins update orders"
on public.orders for update
to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Create an order and reserve its size inventory in one transaction. Any
-- validation or stock failure rolls back both operations automatically.
create or replace function public.place_order_with_inventory(p_order jsonb)
returns table (
  id uuid,
  order_number text,
  email_status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_item jsonb;
  v_product public.catalog_items%rowtype;
  v_size text;
  v_quantity integer;
  v_available integer;
  v_inventory jsonb;
  v_customer_id uuid;
  v_order public.orders%rowtype;
begin
  if p_order is null or jsonb_typeof(p_order) <> 'object' then
    raise exception 'INVALID_ORDER|Order details are missing';
  end if;

  if jsonb_typeof(p_order -> 'items') <> 'array'
     or jsonb_array_length(p_order -> 'items') = 0 then
    raise exception 'INVALID_ORDER|Your bag is empty';
  end if;

  if nullif(p_order ->> 'customer_id', '') is not null then
    begin
      v_customer_id := (p_order ->> 'customer_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'INVALID_ORDER|Customer identity is invalid';
    end;
    if auth.uid() is null or auth.uid() <> v_customer_id then
      raise exception 'INVALID_ORDER|Customer identity does not match this session';
    end if;
  else
    v_customer_id := auth.uid();
  end if;

  for v_item in select value from jsonb_array_elements(p_order -> 'items') loop
    v_size := upper(trim(coalesce(v_item ->> 'size', '')));
    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);

    if v_quantity < 1 then
      raise exception 'INVALID_ORDER|Product quantity must be at least one';
    end if;

    -- Uploaded products use UUID ids. Static showcase products are still
    -- accepted, but only database-backed products have managed inventory.
    select * into v_product
    from public.catalog_items
    where catalog_items.id::text = v_item ->> 'id'
      and catalog_items.is_active = true
    for update;

    if found then
      if v_size not in ('S', 'M', 'L', 'XL') then
        raise exception 'INVALID_SIZE|%|%', v_product.title, v_size;
      end if;

      v_available := coalesce((v_product.inventory ->> v_size)::integer, 0);
      if v_available < v_quantity then
        raise exception 'INSUFFICIENT_STOCK|%|%|%',
          v_product.title, v_size, v_available;
      end if;

      v_inventory := jsonb_set(
        v_product.inventory,
        array[v_size],
        to_jsonb(v_available - v_quantity),
        true
      );

      update public.catalog_items
      set inventory = v_inventory,
          description = concat_ws(
            E'\n\n',
            nullif(trim(regexp_replace(
              description,
              '\s*\[malteaser_stock:S=\d+,M=\d+,L=\d+,XL=\d+\]\s*',
              '',
              'g'
            )), ''),
            format(
              '[malteaser_stock:S=%s,M=%s,L=%s,XL=%s]',
              v_inventory ->> 'S',
              v_inventory ->> 'M',
              v_inventory ->> 'L',
              v_inventory ->> 'XL'
            )
          )
      where catalog_items.id = v_product.id;
    elsif coalesce(v_item ->> 'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'PRODUCT_UNAVAILABLE|%', coalesce(v_item ->> 'title', 'This product');
    end if;
  end loop;

  insert into public.orders (
    order_number, customer_id, customer_name, customer_email,
    customer_phone, address_line1, address_line2, city, state, pincode,
    country, delivery_notes, items, subtotal, discount, total,
    status, payment_status, email_status
  ) values (
    p_order ->> 'order_number',
    v_customer_id,
    trim(p_order ->> 'customer_name'),
    lower(trim(p_order ->> 'customer_email')),
    trim(p_order ->> 'customer_phone'),
    trim(p_order ->> 'address_line1'),
    trim(coalesce(p_order ->> 'address_line2', '')),
    trim(p_order ->> 'city'),
    trim(p_order ->> 'state'),
    trim(p_order ->> 'pincode'),
    trim(coalesce(p_order ->> 'country', 'India')),
    trim(coalesce(p_order ->> 'delivery_notes', '')),
    p_order -> 'items',
    coalesce((p_order ->> 'subtotal')::integer, 0),
    coalesce((p_order ->> 'discount')::integer, 0),
    coalesce((p_order ->> 'total')::integer, 0),
    'new', 'pending', 'pending'
  ) returning * into v_order;

  return query
  select v_order.id, v_order.order_number, v_order.email_status, v_order.created_at;
end;
$$;

revoke all on function public.place_order_with_inventory(jsonb) from public;
grant execute on function public.place_order_with_inventory(jsonb) to anon, authenticated;

-- Orders must use the transaction above so inventory can never be skipped.
drop policy if exists "Customers create orders" on public.orders;
