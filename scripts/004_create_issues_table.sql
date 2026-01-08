-- Create issues table for branch issues
CREATE TABLE IF NOT EXISTS public.issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  branch_name TEXT NOT NULL,
  total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT
);

-- Enable Row Level Security
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "issues_select" ON public.issues FOR SELECT USING (true);
CREATE POLICY "issues_insert" ON public.issues FOR INSERT WITH CHECK (true);
CREATE POLICY "issues_update" ON public.issues FOR UPDATE USING (true);
CREATE POLICY "issues_delete" ON public.issues FOR DELETE USING (true);
