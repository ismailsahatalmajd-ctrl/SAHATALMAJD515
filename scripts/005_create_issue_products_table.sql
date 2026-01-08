-- Create issue_products table for products in each issue
CREATE TABLE IF NOT EXISTS public.issue_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID REFERENCES public.issues(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  product_code TEXT,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  image_url TEXT,
  unit TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.issue_products ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "issue_products_select" ON public.issue_products FOR SELECT USING (true);
CREATE POLICY "issue_products_insert" ON public.issue_products FOR INSERT WITH CHECK (true);
CREATE POLICY "issue_products_update" ON public.issue_products FOR UPDATE USING (true);
CREATE POLICY "issue_products_delete" ON public.issue_products FOR DELETE USING (true);
