/*
  # Create media storage bucket

  1. Storage Setup
    - Create 'media-files' bucket for audio/video files
    - Enable public access for uploaded files
    - Set allowed MIME types for audio and video

  2. Security
    - Allow authenticated users to upload files
    - Allow everyone to read files (public access)
    - Add policies for file management
*/

-- Create storage bucket for media files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media-files',
  'media-files',
  true,
  104857600,
  ARRAY[
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/m4a',
    'audio/aac',
    'audio/webm',
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files
DROP POLICY IF EXISTS "Authenticated users can upload media files" ON storage.objects;
CREATE POLICY "Authenticated users can upload media files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'media-files');

-- Allow authenticated users to update their files
DROP POLICY IF EXISTS "Authenticated users can update media files" ON storage.objects;
CREATE POLICY "Authenticated users can update media files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'media-files');

-- Allow authenticated users to delete files
DROP POLICY IF EXISTS "Authenticated users can delete media files" ON storage.objects;
CREATE POLICY "Authenticated users can delete media files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'media-files');

-- Allow public read access to all media files
DROP POLICY IF EXISTS "Public read access to media files" ON storage.objects;
CREATE POLICY "Public read access to media files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'media-files');