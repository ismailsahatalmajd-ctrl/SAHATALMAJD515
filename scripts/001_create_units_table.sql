-- Create units table for product measurement units
CREATE TABLE IF NOT EXISTS public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for public access (no auth required for basic inventory)
CREATE POLICY "units_select" ON public.units FOR SELECT USING (true);
CREATE POLICY "units_insert" ON public.units FOR INSERT WITH CHECK (true);
CREATE POLICY "units_update" ON public.units FOR UPDATE USING (true);
CREATE POLICY "units_delete" ON public.units FOR DELETE USING (true);

-- Insert default units
INSERT INTO public.units (name, abbreviation) VALUES
  ('قطعة', 'قطعة'),
  ('كيلوجرام', 'كجم'),
  ('جرام', 'جم'),
  ('لتر', 'لتر'),
  ('متر', 'م'),
  ('علبة', 'علبة'),
  ('كرتون', 'كرتون'),
  ('طن', 'طن')
ON CONFLICT DO NOTHING;
