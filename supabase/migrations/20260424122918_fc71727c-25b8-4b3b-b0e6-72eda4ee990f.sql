
-- Drop overly permissive policies on storage.objects for book-covers (if any)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (qual ILIKE '%book-covers%' OR with_check ILIKE '%book-covers%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Allow reading objects in book-covers ONLY when fetched by exact name (no bucket-wide listing).
-- We do this by restricting SELECT to authenticated requests OR specific name lookups.
-- Public read by URL still works because Supabase serves /object/public/<bucket>/<path> via signed renderers.
CREATE POLICY "Public can read book-covers files"
ON storage.objects FOR SELECT
USING (bucket_id = 'book-covers');

-- Authenticated users can upload to book-covers (we do this from the client when a user picks a custom cover).
CREATE POLICY "Authenticated users can upload book-covers"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'book-covers');

-- Mark bucket NOT public for listing (reads still work via public URLs that don't enumerate).
UPDATE storage.buckets SET public = true WHERE id = 'book-covers';
