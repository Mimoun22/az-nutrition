-- ============================================================
-- AZ NUTRITION — admin / store backend
-- Run this once in Supabase → SQL Editor → New query → Run
-- ============================================================

-- Admin identity (JWT email from Supabase Auth)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'admin@aznutrition.com';
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------- PRODUCTS ----------
create table if not exists public.products (
  id text primary key,
  name text not null,
  brand text not null default '',
  category text not null default 'creatine',
  price numeric not null,
  img text not null,
  tag text default '',
  description text default '',
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.products enable row level security;
drop policy if exists "products public read" on public.products;
create policy "products public read" on public.products for select using (active);
drop policy if exists "products admin write" on public.products;
create policy "products admin write" on public.products for all using (public.is_admin()) with check (public.is_admin());
grant select on public.products to anon, authenticated;
grant all on public.products to authenticated;

-- ---------- DISCOUNTS ----------
create table if not exists public.discounts (
  code text primary key,
  percent int not null check (percent between 1 and 100),
  note text default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.discounts enable row level security;
drop policy if exists "discounts public read" on public.discounts;
create policy "discounts public read" on public.discounts for select using (active);
drop policy if exists "discounts admin write" on public.discounts;
create policy "discounts admin write" on public.discounts for all using (public.is_admin()) with check (public.is_admin());
grant select on public.discounts to anon, authenticated;
grant all on public.discounts to authenticated;

-- ---------- CATEGORIES ----------
create table if not exists public.categories (
  id text primary key,
  label text not null,
  img text default '',
  active boolean not null default true,
  sort int not null default 0
);
alter table public.categories enable row level security;
drop policy if exists "categories public read" on public.categories;
create policy "categories public read" on public.categories for select using (active);
drop policy if exists "categories admin write" on public.categories;
create policy "categories admin write" on public.categories for all using (public.is_admin()) with check (public.is_admin());
grant select on public.categories to anon, authenticated;
grant all on public.categories to authenticated;

insert into public.categories (id, label, img, sort) values
  ('creatine', 'CREATINE', 'images/creatine.png', 1),
  ('preworkout', 'PRE-WORKOUT', 'images/abe.webp', 2),
  ('vitamins', 'VITAMINS', 'images/d3.png', 3),
  ('health', 'OMEGA & HEALTH', 'images/omega.jpg', 4)
on conflict (id) do nothing;

-- ---------- SITE TEXT ----------
create table if not exists public.site_text (
  key text primary key,
  value text not null
);
alter table public.site_text enable row level security;
drop policy if exists "site text public read" on public.site_text;
create policy "site text public read" on public.site_text for select using (true);
drop policy if exists "site text admin write" on public.site_text;
create policy "site text admin write" on public.site_text for all using (public.is_admin()) with check (public.is_admin());
grant select on public.site_text to anon, authenticated;
grant all on public.site_text to authenticated;

insert into public.site_text (key, value) values
  ('heroTitle', 'FUEL YOUR<br><span class="accent">NEXT LEVEL.</span>'),
  ('heroSub', 'Premium sports nutrition designed to support your training, recovery and everyday performance.'),
  ('promoText', 'Support your training with advanced recovery formulas — and <strong>members save <span id="promoPercent">10%</span> on every order</strong>.'),
  ('newsTitle', 'JOIN THE MOVEMENT'),
  ('newsText', 'Sign up for exclusive deals, new arrivals and training tips.')
on conflict (key) do nothing;

-- Default member discount (edit or delete this from the admin panel)
insert into public.discounts (code, percent, note, active) values
  ('AZ10', 10, 'Automatic member discount', true)
on conflict (code) do nothing;

-- ---------- ORDERS ----------
create table if not exists public.orders (
  id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  customer_name text not null,
  items jsonb not null,
  subtotal numeric not null,
  discount numeric not null default 0,
  discount_code text,
  total numeric not null,
  status text not null default 'New',
  created_at timestamptz not null default now()
);
alter table public.orders enable row level security;
drop policy if exists "orders own read" on public.orders;
create policy "orders own read" on public.orders for select using (auth.uid() = user_id);
drop policy if exists "orders own insert" on public.orders;
create policy "orders own insert" on public.orders for insert with check (auth.uid() = user_id);
drop policy if exists "orders admin all" on public.orders;
create policy "orders admin all" on public.orders for all using (public.is_admin()) with check (public.is_admin());
grant select, insert on public.orders to authenticated;
grant all on public.orders to authenticated;

-- ---------- PRODUCT IMAGE STORAGE ----------
insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do update set public = true;

drop policy if exists "product images public read" on storage.objects;
create policy "product images public read" on storage.objects
  for select using (bucket_id = 'products');

drop policy if exists "product images admin upload" on storage.objects;
create policy "product images admin upload" on storage.objects
  for insert with check (bucket_id = 'products' and public.is_admin());

drop policy if exists "product images admin delete" on storage.objects;
create policy "product images admin delete" on storage.objects
  for delete using (bucket_id = 'products' and public.is_admin());

-- Done. Now create the admin user in Authentication → Users → Add user:
-- email: admin@aznutrition.com  (password of your choice, Auto Confirm ON)
