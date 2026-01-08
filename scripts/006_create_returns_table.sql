-- Create returns table for returned products
CREATE TABLE IF NOT EXISTS public.returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID REFERENCES public.issues(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  branch_name TEXT NOT NULL,
  total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.returns ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "returns_select" ON public.returns FOR SELECT USING (true);
CREATE POLICY "returns_insert" ON public.returns FOR INSERT WITH CHECK (true);
CREATE POLICY "returns_update" ON public.returns FOR UPDATE USING (true);
CREATE POLICY "returns_delete" ON public.returns FOR DELETE USING (true);
