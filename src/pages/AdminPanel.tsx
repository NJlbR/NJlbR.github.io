import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, CreditCard as Edit3, Upload, ArrowLeft, Image as ImageIcon, Music, Video, FileText, File as FileIcon, Send, X, Hash, Users, Captions, Save } from 'lucide-react';
import { detectAnnotations } from '../utils/annotationDetection';
import { getVisiblePostTitle, normalizePostTitleForStorage } from '../utils/postTitle';
import { ModerationPanel } from '../components/ModerationPanel';
import { UserApprovalPanel } from '../components/UserApprovalPanel';

type ContentType = 'text' | 'audio' | 'video' | 'photo' | 'file';

interface MediaFile {
  file: File;
  type: ContentType;
  url?: string;
}

interface ExistingMediaFile {
  type: ContentType;
  url: string;
  filename?: string;
}

function parseMediaUrls(mediaUrls: unknown): ExistingMediaFile[] {
  if (!mediaUrls) return [];

  try {
    const parsed = typeof mediaUrls === 'string' ? JSON.parse(mediaUrls) : mediaUrls;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is ExistingMediaFile => Boolean(item?.type && item?.url))
      : [];
  } catch {
    return [];
  }
}

async function validateFileMagicNumber(view: Uint8Array, type: ContentType, mimeType = ''): Promise<boolean> {
  const asciiHeader = new TextDecoder('utf-8', { fatal: false }).decode(view).trimStart().toLowerCase();
  const brand = String.fromCharCode(...view.slice(8, 16)).toLowerCase();

  if (type === 'photo') {
    const jpg = view[0] === 0xFF && view[1] === 0xD8;
    const png = view[0] === 0x89 && view[1] === 0x50 && view[2] === 0x4E;
    const gif = view[0] === 0x47 && view[1] === 0x49 && view[2] === 0x46;
    const webp = view[0] === 0x52 && view[1] === 0x49 && view[2] === 0x46 && view[8] === 0x57;
    const bmp = view[0] === 0x42 && view[1] === 0x4D;
    const tiff = (view[0] === 0x49 && view[1] === 0x49 && view[2] === 0x2A) || (view[0] === 0x4D && view[1] === 0x4D && view[3] === 0x2A);
    const ico = view[0] === 0x00 && view[1] === 0x00 && view[2] === 0x01 && view[3] === 0x00;
    const heifOrAvif = view[4] === 0x66 && view[5] === 0x74 && view[6] === 0x79 && /avif|avis|heic|heif|mif1|msf1/.test(brand);
    const svg = mimeType === 'image/svg+xml' && (asciiHeader.startsWith('<svg') || asciiHeader.startsWith('<?xml'));
    return jpg || png || gif || webp || bmp || tiff || ico || heifOrAvif || svg;
  }

  if (type === 'audio') {
    const mp3 = (view[0] === 0xFF && (view[1] === 0xFB || view[1] === 0xFA || view[1] === 0xF3 || view[1] === 0xF2)) || asciiHeader.startsWith('id3');
    const wav = view[0] === 0x52 && view[1] === 0x49 && view[2] === 0x46;
    const ogg = view[0] === 0x4F && view[1] === 0x67 && view[2] === 0x67;
    const m4a = view[4] === 0x66 && view[5] === 0x74 && view[6] === 0x79;
    const aac = view[0] === 0xFF && (view[1] & 0xF6) === 0xF0;
    const webm = view[0] === 0x1A && view[1] === 0x45 && view[2] === 0xDF;
    return mp3 || wav || ogg || m4a || aac || webm;
  }

  if (type === 'video') {
    const mp4OrMov = view[4] === 0x66 && view[5] === 0x74 && view[6] === 0x79;
    const webmOrMkv = view[0] === 0x1A && view[1] === 0x45 && view[2] === 0xDF;
    const ogg = view[0] === 0x4F && view[1] === 0x67 && view[2] === 0x67;
    const avi = view[0] === 0x52 && view[1] === 0x49 && view[2] === 0x46 && String.fromCharCode(...view.slice(8, 11)) === 'AVI';
    return mp4OrMov || webmOrMkv || ogg || avi;
  }

  return true;
}

