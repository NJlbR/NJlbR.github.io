import { useEffect, useState } from 'react';
import { Eye, Heart, MessageCircle, Trash2, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Database } from '../../lib/database.types';
import { ChannelPostComments } from './ChannelPostComments';

type ChannelPost = Database['public']['Tables']['channel_posts']['Row'] & {
  user_profiles?: {
    username: string;
    avatar_url?: string;
  };
};

interface ChannelPostBubbleProps {
  post: ChannelPost;
  isAuthor: boolean;
  canDelete: boolean;
  isLiked: boolean;
  onLike: () => void;
  onDelete: () => void;
}

export function ChannelPostBubble({
  post,
  isAuthor,
  canDelete,
  isLiked,
  onLike,
  onDelete,
}: ChannelPostBubbleProps) {
  const { user } = useAuth();
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const mediaUrls = post.media_urls ? (Array.isArray(post.media_urls) ? post.media_urls : [post.media_urls]) : [];
  const normalizedMedia = mediaUrls
    .map((item: any) => {
      if (typeof item === 'string') return { url: item };
      if (item && typeof item.url === 'string') return { url: item.url };
      return null;
    })
    .filter(Boolean) as { url: string }[];
  const createdAt = new Date(post.created_at).toLocaleString('ru-RU', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const getMediaType = (url: string) => {
    if (url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return 'image';
    if (url.match(/\.(mp3|wav|ogg|m4a)$/i)) return 'audio';
    if (url.match(/\.(mp4|webm|avi)$/i)) return 'video';
    return 'file';
  };

  useEffect(() => {
    void fetchCounts();
    const cleanup = subscribeToComments();
    return cleanup;
  }, [post.id, user?.id]);

  async function fetchCounts() {
    const { count } = await supabase
      .from('channel_post_comments')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', post.id);

    setCommentCount(count ?? 0);

    if (!user) {
      setUnreadCount(0);
      return;
    }

    const { data: readData } = await supabase
      .from('channel_post_comment_reads')
      .select('last_read_at')
      .eq('post_id', post.id)
      .eq('user_id', user.id)
      .maybeSingle();

    const lastReadAt = readData?.last_read_at;

    if (!lastReadAt) {
      setUnreadCount(count ?? 0);
      return;
    }

    const { count: unread } = await supabase
      .from('channel_post_comments')
      .select('id', { count: 'exact', head: true })
      .eq('post_id', post.id)
      .gt('created_at', lastReadAt);

    setUnreadCount(unread ?? 0);
  }

  function subscribeToComments() {
    const channel = supabase
      .channel(`channel_post_comments:${post.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'channel_post_comments',
          filter: `post_id=eq.${post.id}`,
        },
        () => {
          void fetchCounts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  async function markCommentsRead() {
    if (!user) return;

    await supabase
      .from('channel_post_comment_reads')
      .upsert(
        {
          post_id: post.id,
          user_id: user.id,
          last_read_at: new Date().toISOString(),
        },
        { onConflict: 'post_id,user_id' }
      );

    setUnreadCount(0);
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="flex items-start gap-3 p-4">
        <div className="flex-shrink-0">
          {post.user_profiles?.avatar_url ? (
            <img
              src={post.user_profiles.avatar_url}
              alt={post.user_profiles.username}
              className="h-11 w-11 rounded-full object-cover"
            />
          ) : (
            <div className="h-11 w-11 rounded-full bg-purple-500 flex items-center justify-center text-white text-sm font-bold">
              {post.user_profiles?.username?.[0]?.toUpperCase() || '?'}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                {post.user_profiles?.username || 'Anonymous'}
              </p>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {createdAt}
              </span>
            </div>
          </div>

          {post.content && (
            <p className="text-gray-800 dark:text-gray-200 text-sm whitespace-pre-wrap break-words mb-3">
              {post.content}
            </p>
          )}

          {normalizedMedia.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {normalizedMedia.map((media, idx) => {
                const mediaType = getMediaType(media.url);

                if (mediaType === 'image') {
                  return (
                    <a
                      key={idx}
                      href={media.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <img
                        src={media.url}
                        alt="Post media"
                        className="max-h-64 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                      />
                    </a>
                  );
                }

                if (mediaType === 'audio') {
                  return (
                    <audio
                      key={idx}
                      controls
                      className="max-w-full rounded-lg"
                      src={media.url}
                    />
                  );
                }

                if (mediaType === 'video') {
                  return (
                    <video
                      key={idx}
                      controls
                      className="max-h-64 rounded-lg"
                      src={media.url}
                    />
                  );
                }

                return (
                  <a
                    key={idx}
                    href={media.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    <FileText size={16} />
                    <span className="text-xs truncate">Файл</span>
                  </a>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <Eye size={16} />
              <span>{(post as any).view_count ?? 0}</span>
            </div>

            <button
              onClick={onLike}
              className={`flex items-center gap-1 transition-colors ${
                isLiked
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400'
              }`}
            >
              <Heart size={16} fill={isLiked ? 'currentColor' : 'none'} />
              <span>{post.like_count || 0}</span>
            </button>

            <button
              onClick={() => {
                setShowComments((prev) => {
                  const next = !prev;
                  if (next) void markCommentsRead();
                  return next;
                });
              }}
              className={`flex items-center gap-1 transition-colors ${
                unreadCount > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-500 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400'
              }`}
            >
              <MessageCircle size={16} />
              <span>{commentCount}</span>
            </button>

            {canDelete && (
              <button
                onClick={onDelete}
                className="text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>

          {showComments && (
            <ChannelPostComments
              postId={post.id}
              onCountChange={(count) => {
                setCommentCount(count);
                if (showComments) {
                  setUnreadCount(0);
                } else if (user) {
                  void fetchCounts();
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
