import { useState, useEffect } from 'react';
import { Plus, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Database } from '../../lib/database.types';

type Conversation = Database['public']['Tables']['conversations']['Row'] & {
  participant_profile?: {
    id: string;
    username: string;
    is_admin: boolean;
    email?: string;
  };
  last_message?: {
    content: string | null;
    sender_id: string;
    created_at: string;
  };
  unread_count?: number;
};

interface ConversationsListProps {
  onSelectConversation: (conversationId: string) => void;
  selectedConversationId: string | null;
  onNewMessage: () => void;
}

export function ConversationsList({
  onSelectConversation,
  selectedConversationId,
  onNewMessage,
}: ConversationsListProps) {
  const { user, profile } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (user) {
      fetchConversations();
      const cleanup = subscribeToMessages();
      return cleanup;
    }
  }, [user]);

  async function fetchConversations() {
    if (!user) return;

    setLoading(true);

    const { data: convs, error } = await supabase
      .from('conversations')
      .select('*')
      .or(`participant1_id.eq.${user.id},participant2_id.eq.${user.id}`)
      .order('last_message_at', { ascending: false });

    if (error) {
      console.error('Error fetching conversations:', error);
      setLoading(false);
      return;
    }

    if (!convs) {
      setLoading(false);
      return;
    }

    const conversationsWithData = await Promise.all(
      convs.map(async (conv) => {
        const otherUserId = conv.participant1_id === user.id ? conv.participant2_id : conv.participant1_id;

        const selectFields = profile?.is_admin ? 'id, username, is_admin, email' : 'id, username, is_admin';

        const [profileRes, messageRes, unreadRes] = await Promise.all([
          supabase
            .from('user_profiles')
            .select(selectFields)
            .eq('id', otherUserId)
            .maybeSingle(),
          supabase
            .from('messages')
            .select('content, sender_id, created_at')
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .eq('is_read', false)
            .neq('sender_id', user.id),
        ]);

        return {
          ...conv,
          participant_profile: profileRes.data || undefined,
          last_message: messageRes.data || undefined,
          unread_count: unreadRes.count || 0,
        };
      })
    );

    setConversations(conversationsWithData);
    setLoading(false);
  }

  function subscribeToMessages() {
    if (!user) return;

    const channel = supabase
      .channel('conversations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
        },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  const filteredConversations = conversations.filter((conv) => {
    const username = conv.participant_profile?.username?.toLowerCase() || '';
    return username.includes(searchQuery.toLowerCase());
  });

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'только что';
    if (diffMins < 60) return `${diffMins}м назад`;
    if (diffHours < 24) return `${diffHours}ч назад`;
    if (diffDays === 1) return 'вчера';
    if (diffDays < 7) return `${diffDays}д назад`;

    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  const truncateMessage = (text: string | null, maxLength: number) => {
    if (!text) return 'Медиафайл';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
            Сообщения
          </h2>
          <button
            onClick={onNewMessage}
            className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
            title="Новое сообщение"
          >
            <Plus size={20} className="sm:w-6 sm:h-6" />
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по диалогам..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse flex items-center gap-3 p-3 rounded-lg bg-gray-100 dark:bg-gray-700">
                <div className="w-12 h-12 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-2/3 mb-2"></div>
                  <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm text-center p-4">
            {searchQuery ? 'Диалоги не найдены' : 'Нет диалогов.\nНачните новый разговор!'}
          </div>
        ) : (
          <div>
            {filteredConversations.map((conv) => {
              const isSelected = conv.id === selectedConversationId;
              const isUnread = (conv.unread_count || 0) > 0;

              return (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                  className={`w-full flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                    isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <div className="w-11 h-11 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 text-sm sm:text-base">
                    {conv.participant_profile?.username?.[0]?.toUpperCase() || '?'}
                  </div>

                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className={`font-semibold text-gray-900 dark:text-white truncate text-sm sm:text-base ${isUnread ? 'font-bold' : ''}`}>
                          {conv.participant_profile?.username || 'Пользователь'}
                        </span>
                        {conv.participant_profile?.is_admin && (
                          <span className="px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded flex-shrink-0">
                            admin
                          </span>
                        )}
                      </div>
                      {conv.last_message && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-1.5">
                          {formatTime(conv.last_message.created_at)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-1.5">
                      <p className={`text-xs sm:text-sm truncate flex-1 ${isUnread ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                        {conv.last_message ? (
                          <>
                            {conv.last_message.sender_id === user?.id && 'Вы: '}
                            {truncateMessage(conv.last_message.content, 25)}
                          </>
                        ) : (
                          'Новый диалог'
                        )}
                      </p>
                      {isUnread && (
                        <span className="px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full flex-shrink-0 min-w-[20px] text-center">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>

                    {profile?.is_admin && conv.participant_profile?.email && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {conv.participant_profile.email}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
