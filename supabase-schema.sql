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
