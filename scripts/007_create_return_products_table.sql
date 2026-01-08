-- Create return_products table for products in each return
CREATE TABLE IF NOT EXISTS public.return_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID REFERENCES public.returns(id) ON DELETE CASCADE,
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
ALTER TABLE public.return_products ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "return_products_select" ON public.return_products FOR SELECT USING (true);
CREATE POLICY "return_products_insert" ON public.return_products FOR INSERT WITH CHECK (true);
CREATE POLICY "return_products_update" ON public.return_products FOR UPDATE USING (true);
CREATE POLICY "return_products_delete" ON public.return_products FOR DELETE USING (true);
