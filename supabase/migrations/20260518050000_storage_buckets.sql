-- Create a storage bucket for media uploads (logos, products, etc)
INSERT INTO storage.buckets (id, name, public) VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Media public read" ON storage.objects FOR SELECT TO public USING (bucket_id = 'media');
CREATE POLICY "Media auth insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'media');
CREATE POLICY "Media auth update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'media');
CREATE POLICY "Media auth delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'media');
