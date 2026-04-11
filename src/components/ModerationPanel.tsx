import { useState, useEffect } from 'react';
import { Search, X, Clock, Ban, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';

type UserModeration = Database['public']['Tables']['user_moderation']['Row'] & {
  user_profiles?: {
    username: string;
  };
  moderated_by_profile?: {
    username: string;
  };
};

export function ModerationPanel() {
  const [moderations, setModerations] = useState<UserModeration[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'active' | 'expired'>('all');

  useEffect(() => {
    fetchModerations();
  }, []);

  async function fetchModerations() {
    setLoading(true);

    const { data, error } = await supabase
      .from('user_moderation')
      .select(`
        *,
        user_profiles!user_moderation_user_id_fkey (
          username
        ),
        moderated_by_profile:user_profiles!user_moderation_moderated_by_fkey (
          username
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching moderations:', error);
      setLoading(false);
      return;
    }

    if (data) {
      setModerations(data as any);
    }

    setLoading(false);
  }

  async function handleRemoveModeration(moderationId: string) {
    if (!confirm('Отменить наказание?')) return;

    const { error } = await supabase
      .from('user_moderation')
      .update({ is_active: false })
      .eq('id', moderationId);

    if (error) {
      alert('Ошибка: ' + error.message);
    } else {
      alert('Наказание отменено');
      fetchModerations();
    }
  }


  const filteredModerations = moderations.filter((mod) => {
    const username = mod.user_profiles?.username?.toLowerCase() || '';
    const query = searchQuery.toLowerCase();
    const matchesSearch = username.includes(query);

    const isActive = mod.is_active && (
      mod.moderation_type === 'ban' ||
      (mod.expires_at && new Date(mod.expires_at) > new Date())
    );

    if (filterType === 'active') {
      return matchesSearch && isActive;
    } else if (filterType === 'expired') {
      return matchesSearch && !isActive;
    }

    return matchesSearch;
  });

  const getModerationLabel = (type: string) => {
    const labels: Record<string, string> = {
      mute_1h: 'Мут 1 час',
      mute_6h: 'Мут 6 часов',
      mute_24h: 'Мут 24 часа',
      ban: 'Перманентный бан',
    };
    return labels[type] || type;
  };

  const getModerationColor = (type: string) => {
    const colors: Record<string, string> = {
      mute_1h: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
      mute_6h: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
      mute_24h: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
      ban: 'bg-gray-800 dark:bg-gray-600 text-white',
    };
    return colors[type] || 'bg-gray-100';
  };

  const getTimeRemaining = (expiresAt: string | null) => {
    if (!expiresAt) return null;

    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();

    if (diff <= 0) return 'Истекло';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `Осталось ${hours}ч ${minutes}м`;
    }
    return `Осталось ${minutes}м`;
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
          <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        Панель наказаний
      </h2>

      <div className="space-y-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по username..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setFilterType('all')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filterType === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Все ({moderations.length})
          </button>
          <button
            onClick={() => setFilterType('active')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filterType === 'active'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Активные ({moderations.filter(m =>
              m.is_active && (m.moderation_type === 'ban' || (m.expires_at && new Date(m.expires_at) > new Date()))
            ).length})
          </button>
          <button
            onClick={() => setFilterType('expired')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filterType === 'expired'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Истекшие ({moderations.filter(m => !m.is_active).length})
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {filteredModerations.length === 0 ? (
          <p className="text-center text-gray-600 dark:text-gray-400 py-8">
            {searchQuery ? 'Ничего не найдено' : 'Наказаний пока нет'}
          </p>
        ) : (
          filteredModerations.map((mod) => {
            const isActive = mod.is_active && (
              mod.moderation_type === 'ban' ||
              (mod.expires_at && new Date(mod.expires_at) > new Date())
            );
            const timeRemaining = getTimeRemaining(mod.expires_at);

            return (
              <div
                key={mod.id}
                className={`p-4 rounded-lg border-2 ${
                  isActive
                    ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10'
                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="font-bold text-gray-900 dark:text-white">
                        {mod.user_profiles?.username || 'Пользователь удален'}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getModerationColor(mod.moderation_type)}`}>
                        {getModerationLabel(mod.moderation_type)}
                      </span>
                      {isActive ? (
                        <span className="px-2 py-1 bg-red-600 text-white text-xs rounded-full flex items-center gap-1">
                          <Ban size={12} />
                          Активно
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-400 text-white text-xs rounded-full flex items-center gap-1">
                          <CheckCircle size={12} />
                          Неактивно
                        </span>
                      )}
                    </div>

                    <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                      <p>
                        Модератор: <span className="font-medium">{mod.moderated_by_profile?.username || 'Система'}</span>
                      </p>
                      <p className="flex items-center gap-1">
                        <Clock size={14} />
                        Выдано: {new Date(mod.created_at).toLocaleString('ru-RU')}
                      </p>
                      {mod.expires_at && (
                        <p className="flex items-center gap-1">
                          <Clock size={14} />
                          {timeRemaining === 'Истекло' ? (
                            <span>Истекло: {new Date(mod.expires_at).toLocaleString('ru-RU')}</span>
                          ) : (
                            <span className="text-orange-600 dark:text-orange-400 font-medium">{timeRemaining}</span>
                          )}
                        </p>
                      )}
                      {mod.reason && (
                        <p>
                          Причина: <span className="font-medium">{mod.reason}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {isActive && (
                    <button
                      onClick={() => handleRemoveModeration(mod.id)}
                      className="ml-3 p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      title="Отменить наказание"
                    >
                      <X size={20} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
