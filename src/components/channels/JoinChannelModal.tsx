import { useState } from 'react';
import { X, Rss } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface JoinChannelModalProps {
  onClose: () => void;
  onChannelJoined: () => void;
}

export function JoinChannelModal({ onClose, onChannelJoined }: JoinChannelModalProps) {
  const { user } = useAuth();
  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  const extractInviteCode = (value: string) => {
    const trimmed = value.trim();

    if (!trimmed) return '';

    try {
      const parsed = new URL(trimmed);
      return new URLSearchParams(parsed.search).get('channel') || trimmed;
    } catch {
      return trimmed;
    }
  };

  async function handleJoinChannel(e: React.FormEvent) {
    e.preventDefault();

    const code = extractInviteCode(inviteCode);

    if (!user || !code) return;

    setJoining(true);
    setError('');

    try {
      const { data, error: joinError } = await supabase.rpc('join_channel_by_code' as any, {
        code,
        joining_user_id: user.id,
      });

      if (joinError) throw joinError;

      const result = data as { success: boolean; error?: string };

      if (!result.success) {
        setError(result.error || 'Ошибка при подписке на канал');
        setJoining(false);
        return;
      }

      onChannelJoined();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Ошибка при подписке на канал');
      setJoining(false);
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
            Подписаться на канал
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleJoinChannel} className="p-4 space-y-4">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-400 to-purple-600 rounded-full flex items-center justify-center text-white">
              <Rss size={40} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Код приглашения
            </label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => {
                setInviteCode(e.target.value);
                setError('');
              }}
              placeholder="Введите код или вставьте ссылку..."
              autoFocus
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Можно вставить код приглашения или полную ссылку на канал
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!inviteCode.trim() || joining}
              className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
            >
              {joining ? 'Подписка...' : 'Подписаться'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