export function AdminPanel() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);

  const [postTitle, setPostTitle] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<ContentType[]>(['text']);
  const [postContent, setPostContent] = useState('');
  const [postDescription, setPostDescription] = useState('');
  const [hasDescription, setHasDescription] = useState(false);
  const [allowComments, setAllowComments] = useState(false);
  const [postHashtags, setPostHashtags] = useState('');
  const [postPersons, setPostPersons] = useState('');
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [existingMediaFiles, setExistingMediaFiles] = useState<ExistingMediaFile[]>([]);

  const [existingPosts, setExistingPosts] = useState<any[]>([]);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'posts' | 'annotations' | 'moderation' | 'users'>('posts');

  const [allAnnotations, setAllAnnotations] = useState<any[]>([]);
  const [newAnnotationTerm, setNewAnnotationTerm] = useState('');
  const [newAnnotationContent, setNewAnnotationContent] = useState('');
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [editAnnotationTerm, setEditAnnotationTerm] = useState('');
  const [editAnnotationContent, setEditAnnotationContent] = useState('');

  useEffect(() => {
    if (user && profile?.is_admin) {
      fetchPosts();
      fetchAnnotations();
    }
  }, [user, profile]);

  async function fetchPosts() {
    const { data } = await supabase
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setExistingPosts(data);
  }

  async function fetchAnnotations() {
    const { data } = await supabase
      .from('annotations')
      .select('*')
      .order('term');
    if (data) setAllAnnotations(data);
  }


  const handleFileSelect = (type: ContentType, files: FileList | null) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files).map(file => ({ file, type }));
    setMediaFiles(prev => [...prev, ...selectedFiles]);
    setSelectedTypes(prev => (prev.includes(type) ? prev : [...prev.filter(t => t !== 'text'), type]));
  };

  const removeMediaFile = (index: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeExistingMediaFile = (index: number) => {
    setExistingMediaFiles(prev => prev.filter((_, i) => i !== index));
  };

  async function uploadFile(file: File, type: ContentType): Promise<string> {
    const maxSize = 5 * 1024 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error('Файл слишком большой. Максимальный размер: 5 ГБ');
    }

    const allowedTypes: Record<ContentType, string[]> = {
      text: [],
      audio: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/aac', 'audio/webm', 'audio/x-m4a', 'audio/x-wav'],
      video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/avi'],
      photo: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff', 'image/x-icon', 'image/heic', 'image/heif', 'image/avif'],
      file: [],
    };

    if (type !== 'file' && type !== 'text' && allowedTypes[type].length > 0) {
      if (!allowedTypes[type].includes(file.type)) {
        throw new Error('Неподдерживаемый тип файла для этого типа контента');
      }

      const buffer = await file.slice(0, 256).arrayBuffer();
      const view = new Uint8Array(buffer);
      const isValidMagic = await validateFileMagicNumber(view, type, file.type);

      if (!isValidMagic) {
        throw new Error('Содержимое файла не соответствует объявленному типу');
      }
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${type}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('media-files')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('media-files')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  }

  async function handleSavePost() {
    const visibleTitle = getVisiblePostTitle(postTitle);
    const title = normalizePostTitleForStorage(postTitle);
    const content = postContent.trim();
    const description = postDescription.trim();
    const hasMedia = existingMediaFiles.length > 0 || mediaFiles.length > 0;

    if (visibleTitle.length > 500) {
      alert('Название слишком длинное (максимум 500 символов)');
      return;
    }

    if (selectedTypes.length === 0) {
      alert('Выберите хотя бы один тип контента');
      return;
    }

    if (!visibleTitle && !content && !description && !hasMedia) {
      alert('Добавьте текст, заголовок, описание или медиафайл');
      return;
    }

    if (selectedTypes.includes('text') && !content && !hasMedia && !visibleTitle && !description) {
      alert('Введите текст для текстового поста или прикрепите медиа');
      return;
    }

    if (postContent.length > 100000) {
      alert('Текст поста слишком длинный (максимум 100 000 символов)');
      return;
    }

    if (postDescription.length > 50000) {
      alert('Описание слишком длинное (максимум 50 000 символов)');
      return;
    }

    setLoading(true);

    try {
      const uploadedMediaUrls = mediaFiles.length > 0
        ? await Promise.all(
            mediaFiles.map(async (mediaFile) => {
              const url = await uploadFile(mediaFile.file, mediaFile.type);
              return {
                type: mediaFile.type,
                url,
                filename: mediaFile.file.name,
              };
            })
          )
        : [];
      const mediaUrls = [...existingMediaFiles, ...uploadedMediaUrls];
      const effectiveTypes = Array.from(new Set([
        ...(content ? ['text' as ContentType] : []),
        ...selectedTypes.filter(type => type !== 'text'),
        ...mediaUrls.map(media => media.type),
      ]));

      const normalizedTypes = effectiveTypes.length > 0 ? effectiveTypes : ['text' as ContentType];
      const legacyContentType = normalizedTypes.find(type => type === 'text' || type === 'audio' || type === 'video') || 'text';
      let postId = editingPostId;

      const postData: any = {
        title,
        content_type: legacyContentType,
        content_types: normalizedTypes,
        content,
        description: hasDescription && description ? description : null,
        has_description: hasDescription && Boolean(description),
        allow_comments: allowComments,
        media_urls: JSON.stringify(mediaUrls),
        updated_at: new Date().toISOString(),
      };

      if (editingPostId) {
        const { error } = await supabase
          .from('posts')
          .update(postData)
          .eq('id', editingPostId);

        if (error) throw error;

        await supabase.from('post_hashtags').delete().eq('post_id', editingPostId);
        await supabase.from('post_persons').delete().eq('post_id', editingPostId);
      } else {
        const { data, error } = await supabase
          .from('posts')
          .insert({
            ...postData,
            author_id: user?.id,
          })
          .select()
          .single();

        if (error) throw error;
        postId = data?.id || null;
      }

      const hashtags = postHashtags.split(',').map(h => h.trim()).filter(Boolean);
      if (hashtags.length > 0 && postId) {
        const { data: existingHashtags } = await supabase
          .from('hashtags')
          .select('id, name')
          .in('name', hashtags);

        const existingNames = new Set(existingHashtags?.map(h => h.name) || []);
        const newHashtags = hashtags.filter(h => !existingNames.has(h));

        if (newHashtags.length > 0) {
          await supabase.from('hashtags').insert(newHashtags.map(name => ({ name })) as any);
        }

        const { data: allHashtags } = await supabase
          .from('hashtags')
          .select('id, name')
          .in('name', hashtags);

        const hashtagRelations = allHashtags?.map(h => ({ post_id: postId, hashtag_id: h.id })) || [];
        if (hashtagRelations.length > 0) {
          await supabase.from('post_hashtags').insert(hashtagRelations as any);
        }
      }

      const persons = postPersons.split(',').map(p => p.trim()).filter(Boolean);
      if (persons.length > 0 && postId) {
        const { data: existingPersons } = await supabase
          .from('persons')
          .select('id, name')
          .in('name', persons);

        const existingNames = new Set(existingPersons?.map(p => p.name) || []);
        const newPersons = persons.filter(p => !existingNames.has(p));

        if (newPersons.length > 0) {
          await supabase.from('persons').insert(newPersons.map(name => ({ name })) as any);
        }

        const { data: allPersons } = await supabase
          .from('persons')
          .select('id, name')
          .in('name', persons);

        const personRelations = allPersons?.map(p => ({ post_id: postId, person_id: p.id })) || [];
        if (personRelations.length > 0) {
          await supabase.from('post_persons').insert(personRelations as any);
        }
      }

      if (postId) {
        await supabase.from('post_annotations').delete().eq('post_id', postId);

        const { data: allAnnotationsData } = await supabase
          .from('annotations')
          .select('id, term');

        if (allAnnotationsData) {
          const annotationMatches = new Map<string, { start: number; end: number }[]>();

          if (postContent) {
            const contentMatches = detectAnnotations(postContent, allAnnotationsData);
            contentMatches.forEach(match => {
              if (!annotationMatches.has(match.annotationId)) {
                annotationMatches.set(match.annotationId, []);
              }
              annotationMatches.get(match.annotationId)!.push({
                start: match.start,
                end: match.end,
              });
            });
          }

          if (hasDescription && postDescription) {
            const descriptionMatches = detectAnnotations(postDescription, allAnnotationsData);
            const contentLength = postContent ? postContent.length : 0;
            descriptionMatches.forEach(match => {
              if (!annotationMatches.has(match.annotationId)) {
                annotationMatches.set(match.annotationId, []);
              }
              annotationMatches.get(match.annotationId)!.push({
                start: contentLength + match.start,
                end: contentLength + match.end,
              });
            });
          }

          const annotationRecords: any[] = [];
          annotationMatches.forEach((positions, annotationId) => {
            positions.forEach(pos => {
              annotationRecords.push({
                post_id: postId,
                annotation_id: annotationId,
                position_start: pos.start,
                position_end: pos.end,
              });
            });
          });

          if (annotationRecords.length > 0) {
            await supabase.from('post_annotations').insert(annotationRecords);
          }
        }
      }

      resetPostForm();
      fetchPosts();
      alert(editingPostId ? 'Пост обновлен!' : 'Пост создан!');
    } catch (err: any) {
      alert('Ошибка: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeletePost(postId: string) {
    if (!confirm('Удалить этот пост?')) return;

    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) {
      alert('Ошибка удаления: ' + error.message);
    } else {
      fetchPosts();
    }
  }

  async function handleEditPost(post: any) {
    setEditingPostId(post.id);
    setPostTitle(getVisiblePostTitle(post.title));
    setSelectedTypes(post.content_types || [post.content_type]);
    setPostContent(post.content || '');
    setPostDescription(post.description || '');
    setExistingMediaFiles(parseMediaUrls(post.media_urls));
    setMediaFiles([]);
    setHasDescription(post.has_description || false);
    setAllowComments(post.allow_comments || false);

    const { data: hashtagsData } = await supabase
      .from('post_hashtags')
      .select('hashtags(name)')
      .eq('post_id', post.id);
    setPostHashtags(hashtagsData?.map((h: any) => h.hashtags.name).join(', ') || '');

    const { data: personsData } = await supabase
      .from('post_persons')
      .select('persons(name)')
      .eq('post_id', post.id);
    setPostPersons(personsData?.map((p: any) => p.persons.name).join(', ') || '');

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetPostForm() {
    setEditingPostId(null);
    setPostTitle('');
    setSelectedTypes(['text']);
    setPostContent('');
    setPostDescription('');
    setHasDescription(false);
    setAllowComments(false);
    setPostHashtags('');
    setPostPersons('');
    setMediaFiles([]);
    setExistingMediaFiles([]);
  }

  async function handleCreateAnnotation() {
    if (!newAnnotationTerm || newAnnotationTerm.length > 200) {
      alert('Введите термин (максимум 200 символов)');
      return;
    }

    if (newAnnotationContent.length > 50000) {
      alert('Описание слишком длинное (максимум 50 000 символов)');
      return;
    }

    const { error } = await supabase.from('annotations').insert({
      term: newAnnotationTerm.trim(),
      content: newAnnotationContent.trim(),
    } as any);

    if (error) {
      alert('Ошибка: ' + error.message);
    } else {
      setNewAnnotationTerm('');
      setNewAnnotationContent('');
      fetchAnnotations();
      alert('Аннотация создана!');
    }
  }

  async function handleEditAnnotation(annotation: any) {
    setEditingAnnotationId(annotation.id);
    setEditAnnotationTerm(annotation.term);
    setEditAnnotationContent(annotation.content || '');
  }

  async function handleSaveAnnotation() {
    if (!editAnnotationTerm || editAnnotationTerm.length > 200) {
      alert('Введите термин (максимум 200 символов)');
      return;
    }

    if (editAnnotationContent.length > 50000) {
      alert('Описание слишком длинное (максимум 50 000 символов)');
      return;
    }

    const { error } = await supabase
      .from('annotations')
      .update({
        term: editAnnotationTerm.trim(),
        content: editAnnotationContent.trim(),
        updated_at: new Date().toISOString(),
      } as any)
      .eq('id', editingAnnotationId!);

    if (error) {
      alert('Ошибка: ' + error.message);
    } else {
      setEditingAnnotationId(null);
      setEditAnnotationTerm('');
      setEditAnnotationContent('');
      fetchAnnotations();
      alert('Аннотация обновлена!');
    }
  }

  async function handleDeleteAnnotation(annotationId: string) {
    if (!confirm('Удалить эту аннотацию?')) return;

    const { error } = await supabase.from('annotations').delete().eq('id', annotationId);
    if (error) {
      alert('Ошибка удаления: ' + error.message);
    } else {
      fetchAnnotations();
    }
  }

  if (!user || !profile?.is_admin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Доступ запрещен
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            У вас нет прав администратора
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
            На главную
          </a>
        </div>
      </div>
    );
  }

  const contentTypeLabels = {
    text: 'Текст',
    audio: 'Аудио',
    video: 'Видео',
    photo: 'Фото',
    file: 'Файл',
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Админ-панель
          </h1>
          <a
            href="/"
            className="flex items-center gap-2 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
            <span>На главную</span>
          </a>
        </div>

        <div className="mb-6 flex gap-3 flex-wrap">
          <button
            onClick={() => setActiveTab('posts')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'posts'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Управление постами
          </button>
          <button
            onClick={() => setActiveTab('annotations')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'annotations'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Управление аннотациями
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'users'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Пользователи
          </button>
          <button
            onClick={() => setActiveTab('moderation')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              activeTab === 'moderation'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Наказания
          </button>
        </div>

        {activeTab === 'users' ? (
        <UserApprovalPanel />
      ) : activeTab === 'moderation' ? (
        <ModerationPanel />
      ) : activeTab === 'posts' ? (
          <>
            <div className="mb-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
              <div className="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">
                  {editingPostId ? 'Редактирование поста' : 'Новый пост'}
                </h2>
                <div className="flex gap-2">
                  {editingPostId && (
                    <button
                      onClick={resetPostForm}
                      className="flex-1 rounded-xl bg-gray-100 px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 sm:flex-none"
                    >
                      Отмена
                    </button>
                  )}
                  <button
                    onClick={handleSavePost}
                    disabled={loading}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-gray-400 sm:flex-none"
                  >
                    <Send size={18} />
                    {loading ? 'Сохранение...' : editingPostId ? 'Обновить' : 'Опубликовать'}
                  </button>
                </div>
              </div>

              <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4 p-4 sm:p-5">
                  <div>
                    <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      <FileText size={16} />
                      Заголовок
                    </label>
                    <input
                      type="text"
                      value={postTitle}
                      onChange={(e) => setPostTitle(e.target.value)}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-lg font-semibold text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                      placeholder="Заголовок"
                      maxLength={500}
                    />
                  </div>

                  <div>
                    <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      <Captions size={16} />
                      Текст
                    </label>
                    <textarea
                      value={postContent}
                      onChange={(e) => {
                        setPostContent(e.target.value);
                        if (e.target.value && !selectedTypes.includes('text')) {
                          setSelectedTypes(prev => ['text', ...prev]);
                        }
                      }}
                      rows={10}
                      className="min-h-[220px] w-full resize-y rounded-xl border border-gray-300 bg-white px-3 py-3 text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                      placeholder="Текст поста"
                    />
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/70 sm:p-4">
                    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {(['photo', 'video', 'audio', 'file'] as ContentType[]).map(type => (
                        <label
                          key={type}
                          className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-3 py-3 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 transition hover:bg-blue-600 hover:text-white dark:bg-gray-800 dark:text-gray-200 dark:ring-gray-700 dark:hover:bg-blue-600"
                        >
                          {type === 'photo' && <ImageIcon size={16} />}
                          {type === 'video' && <Video size={16} />}
                          {type === 'audio' && <Music size={16} />}
                          {type === 'file' && <FileIcon size={16} />}
                          {contentTypeLabels[type]}
                          <input
                            type="file"
                            multiple
                            accept={
                              type === 'audio' ? 'audio/*,.mp3,.wav,.ogg,.m4a,.aac,.webm' :
                              type === 'video' ? 'video/*,.mp4,.webm,.ogg,.mov,.avi,.mkv' :
                              type === 'photo' ? 'image/*,.jpg,.jpeg,.png,.gif,.webp,.svg,.bmp,.tiff,.ico,.heic,.heif,.avif' :
                              '*/*'
                            }
                            onChange={(e) => {
                              handleFileSelect(type, e.target.files);
                              e.target.value = '';
                            }}
                            className="hidden"
                          />
                        </label>
                      ))}
                    </div>

                    {[...existingMediaFiles.map((media, index) => ({ ...media, index, existing: true as const })), ...mediaFiles.map((media, index) => ({ type: media.type, filename: media.file.name, size: media.file.size, index, existing: false as const }))].length > 0 ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {existingMediaFiles.map((media, idx) => (
                          <div key={`existing-${media.url}-${idx}`} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-sm dark:bg-gray-800">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
                                {media.type === 'photo' && <ImageIcon size={18} />}
                                {media.type === 'video' && <Video size={18} />}
                                {media.type === 'audio' && <Music size={18} />}
                                {media.type === 'file' && <FileIcon size={18} />}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{media.filename || 'Медиа'}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{contentTypeLabels[media.type]} • в посте</p>
                              </div>
                            </div>
                            <button
                              onClick={() => removeExistingMediaFile(idx)}
                              className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                              title="Убрать из поста"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        ))}

                        {mediaFiles.map((mf, idx) => (
                          <div key={`${mf.file.name}-${idx}`} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 shadow-sm dark:bg-gray-800">
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-300">
                                {mf.type === 'photo' && <ImageIcon size={18} />}
                                {mf.type === 'video' && <Video size={18} />}
                                {mf.type === 'audio' && <Music size={18} />}
                                {mf.type === 'file' && <FileIcon size={18} />}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{mf.file.name}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {contentTypeLabels[mf.type]} • {(mf.file.size / 1024 / 1024).toFixed(2)} МБ
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => removeMediaFile(idx)}
                              className="rounded-lg p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                              title="Убрать файл"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-4 text-center text-sm font-medium text-gray-700 transition hover:border-blue-400 hover:text-blue-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-blue-500 dark:hover:text-blue-300">
                        <Upload size={18} />
                        Добавить файл
                        <input
                          type="file"
                          multiple
                          onChange={(e) => {
                            handleFileSelect('file', e.target.files);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>

                <aside className="border-t border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50 sm:p-5 lg:border-l lg:border-t-0">
                  <div className="space-y-4 lg:sticky lg:top-4">
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 rounded-xl bg-white p-3 text-sm font-medium text-gray-700 shadow-sm dark:bg-gray-800 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={hasDescription}
                          onChange={(e) => setHasDescription(e.target.checked)}
                          className="h-4 w-4"
                        />
                        Описание
                      </label>

                      {hasDescription && (
                        <textarea
                          value={postDescription}
                          onChange={(e) => setPostDescription(e.target.value)}
                          rows={6}
                          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                          placeholder="Описание"
                        />
                      )}

                      <label className="flex items-center gap-3 rounded-xl bg-white p-3 text-sm font-medium text-gray-700 shadow-sm dark:bg-gray-800 dark:text-gray-300">
                        <input
                          type="checkbox"
                          checked={allowComments}
                          onChange={(e) => setAllowComments(e.target.checked)}
                          className="h-4 w-4"
                        />
                        Комментарии
                      </label>
                    </div>

                    <div className="space-y-3">
                      <label className="block">
                        <span className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                          <Hash size={16} />
                          Хэштеги
                        </span>
                        <input
                          type="text"
                          value={postHashtags}
                          onChange={(e) => setPostHashtags(e.target.value)}
                          placeholder="наука, история"
                          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                        />
                      </label>

                      <label className="block">
                        <span className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                          <Users size={16} />
                          Персоны
                        </span>
                        <input
                          type="text"
                          value={postPersons}
                          onChange={(e) => setPostPersons(e.target.value)}
                          placeholder="Иван Иванов"
                          className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                        />
                      </label>
                    </div>

                    <button
                      onClick={handleSavePost}
                      disabled={loading}
                      className="hidden w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-gray-400 lg:flex"
                    >
                      <Send size={20} />
                      {loading ? 'Сохранение...' : editingPostId ? 'Обновить пост' : 'Опубликовать пост'}
                    </button>
                  </div>
                </aside>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Существующие посты
              </h2>

              <div className="space-y-3">
                {existingPosts.map((post) => (
                  <div
                    key={post.id}
                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <h3 className="font-bold text-gray-900 dark:text-white truncate">
                        {getVisiblePostTitle(post.title) || 'Пост без заголовка'}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {(post.content_types || [post.content_type]).join(', ')} • {new Date(post.created_at).toLocaleDateString('ru-RU')}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleEditPost(post)}
                        className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg"
                      >
                        <Edit3 size={20} />
                      </button>
                      <button
                        onClick={() => handleDeletePost(post.id)}
                        className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                ))}

                {existingPosts.length === 0 && (
                  <p className="text-gray-600 dark:text-gray-400 text-center py-4">
                    Постов пока нет
                  </p>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-8">
            {editingAnnotationId ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                  Редактировать аннотацию
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Термин
                    </label>
                    <input
                      type="text"
                      value={editAnnotationTerm}
                      onChange={(e) => setEditAnnotationTerm(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Описание
                    </label>
                    <textarea
                      value={editAnnotationContent}
                      onChange={(e) => setEditAnnotationContent(e.target.value)}
                      rows={10}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleSaveAnnotation}
                      className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                    >
                      <Save size={20} />
                      Сохранить
                    </button>
                    <button
                      onClick={() => {
                        setEditingAnnotationId(null);
                        setEditAnnotationTerm('');
                        setEditAnnotationContent('');
                      }}
                      className="px-6 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                  Создать новую аннотацию
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Термин
                    </label>
                    <input
                      type="text"
                      value={newAnnotationTerm}
                      onChange={(e) => setNewAnnotationTerm(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Введите термин..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Описание
                    </label>
                    <textarea
                      value={newAnnotationContent}
                      onChange={(e) => setNewAnnotationContent(e.target.value)}
                      rows={6}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Введите описание термина..."
                    />
                  </div>

                  <button
                    onClick={handleCreateAnnotation}
                    className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                  >
                    <Plus size={20} />
                    Создать аннотацию
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Все аннотации ({allAnnotations.length})
              </h3>

              <div className="space-y-3">
                {allAnnotations.map((ann) => (
                  <div
                    key={ann.id}
                    className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg"
                  >
                    <div className="flex-1 min-w-0 mr-3">
                      <h4 className="font-bold text-gray-900 dark:text-white mb-1">
                        {ann.term}
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                        {ann.content || 'Описание не добавлено'}
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleEditAnnotation(ann)}
                        className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg"
                      >
                        <Edit3 size={20} />
                      </button>
                      <button
                        onClick={() => handleDeleteAnnotation(ann.id)}
                        className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                ))}

                {allAnnotations.length === 0 && (
                  <p className="text-gray-600 dark:text-gray-400 text-center py-4">
                    Аннотаций пока нет
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

