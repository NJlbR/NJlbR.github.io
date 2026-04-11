import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Comment {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  user_profiles?: {
    username: string;
    avatar_url?: string;
  };
}

interface ChannelPostCommentsProps {
  postId: string;
  onCountChange: (count: number) => void;
}

export function ChannelPostComments({ postId, onCountChange }: ChannelPostCommentsProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [content, setContent] = useState('');

  useEffect(() => {
    void fetchComments();
  }, [postId]);

  async function fetchComments() {
    setLoading(true);

    const { data, error } = await supabase
      .from('channel_post_comments')
      .select(`
        id,
        content,
        created_at,
        author_id,
        user_profiles (
          username,
          avatar_url
        )
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setComments(data as any);
      onCountChange(data.length);
    }

    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || !user) return;

    setSending(true);

    try {
      const { error } = await supabase
        .from('channel_post_comments')
        .insert({
          post_id: postId,
          author_id: user.id,
          content: content.trim(),
        });

      if (error) throw error;

      setContent('');
      await fetchComments();
    } catch (err: any) {
      alert(err.message || 'Ошибка при отправке комментария');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3">
      {loading ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">Загрузка комментариев...</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">Комментариев пока нет</p>
      ) : (
        <div className="space-y-2">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-2">
              {comment.user_profiles?.avatar_url ? (
                <img
                  src={comment.user_profiles.avatar_url}
                  alt={comment.user_profiles.username}
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <div className="h-7 w-7 rounded-full bg-purple-500 text-white text-xs font-bold flex items-center justify-center">
                  {comment.user_profiles?.username?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              <div className="flex-1">
                <div className="text-xs font-medium text-gray-900 dark:text-white">
                  {comment.user_profiles?.username || 'Anonymous'}
                </div>
                <div className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                  {comment.content}
                </div>
              </div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500">
                {new Date(comment.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-3 flex items-center gap-2">
        <input
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Написать комментарий..."
          className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        />
        <button
          type="submit"
          disabled={sending || !content.trim()}
          className="p-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
          title="Отправить"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
