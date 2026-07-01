-- Add animation_style column to link_items for attention CTA effects
ALTER TABLE public.link_items ADD COLUMN IF NOT EXISTS animation_style text DEFAULT 'none';
