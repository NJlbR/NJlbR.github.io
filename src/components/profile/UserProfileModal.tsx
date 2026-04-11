import { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface UserProfileModalProps {
  onClose: () => void;
  onProfileUpdated: () => void;
}

export function UserProfileModal({ onClose, onProfileUpdated }: UserProfileModalProps) {
  const { user, profile } = useAuth();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usernameValidation, setUsernameValidation] = useState<{
    valid: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (profile) {
      setUsername(profile.username);
    }
  }, [profile]);

  const validateUsername = async (value: string) => {
    if (!value) {
      setUsernameValidation(null);
      return;
    }

    if (value === profile?.username) {
      setUsernameValidation({ valid: true, message: 'Текущий username' });
      return;
    }

    if (value.length < 4) {
      setUsernameValidation({ valid: false, message: 'Минимум 4 символа' });
      return;
    }

    if (!/^[a-z0-9_]+$/.test(value)) {
      setUsernameValidation({
        valid: false,
        message: 'Только буквы, цифры и подчеркивание',
      });
      return;
    }

    try {
      const { data } = await supabase.rpc('is_username_available', {
        username_to_check: value,
      } as any);

      if (data) {
        setUsernameValidation({ valid: true, message: 'Доступен' });
      } else {
        setUsernameValidation({ valid: false, message: 'Уже занят' });
      }
    } catch (err) {
      setUsernameValidation({ valid: false, message: 'Ошибка проверки' });
    }
  };

  const handleUsernameChange = (value: string) => {
    const normalized = value.toLowerCase();
    setUsername(normalized);
    validateUsername(normalized);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!username) {
      setError('Введите username');
      return;
    }

    if (username === profile?.username) {
      onClose();
      return;
    }

    if (!usernameValidation?.valid) {
      setError('Выберите доступный username');
      return;
    }

    setLoading(true);

    try {
      const { data, error: updateError } = await supabase.rpc('update_user_username', {
        new_username: username,
      } as any);

      if (updateError) throw updateError;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        setError(result.error || 'Ошибка изменения username');
        setLoading(false);
        return;
      }

      onProfileUpdated();
      onClose();
      window.location.reload();
    } catch (err: any) {
      console.error('Error updating username:', err);
      setError(err.message || 'Ошибка при обновлении username');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Редактировать профиль
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
              Username
            </label>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="например, my_username"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                maxLength={30}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {usernameValidation && (
                <div
                  className={`flex items-center gap-2 text-sm ${
                    usernameValidation.valid
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {usernameValidation.valid ? (
                    <CheckCircle size={16} />
                  ) : (
                    <AlertCircle size={16} />
                  )}
                  {usernameValidation.message}
                </div>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400">
                4+ символа, только буквы, цифры и подчеркивание
              </p>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
              <AlertCircle
                size={18}
                className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5"
              />
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={loading || (usernameValidation && !usernameValidation.valid)}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
