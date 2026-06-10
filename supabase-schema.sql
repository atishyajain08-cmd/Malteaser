create extension if not exists pgcrypto;

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  price integer not null default 0 check (price >= 0),
  section text not null check (section in ('new-arrivals', 'collections', 'lookbook', 'product')),
  label text default 'Malteaser',
  image_url text not null,
  storage_path text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.catalog_items enable row level security;

create policy "Public catalog read"
on public.catalog_items for select
to anon, authenticated
using (is_active = true or auth.role() = 'authenticated');

create policy "Admin catalog insert"
on public.catalog_items for insert
to authenticated
with check (true);

create policy "Admin catalog update"
on public.catalog_items for update
to authenticated
using (true)
with check (true);

create policy "Admin catalog delete"
on public.catalog_items for delete
to authenticated
using (true);

insert into storage.buckets (id, name, public)
values ('catalog', 'catalog', true)
on conflict (id) do update set public = true;

create policy "Public catalog image read"
on storage.objects for select
to public
using (bucket_id = 'catalog');

create policy "Admin catalog image upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'catalog');

create policy "Admin catalog image update"
on storage.objects for update
to authenticated
using (bucket_id = 'catalog')
with check (bucket_id = 'catalog');

create policy "Admin catalog image delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'catalog');
