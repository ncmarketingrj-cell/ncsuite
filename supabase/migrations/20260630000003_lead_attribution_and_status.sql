-- Add UTM parameter columns and lead status to lead_captures
ALTER TABLE public.lead_captures ADD COLUMN IF NOT EXISTS utm_source text;
ALTER TABLE public.lead_captures ADD COLUMN IF NOT EXISTS utm_medium text;
ALTER TABLE public.lead_captures ADD COLUMN IF NOT EXISTS utm_campaign text;
ALTER TABLE public.lead_captures ADD COLUMN IF NOT EXISTS utm_content text;
ALTER TABLE public.lead_captures ADD COLUMN IF NOT EXISTS status text DEFAULT 'novo';

-- Also add UTM columns to quiz_submissions for consistency
ALTER TABLE public.quiz_submissions ADD COLUMN IF NOT EXISTS utm_source text;
ALTER TABLE public.quiz_submissions ADD COLUMN IF NOT EXISTS utm_medium text;
ALTER TABLE public.quiz_submissions ADD COLUMN IF NOT EXISTS utm_campaign text;
ALTER TABLE public.quiz_submissions ADD COLUMN IF NOT EXISTS utm_content text;

-- Add theme JSONB column to quizzes to enable high customization matching link_pages
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS theme jsonb DEFAULT '{}';
