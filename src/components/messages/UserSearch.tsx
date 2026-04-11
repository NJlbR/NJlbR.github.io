import { useState, useEffect } from 'react';
import { X, Search, Loader } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface UserSearchProps {
  onClose: () => void;
  onSelectUser: (conversationId: string) => void;
}

interface SearchResult {
  id: string;
  username: string;
  is_admin: boolean;
}

export function UserSearch({ onClose, onSelectUser }: UserSearchProps) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        searchUsers();
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  async function searchUsers() {
    if (!searchQuery.trim()) return;

    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('search_users_by_username', {
        search_query: searchQuery.trim(),
      } as any);

      if (error) throw error;

      setSearchResults(data || []);
    } catch (err: any) {
      console.error('Search error:', err);
      alert('Ошибка поиска: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectUser(userId: string) {
    if (!user) return;

    setCreating(true);

    try {
      const { data: conversationId, error } = await supabase.rpc('get_or_create_conversation', {
        user1_id: user.id,
        user2_id: userId,
      } as any);

      if (error) throw error;

      // Переход в диалог без перезагрузки
      onSelectUser(conversationId as string);
    } catch (err: any) {
      alert('Ошибка создания диалога: ' + err.message);
    } finally {
      setCreating(false);
    }
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
            Новое сообщение
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
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по username..."
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
            ) : searchResults.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400 text-sm">
                Пользователи не найдены
              </div>
            ) : (
              <div className="space-y-2">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => handleSelectUser(result.id)}
                    disabled={creating}
                    className="w-full flex items-center gap-3 p-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-bold">
                      {result.username[0].toUpperCase()}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {result.username}
                        </span>
                        {result.is_admin && (
                          <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded">
                            admin
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
