-- جداول قاعدة البيانات لموقع الجرد وربطها بالموقع

-- جدول المنتجات (متوافق مع lib/types.ts و lib/storage.ts)
create table if not exists public.products (
  id text primary key,
  product_code text,
  item_number text,
  location text,
  product_name text,
  quantity integer,
  unit text,
  opening_stock integer,
  purchases integer,
  issues integer,
  inventory_count integer,
  current_stock integer,
  difference integer,
  price numeric(12,2),
  average_price numeric(12,2),
  current_stock_value numeric(14,2),
  issues_value numeric(14,2),
  category text,
  image text,
  gallery jsonb,
  min_stock_limit integer,
  last_activity timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- جدول المعاملات/المشتريات البسيط (اختياري حالياً)
create table if not exists public.transactions (
  id text primary key,
  product_id text references public.products(id) on delete cascade,
  type text check (type in ('purchase','issue')),
  quantity integer not null,
  price numeric(12,2),
  created_at timestamptz default now()
);

-- جدول جلسات المستخدمين (User Sessions)
create table if not exists public.user_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  device_id text not null,
  device_info jsonb,
  last_active timestamptz default now(),
  created_at timestamptz default now()
);

-- تفعيل RLS وسياسات عامة (للتجربة فقط؛ عدّلها لاحقاً للإنتاج)
alter table public.products enable row level security;
create policy if not exists products_select_all on public.products for select using (true);
create policy if not exists products_insert_all on public.products for insert with check (true);
create policy if not exists products_update_all on public.products for update using (true) with check (true);
create policy if not exists products_delete_all on public.products for delete using (true);

alter table public.transactions enable row level security;
create policy if not exists transactions_select_all on public.transactions for select using (true);
create policy if not exists transactions_insert_all on public.transactions for insert with check (true);
create policy if not exists transactions_update_all on public.transactions for update using (true) with check (true);
create policy if not exists transactions_delete_all on public.transactions for delete using (true);

alter table public.user_sessions enable row level security;
create policy if not exists user_sessions_select_all on public.user_sessions for select using (true);
create policy if not exists user_sessions_insert_all on public.user_sessions for insert with check (true);
create policy if not exists user_sessions_delete_all on public.user_sessions for delete using (true);

-- ملاحظة: هذه السياسات تسمح بالقراءة والكتابة للجميع. للإنتاج، قصرها على المستخدمين المصدقين.
