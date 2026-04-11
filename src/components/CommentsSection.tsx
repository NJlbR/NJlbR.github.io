import { useState, useEffect, memo } from 'react';
import { MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Database } from '../lib/database.types';

type Comment = Database['public']['Tables']['comments']['Row'] & {
  user_profiles?: {
    username: string;
    is_admin: boolean;
  };
};

interface CommentsSectionProps {
  postId: string;
}

function CommentsSectionContent({ postId }: CommentsSectionProps) {
  const { user, profile } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isModerated, setIsModerated] = useState(false);
  const [isApproved, setIsApproved] = useState(false);

  useEffect(() => {
    if (showComments) {
      fetchComments();
    }
  }, [showComments, postId]);

  useEffect(() => {
    if (user && profile) {
      checkModeration();
      checkApproval();
    }
  }, [user, profile]);

  async function checkModeration() {
    if (!user) return;

    const { data } = await supabase
      .from('user_moderation')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .or('moderation_type.eq.ban,expires_at.gt.' + new Date().toISOString())
      .maybeSingle();

    setIsModerated(!!data);
  }

  async function checkApproval() {
    if (!profile) return;
    setIsApproved(profile.approval_status === 'approved');
  }

  async function fetchComments() {
    const { data } = await supabase
      .from('comments')
      .select(`
        *,
        user_profiles (
          username,
          is_admin
        )
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (data) {
      setComments(data as any);
    }
  }

  async function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();

    const trimmedComment = newComment.trim();

    if (!user || !trimmedComment) return;

    if (!isApproved) {
      alert('Ваша учетная запись должна быть одобрена администратором, прежде чем вы сможете оставлять комментарии');
      return;
    }

    if (trimmedComment.length > 5000) {
      alert('Комментарий слишком длинный (максимум 5000 символов)');
      return;
    }

    if (trimmedComment.length < 2) {
      alert('Комментарий слишком короткий (минимум 2 символа)');
      return;
    }

    if (isModerated) {
      alert('Вы не можете оставлять комментарии');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          user_id: user.id,
          content: trimmedComment,
        });

      if (error) throw error;

      setNewComment('');
      await fetchComments();
    } catch (err: any) {
      console.error('Comment submission error:', err);
      alert('Не удалось отправить комментарий. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  }

  async function handleModerate(userId: string, type: 'mute_1h' | 'mute_6h' | 'mute_24h' | 'ban') {
    if (!profile?.is_admin || !user) return;

    if (userId === user.id) {
      alert('Вы не можете модерировать самого себя');
      return;
    }

    const now = new Date();
    let expiresAt = null;

    if (type === 'mute_1h') {
      expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    } else if (type === 'mute_6h') {
      expiresAt = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
    } else if (type === 'mute_24h') {
      expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    }

    try {
      const { error: moderationError } = await supabase
        .from('user_moderation')
        .insert({
          user_id: userId,
          moderated_by: user?.id,
          moderation_type: type,
          expires_at: expiresAt,
        });

      if (moderationError) throw moderationError;

      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { error: deleteError } = await supabase
        .from('comments')
        .delete()
        .eq('user_id', userId)
        .gte('created_at', oneMonthAgo);

      if (deleteError) throw deleteError;

      await fetchComments();

      const typeLabels = {
        mute_1h: 'Пользователь замучен на 1 час',
        mute_6h: 'Пользователь замучен на 6 часов',
        mute_24h: 'Пользователь замучен на 24 часа',
        ban: 'Пользователь забанен',
      };

      alert(typeLabels[type] + '. Все комментарии за последний месяц удалены.');
    } catch (err: any) {
      alert('Ошибка модерации: ' + err.message);
    }
  }

  return (
    <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
      <button
        onClick={() => setShowComments(!showComments)}
        className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
      >
        {showComments ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        <MessageSquare size={20} />
        <span>Комментарии ({comments.length})</span>
      </button>

      {showComments && (
        <div className="mt-4 space-y-4">
          {user ? (
            !isApproved ? (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  Ваша учетная запись ожидает одобрения администратором. После одобрения вы сможете оставлять комментарии.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitComment} className="space-y-3">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder={isModerated ? 'Вы не можете оставлять комментарии' : 'Напишите комментарий...'}
                  disabled={isModerated || loading}
                  rows={3}
                  maxLength={5000}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {newComment.length}/5000 символов
                </p>
                <button
                  type="submit"
                  disabled={!newComment.trim() || isModerated || loading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                >
                  {loading ? 'Отправка...' : 'Отправить'}
                </button>
              </form>
            )
          ) : (
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Войдите, чтобы оставить комментарий
            </p>
          )}

          <div className="space-y-3">
            {comments.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400 text-sm text-center py-4">
                Комментариев пока нет
              </p>
            ) : (
              comments.map((comment) => (
                <div
                  key={comment.id}
                  className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {comment.user_profiles?.username || 'Пользователь'}
                        </span>
                        {comment.user_profiles?.is_admin && (
                          <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                            админ
                          </span>
                        )}
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(comment.created_at).toLocaleString('ru-RU')}
                        </span>
                      </div>
                      <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                        {comment.content}
                      </p>
                    </div>

                    {profile?.is_admin && comment.user_id !== user?.id && (
                      <div className="flex gap-1 ml-3 flex-shrink-0">
                        <button
                          onClick={() => handleModerate(comment.user_id, 'mute_1h')}
                          className="px-2 py-1 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-200 dark:hover:bg-yellow-900/50 rounded transition-colors font-medium"
                          title="Замутить на 1 час"
                        >
                          М-1
                        </button>
                        <button
                          onClick={() => handleModerate(comment.user_id, 'mute_6h')}
                          className="px-2 py-1 text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 hover:bg-orange-200 dark:hover:bg-orange-900/50 rounded transition-colors font-medium"
                          title="Замутить на 6 часов"
                        >
                          М-6
                        </button>
                        <button
                          onClick={() => handleModerate(comment.user_id, 'mute_24h')}
                          className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 rounded transition-colors font-medium"
                          title="Замутить на 24 часа"
                        >
                          М-24
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Забанить пользователя навсегда?')) {
                              handleModerate(comment.user_id, 'ban');
                            }
                          }}
                          className="px-2 py-1 text-xs bg-gray-800 dark:bg-gray-600 text-white hover:bg-gray-900 dark:hover:bg-gray-700 rounded transition-colors font-medium"
                          title="Забанить навсегда"
                        >
                          Б
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const CommentsSection = memo(CommentsSectionContent);
