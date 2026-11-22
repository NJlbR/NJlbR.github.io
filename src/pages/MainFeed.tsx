import { useState, useEffect, useMemo } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { PostCard } from '../components/PostCard';
import { Filters, FilterState } from '../components/Filters';
import type { Database } from '../lib/database.types';

type Post = Database['public']['Tables']['posts']['Row'];

interface PostWithRelations extends Post {
  hashtags?: { name: string }[];
  persons?: { name: string }[];
  post_annotations?: any[];
}

export function MainFeed() {
  const [posts, setPosts] = useState<PostWithRelations[]>([]);
  const [allAnnotations, setAllAnnotations] = useState<{ id: string; term: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    contentType: '',
    hashtag: '',
    person: '',
    dateFrom: '',
    dateTo: '',
  });

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setFetchError(
        'Не настроены переменные окружения Supabase (VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY).'
      );
      setLoading(false);
      return;
    }

    fetchPosts();
    fetchAnnotations();
  }, []);

  async function fetchAnnotations() {
    if (!isSupabaseConfigured) return;

    const { data, error } = await supabase
      .from('annotations')
      .select('id, term')
      .order('term');

    if (!error && data) {
      setAllAnnotations(data);
    }
  }

  async function fetchPosts() {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(null);

    const { data: postsData, error } = await supabase
      .from('posts')
      .select(`
        *,
        post_hashtags (
          hashtags (name)
        ),
        post_persons (
          persons (name)
        ),
        post_annotations (
          id,
          annotation_id,
          position_start,
          position_end,
          annotations (
            id,
            term,
            content
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.message?.toLowerCase().includes('unregistered api key')) {
        setFetchError(
          'Ошибка подключения к Supabase: указан недействительный ключ API (VITE_SUPABASE_ANON_KEY). Проверьте настройки переменных окружения проекта.'
        );
      } else {
        setFetchError(`Не удалось загрузить посты: ${error.message}`);
      }
      setLoading(false);
      return;
    }

    if (postsData) {
      const postsWithRelations = (postsData as any[]).map((post: any) => ({
        ...post,
        hashtags: (post.post_hashtags || [])
          .map((h: any) => (h?.hashtags?.name ? { name: h.hashtags.name } : null))
          .filter(Boolean),
        persons: (post.post_persons || [])
          .map((p: any) => (p?.persons?.name ? { name: p.persons.name } : null))
          .filter(Boolean),
      })) as PostWithRelations[];

      setPosts(postsWithRelations);
    }

    setLoading(false);
  }

  const filteredPosts = useMemo(() => {
    let filtered = posts;

    if (filters.contentType) {
      filtered = filtered.filter(p => {
        const types = p.content_types || [p.content_type];
        return types.includes(filters.contentType as any);
      });
    }

    if (filters.hashtag) {
      filtered = filtered.filter(p =>
        p.hashtags?.some(h => h.name === filters.hashtag)
      );
    }

    if (filters.person) {
      filtered = filtered.filter(p =>
        p.persons?.some(person => person.name === filters.person)
      );
    }

    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      filtered = filtered.filter(p => new Date(p.created_at) >= fromDate);
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(p => new Date(p.created_at) <= toDate);
    }

    return filtered;
  }, [posts, filters]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 animate-pulse">
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-4"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Filters onFilterChange={setFilters} />

      {fetchError ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center space-y-3">
          <p className="text-red-700 dark:text-red-300 text-base font-medium">
            {fetchError}
          </p>
          <button
            type="button"
            onClick={fetchPosts}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
          >
            Повторить попытку
          </button>
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            {posts.length === 0 ? 'Постов пока нет. Добавьте первый пост в админ-панели!' : 'Посты не найдены с выбранными фильтрами.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredPosts.map((post) => (
            <PostCard key={post.id} post={post} allAnnotations={allAnnotations} />
          ))}
        </div>
      )}
    </div>
  );
}
