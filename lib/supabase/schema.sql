-- Inventory system schema for PostgreSQL (Supabase)
-- Tables: products, categories, branches, transactions, purchase_orders, purchase_items,
-- issues (outgoing), issue_items, returns, return_items, branch_requests

-- ENUMS
do $$ begin
  create type transaction_type as enum ('purchase', 'issue', 'return', 'adjustment');
exception when duplicate_object then null; end $$;

-- CATEGORIES
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

-- BRANCHES
create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  address text,
  created_at timestamptz default now()
);

-- PRODUCTS
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null,
  item_number text,
  product_name text not null,
  unit text,
  price numeric(12,2) default 0,
  average_price numeric(12,2) default 0,
  opening_stock integer default 0,
  purchases integer default 0,
  issues integer default 0,
  current_stock integer default 0,
  current_stock_value numeric(14,2) default 0,
  category_id uuid references categories(id) on delete set null,
  location text,
  barcode text,
  image_url text,
  min_stock_limit integer,
  created_at timestamptz default now()
);

-- UNIQUE + INDEXES
create unique index if not exists products_code_unique on products(product_code);
create index if not exists products_name_idx on products using gin (to_tsvector('simple', product_name));
create index if not exists products_barcode_idx on products(barcode);

-- PURCHASE ORDERS
create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  supplier_name text,
  branch_id uuid references branches(id) on delete set null,
  order_date date not null default current_date,
  total_amount numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchase_orders(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  quantity integer not null,
  unit_price numeric(12,2) not null,
  total_amount numeric(14,2) generated always as (quantity * unit_price) stored
);
create index if not exists purchase_items_product_idx on purchase_items(product_id);

-- ISSUES (OUTGOING)
create table if not exists issues (
  id uuid primary key default gen_random_uuid(),
  from_branch_id uuid references branches(id) on delete set null,
  to_branch_id uuid references branches(id) on delete set null,
  issue_date date not null default current_date,
  reason text,
  created_at timestamptz default now()
);
create table if not exists issue_items (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references issues(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  quantity integer not null
);

-- RETURNS
create table if not exists returns (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id) on delete set null,
  return_date date not null default current_date,
  reason text,
  created_at timestamptz default now()
);
create table if not exists return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references returns(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  quantity integer not null
);

-- TRANSACTIONS (for analytics)
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete restrict,
  branch_id uuid references branches(id) on delete set null,
  type transaction_type not null,
  quantity integer not null,
  unit_price numeric(12,2),
  total_amount numeric(14,2),
  notes text,
  created_at timestamptz default now()
);
create index if not exists transactions_product_idx on transactions(product_id);
create index if not exists transactions_type_date_idx on transactions(type, created_at);

-- BRANCH REQUESTS
create table if not exists branch_requests (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id) on delete set null,
  status text check (status in ('pending','approved','rejected')) default 'pending',
  created_at timestamptz default now()
);

-- RLS (Row Level Security)
alter table products enable row level security;
alter table categories enable row level security;
alter table branches enable row level security;
alter table transactions enable row level security;
alter table purchase_orders enable row level security;
alter table purchase_items enable row level security;
alter table issues enable row level security;
alter table issue_items enable row level security;
alter table returns enable row level security;
alter table return_items enable row level security;
alter table branch_requests enable row level security;

-- Read policy: allow anonymous reads for catalog browsing (optional). You may tighten later.
create policy if not exists read_all_products on products for select using (true);
create policy if not exists read_all_categories on categories for select using (true);
create policy if not exists read_all_branches on branches for select using (true);
create policy if not exists read_all_transactions on transactions for select using (true);

-- Write policies: only authenticated users may write
create policy if not exists write_products_authenticated on products for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy if not exists write_categories_authenticated on categories for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy if not exists write_branches_authenticated on branches for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy if not exists write_transactions_authenticated on transactions for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy if not exists write_purchase_orders_authenticated on purchase_orders for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy if not exists write_purchase_items_authenticated on purchase_items for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy if not exists write_issues_authenticated on issues for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy if not exists write_issue_items_authenticated on issue_items for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy if not exists write_returns_authenticated on returns for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy if not exists write_return_items_authenticated on return_items for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy if not exists write_branch_requests_authenticated on branch_requests for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Sample view for reporting: product balances
create or replace view product_balances as
select p.id as product_id,
       p.product_code,
       p.product_name,
       p.current_stock,
       p.current_stock_value,
       p.average_price,
       p.category_id
from products p;

comment on view product_balances is 'Quick lookup for stock analytics';

-- APPLICATION SETTINGS (key/value JSON)
create table if not exists app_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  updated_at timestamptz default now()
);

alter table app_settings enable row level security;
create policy if not exists read_all_settings on app_settings for select using (true);
create policy if not exists write_settings_authenticated on app_settings for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');