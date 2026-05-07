-- Public bucket for book covers
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers', 'book-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can read covers (public bucket)
CREATE POLICY "Public read access for book covers"
ON storage.objects
FOR SELECT
USING (bucket_id = 'book-covers');

-- Anyone can upload covers (single-user local app, no auth)
CREATE POLICY "Public upload access for book covers"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'book-covers');

-- Anyone can update covers
CREATE POLICY "Public update access for book covers"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'book-covers');

-- Anyone can delete covers
CREATE POLICY "Public delete access for book covers"
ON storage.objects
FOR DELETE
USING (bucket_id = 'book-covers');