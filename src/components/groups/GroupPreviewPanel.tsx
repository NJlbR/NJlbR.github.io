import { Lock, LogIn, Users, Globe, ArrowRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface GroupPreview {
  id: string;
  name: string;
  invite_code: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  is_public: boolean;
  members_count: number;
  is_member: boolean;
}

interface GroupPreviewPanelProps {
  inviteCode?: string | null;
  groupId?: string | null;
  onNavigateAuth: () => void;
  onJoinSuccess: (groupId: string) => void;
}

export function GroupPreviewPanel({
  inviteCode = null,
  groupId = null,
  onNavigateAuth,
  onJoinSuccess,
}: GroupPreviewPanelProps) {
  const { user, profile } = useAuth();
  const [group, setGroup] = useState<GroupPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetchPreview();
  }, [inviteCode, groupId, user?.id]);

  async function fetchPreview() {
    if (!inviteCode && !groupId) {
      setGroup(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const { data, error: previewError } = await supabase.rpc('get_group_preview' as any, {
      group_code: inviteCode,
      group_id: groupId,
      viewer_id: user?.id ?? null,
    });

    if (previewError) {
      setError(previewError.message);
      setGroup(null);
      setLoading(false);
      return;
    }

    const result = data as { success: boolean; error?: string; group?: GroupPreview };

    if (!result?.success || !result.group) {
      setError(result?.error || 'Группа не найдена');
      setGroup(null);
      setLoading(false);
      return;
    }

    setGroup(result.group);
    setLoading(false);
  }

  async function handleJoin() {
    if (!group) return;

    if (!user) {
      onNavigateAuth();
      return;
    }

    if (!profile || profile.approval_status !== 'approved') {
      setError('Для вступления в группу учетная запись должна быть одобрена');
      return;
    }

    setJoining(true);
    setError('');

    try {
      const { data, error: joinError } = group.is_public
        ? await supabase.rpc('join_public_group' as any, {
            target_group_id: group.id,
            joining_user_id: user.id,
          })
        : await supabase.rpc('join_group_by_code', {
            code: group.invite_code,
            joining_user_id: user.id,
          } as any);

      if (joinError) throw joinError;

      const result = data as { success: boolean; group_id?: string; error?: string };

      if (!result.success || !result.group_id) {
        setError(result.error || 'Не удалось вступить в группу');
        setJoining(false);
        return;
      }

      onJoinSuccess(result.group_id);
    } catch (err: any) {
      setError(err.message || 'Не удалось вступить в группу');
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
        Загрузка группы...
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 text-center text-gray-500 dark:text-gray-400">
        {error || 'Группа не найдена'}
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-xl bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center text-white mb-4">
            <Users size={36} />
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 mb-4">
            {group.is_public ? <Globe size={16} /> : <Lock size={16} />}
            {group.is_public ? 'Открытая группа' : 'Закрытая группа'}
          </div>

          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            {group.name}
          </h2>

          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            {group.members_count} участников
          </p>

          {!group.is_public && (
            <div className="w-full rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 p-4 mb-6 text-left">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Код приглашения
              </p>
              <code className="block font-mono text-sm text-gray-900 dark:text-white break-all">
                {group.invite_code}
              </code>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Эту группу можно открыть по ссылке или вступить в неё по коду.
              </p>
            </div>
          )}

          {error && (
            <div className="w-full p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          {group.is_member ? (
            <button
              type="button"
              onClick={() => onJoinSuccess(group.id)}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
            >
              Открыть группу
              <ArrowRight size={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleJoin}
              disabled={joining}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors font-medium"
            >
              {!user ? <LogIn size={18} /> : <Users size={18} />}
              {!user ? 'Войти и вступить' : joining ? 'Вступление...' : 'Вступить'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
