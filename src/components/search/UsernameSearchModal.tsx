import { useState, useEffect } from 'react';
import { X, Search, Loader, User, Users as UsersIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface UsernameSearchModalProps {
  onClose: () => void;
  onSelectUser?: (conversationId: string) => void;
  onSelectChannel?: (channelId: string) => void;
}

interface SearchResultUser {
  id: string;
  username: string;
  is_admin: boolean;
  type: 'user';
}

interface SearchResultChannel {
  id: string;
  username: string;
  name: string;
  description: string | null;
  type: 'channel';
}

type SearchResult = SearchResultUser | SearchResultChannel;

export function UsernameSearchModal({
  onClose,
  onSelectUser,
  onSelectChannel,
}: UsernameSearchModalProps) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        searchByUsername();
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  async function searchByUsername() {
    if (!searchQuery.trim()) return;

    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('search_by_username', {
        search_query: searchQuery.trim(),
      } as any);

      if (error) throw error;

      const result = data as { users: SearchResultUser[]; channels: SearchResultChannel[] };
      const combined: SearchResult[] = [...result.users, ...result.channels];
      setResults(combined);
    } catch (err: any) {
      console.error('Search error:', err);
      alert('Ошибка поиска: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectUser(userId: string) {
    if (!user || !onSelectUser) return;

    try {
      const { data: conversationId, error } = await supabase.rpc(
        'get_or_create_conversation',
        {
          user1_id: user.id,
          user2_id: userId,
        } as any
      );

      if (error) throw error;

      onSelectUser(conversationId as string);
      onClose();
    } catch (err: any) {
      alert('Ошибка создания диалога: ' + err.message);
    }
  }

  async function handleSelectChannel(channelId: string) {
    if (!onSelectChannel) return;

    onSelectChannel(channelId);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Поиск по username
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-4">
          <div className="relative mb-4">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              size={20}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Введите username..."
              autoFocus
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader className="animate-spin text-blue-600" size={32} />
              </div>
            ) : searchQuery.trim() === '' ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
                Введите username для поиска
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
                Ничего не найдено
              </div>
            ) : (
              <div className="space-y-2">
                {results.map((result) => {
                  if (result.type === 'user') {
                    return (
                      <button
                        key={`user-${result.id}`}
                        onClick={() => handleSelectUser(result.id)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                          {result.username[0].toUpperCase()}
                        </div>
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <User size={16} className="text-gray-500 dark:text-gray-400" />
                            <span className="font-semibold text-gray-900 dark:text-white">
                              @{result.username}
                            </span>
                            {result.is_admin && (
                              <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded">
                                admin
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Пользователь
                          </p>
                        </div>
                      </button>
                    );
                  } else {
                    return (
                      <button
                        key={`channel-${result.id}`}
                        onClick={() => handleSelectChannel(result.id)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                      >
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                          {result.name[0].toUpperCase()}
                        </div>
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <UsersIcon size={16} className="text-gray-500 dark:text-gray-400" />
                            <span className="font-semibold text-gray-900 dark:text-white">
                              @{result.username}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {result.name}
                          </p>
                          {result.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                              {result.description}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  }
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
