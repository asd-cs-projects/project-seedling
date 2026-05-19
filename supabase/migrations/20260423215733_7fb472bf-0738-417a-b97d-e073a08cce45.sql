-- Remove the leftover permissive write policies (they coexist with the new teacher-only ones)
DROP POLICY IF EXISTS "Allow authenticated deletes from test-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to test-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to test-files" ON storage.objects;

-- Remove the broad public-listing SELECT policy. Files remain accessible
-- through their direct public URLs because the bucket is marked public,
-- but anonymous clients can no longer enumerate the bucket via the API.
DROP POLICY IF EXISTS "Allow public read access to test-files" ON storage.objects;

-- Replace with an authenticated-only read policy used for in-app listings.
-- Direct URL fetches continue to work via the public bucket setting.
CREATE POLICY "Authenticated users can read test-files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'test-files');
