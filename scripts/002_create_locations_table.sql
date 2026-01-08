-- Create locations table for storage locations
CREATE TABLE IF NOT EXISTS public.locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "locations_select" ON public.locations FOR SELECT USING (true);
CREATE POLICY "locations_insert" ON public.locations FOR INSERT WITH CHECK (true);
CREATE POLICY "locations_update" ON public.locations FOR UPDATE USING (true);
CREATE POLICY "locations_delete" ON public.locations FOR DELETE USING (true);

-- Insert default locations
INSERT INTO public.locations (name, description) VALUES
  ('المستودع الرئيسي', 'المستودع الرئيسي للشركة'),
  ('المستودع الفرعي', 'مستودع فرعي')
ON CONFLICT DO NOTHING;
