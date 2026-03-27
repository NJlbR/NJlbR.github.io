/*
  # Update Storage Limits for Media Files (v2)

  1. Changes
    - Add support for photo and file types in storage paths
    - Update bucket policies for new content types
  
  2. Security
    - Maintain authenticated upload requirement
    - Keep public read access for media files
*/

-- Drop and recreate upload policy with new folder types
DROP POLICY IF EXISTS "Authenticated users can upload media files" ON storage.objects;

CREATE POLICY "Authenticated users can upload media files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'media-files' AND
    (storage.foldername(name))[1] IN ('audio', 'video', 'photo', 'file')
  );

-- Note: File size limits are configured in Supabase dashboard
-- Maximum recommended limit is 5GB (5368709120 bytes) on paid plans