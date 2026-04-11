import { useState, useEffect } from 'react';
import { Plus, Search, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Database } from '../../lib/database.types';

type Group = Database['public']['Tables']['groups']['Row'] & {
  is_public?: boolean | null;
  members_count?: number;
  is_member?: boolean;
};

interface GroupsListProps {
  onSelectGroup: (groupId: string) => void;
  onPreviewGroup: (params: { groupId?: string | null; inviteCode?: string | null }) => void;
  selectedGroupId: string | null;
  onNewGroup: () => void;
  onJoinGroup: () => void;
  onNavigateAuth: () => void;
  onGroupJoined: (groupId: string) => void;
}

export function GroupsList({
  onSelectGroup,
  onPreviewGroup,
  selectedGroupId,
  onNewGroup,
  onJoinGroup,
  onNavigateAuth,
  onGroupJoined,
}: GroupsListProps) {
  const { user, profile } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [joiningGroupId, setJoiningGroupId] = useState<string | null>(null);

  useEffect(() => {
    void fetchGroups();
    const cleanup = subscribeToMessages();
    return cleanup;
  }, [user?.id]);

  async function fetchGroups() {
    setLoading(true);

    const { data, error } = await supabase.rpc('list_visible_groups' as any, {
      viewer_id: user?.id ?? null,
    });

    if (error || !data) {
      setGroups([]);
      setLoading(false);
      return;
    }

    setGroups(data as Group[]);
    setLoading(false);
  }

  function subscribeToMessages() {
    const channel = supabase
      .channel('group-messages-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_messages',
        },
        () => {
          void fetchGroups();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_members',
        },
        () => {
          void fetchGroups();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'groups',
        },
        () => {
          void fetchGroups();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  const filteredGroups = groups.filter((group) => {
    const name = group.name.toLowerCase();
    return name.includes(searchQuery.toLowerCase());
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

  async function handleJoinPublicGroup(groupId: string) {
    if (!user) {
      onNavigateAuth();
      return;
    }

    if (!profile || profile.approval_status !== 'approved') {
      alert('Для вступления в группу учетная запись должна быть одобрена');
      return;
    }

    setJoiningGroupId(groupId);

    try {
      const { data, error } = await supabase.rpc('join_public_group' as any, {
        target_group_id: groupId,
        joining_user_id: user.id,
      });

      if (error) throw error;

      const result = data as { success: boolean; group_id?: string; error?: string };

      if (!result.success || !result.group_id) {
        alert(result.error || 'Не удалось вступить в группу');
        setJoiningGroupId(null);
        return;
      }

      await fetchGroups();
      onGroupJoined(result.group_id);
    } catch (err: any) {
      alert(err.message || 'Не удалось вступить в группу');
    } finally {
      setJoiningGroupId(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Группы
          </h2>
          <div className="flex gap-2">
            <button
              onClick={onJoinGroup}
              className="px-3 py-2 text-sm font-medium rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              По коду
            </button>
            {user && profile?.approval_status === 'approved' && (
              <button
                onClick={onNewGroup}
                className="px-3 py-2 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors"
              >
                Создать группу
              </button>
            )}
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по группам..."
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
        ) : filteredGroups.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm text-center p-4">
            {searchQuery ? 'Группы не найдены' : 'Пока нет доступных групп'}
          </div>
        ) : (
          <div>
            {filteredGroups.map((group) => {
              const isSelected = group.id === selectedGroupId;
              const canOpenChat = !!group.is_member;
              const canJoinDirectly = !group.is_member && !!group.is_public;

              return (
                <div
                  key={group.id}
                  className={`w-full flex items-start gap-3 p-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                    isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (canOpenChat) {
                        onSelectGroup(group.id);
                        return;
                      }

                      onPreviewGroup({
                        groupId: group.id,
                        inviteCode: group.is_public ? null : group.invite_code,
                      });
                    }}
                    className="flex items-start gap-3 flex-1 min-w-0 text-left"
                  >
                    <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
                      <Users size={24} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-semibold text-gray-900 dark:text-white truncate">
                          {group.name}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                          {formatTime(group.updated_at)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                          {group.is_member
                            ? 'Вы состоите в группе'
                            : group.is_public
                              ? 'Открытая группа'
                              : 'Закрытая группа'}
                        </p>
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                          {group.members_count || 0} участн.
                        </span>
                      </div>
                    </div>
                  </button>

                  {canJoinDirectly && (
                    <button
                      type="button"
                      onClick={() => void handleJoinPublicGroup(group.id)}
                      disabled={joiningGroupId === group.id}
                      className="self-center px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors text-sm font-medium"
                    >
                      {joiningGroupId === group.id ? '...' : 'Вступить'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
