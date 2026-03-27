import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, Search, UserCheck, UserX } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Database } from '../lib/database.types';

type UserProfile = Database['public']['Tables']['user_profiles']['Row'];

export function UserApprovalPanel() {
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'pending' | 'all'>('pending');

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);

    const { data: profiles, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching users:', error);
      setLoading(false);
      return;
    }

    if (profiles) {
      setPendingUsers(profiles);
    }

    setLoading(false);
  }

  async function handleApprove(userId: string) {
    if (!confirm('Одобрить этого пользователя?')) return;

    try {
      const { error } = await supabase.rpc('approve_user', { user_id: userId } as any);

      if (error) throw error;

      alert('Пользователь одобрен!');
      fetchUsers();
    } catch (err: any) {
      alert('Ошибка: ' + err.message);
    }
  }

  async function handleReject(userId: string, username: string, email: string) {
    if (!confirm('Отклонить регистрацию? Username и email будут заблокированы на 24 часа.')) return;

    try {
      const { error } = await supabase.rpc('reject_user', {
        user_id: userId,
        block_username: username,
        block_email: email,
      } as any);

      if (error) throw error;

      alert('Пользователь отклонен. Username и email заблокированы на 24 часа.');
      fetchUsers();
    } catch (err: any) {
      alert('Ошибка: ' + err.message);
    }
  }

  const filteredUsers = pendingUsers.filter((user) => {
    const username = user.username.toLowerCase();
    const email = user.email?.toLowerCase() || '';
    const query = searchQuery.toLowerCase();
    const matchesSearch = username.includes(query) || email.includes(query);

    if (filterStatus === 'pending') {
      return matchesSearch && user.approval_status === 'pending';
    }

    return matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="px-3 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-full text-xs font-medium flex items-center gap-1">
            <Clock size={14} />
            Ожидает
          </span>
        );
      case 'approved':
        return (
          <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs font-medium flex items-center gap-1">
            <UserCheck size={14} />
            Одобрен
          </span>
        );
      case 'rejected':
        return (
          <span className="px-3 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full text-xs font-medium flex items-center gap-1">
            <UserX size={14} />
            Отклонен
          </span>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
          <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const pendingCount = pendingUsers.filter(u => u.approval_status === 'pending').length;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Управление пользователями
        </h2>
        {pendingCount > 0 && (
          <span className="px-4 py-2 bg-yellow-500 text-white rounded-full font-bold">
            {pendingCount} ожидают
          </span>
        )}
      </div>

      <div className="space-y-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по username или email..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setFilterStatus('pending')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filterStatus === 'pending'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Ожидают ({pendingCount})
          </button>
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-4 py-2 rounded-lg transition-colors ${
              filterStatus === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            Все ({pendingUsers.length})
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {filteredUsers.length === 0 ? (
          <p className="text-center text-gray-600 dark:text-gray-400 py-8">
            {searchQuery ? 'Ничего не найдено' : 'Пользователей в очереди нет'}
          </p>
        ) : (
          filteredUsers.map((user) => (
            <div
              key={user.id}
              className={`p-4 rounded-lg border-2 ${
                user.approval_status === 'pending'
                  ? 'border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/10'
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="font-bold text-gray-900 dark:text-white text-lg">
                      {user.username}
                    </span>
                    {getStatusBadge(user.approval_status)}
                    {user.is_admin && (
                      <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded-full">
                        admin
                      </span>
                    )}
                  </div>

                  <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <p>
                      Email: <span className="font-medium">{user.email || 'Не указан'}</span>
                    </p>
                    <p className="flex items-center gap-1">
                      <Clock size={14} />
                      Регистрация: {new Date(user.created_at).toLocaleString('ru-RU')}
                    </p>
                    {user.approval_date && (
                      <p className="flex items-center gap-1">
                        <Clock size={14} />
                        {user.approval_status === 'approved' ? 'Одобрен' : 'Отклонен'}: {new Date(user.approval_date).toLocaleString('ru-RU')}
                      </p>
                    )}
                  </div>
                </div>

                {user.approval_status === 'pending' && (
                  <div className="flex gap-2 ml-3 flex-shrink-0">
                    <button
                      onClick={() => handleApprove(user.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium"
                      title="Одобрить пользователя"
                    >
                      <CheckCircle size={18} />
                      <span className="hidden sm:inline">Принять</span>
                    </button>
                    <button
                      onClick={() => handleReject(user.id, user.username, user.email || '')}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
                      title="Отклонить регистрацию"
                    >
                      <XCircle size={18} />
                      <span className="hidden sm:inline">Отклонить</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
