import { useState } from 'react';
import { X, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface CreateChannelModalProps {
  onClose: () => void;
  onChannelCreated: () => void;
}

export function CreateChannelModal({ onClose, onChannelCreated }: CreateChannelModalProps) {
  const { user } = useAuth();
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [usernameValidation, setUsernameValidation] = useState<{ valid: boolean; message: string } | null>(null);

  const validateUsername = async (value: string) => {
    if (!value) {
      setUsernameValidation(null);
      return;
    }

    if (value.length < 4) {
      setUsernameValidation({ valid: false, message: 'Минимум 4 символа' });
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      setUsernameValidation({ valid: false, message: 'Только буквы, цифры и подчеркивание' });
      return;
    }

    try {
      const { data } = await supabase.rpc('is_channel_username_available', {
        username_to_check: value
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

    if (!username || !name) {
      setError('Заполните все обязательные поля');
      return;
    }

    if (username.length < 4) {
      setError('Юзернейм должен содержать минимум 4 символа');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Юзернейм может содержать только буквы, цифры и подчеркивание');
      return;
    }

    if (!usernameValidation?.valid) {
      setError('Выберите доступный юзернейм');
      return;
    }

    setLoading(true);

    try {
      const { data, error: rpcError } = await supabase.rpc('create_channel', {
        username_param: username,
        name_param: name,
        description_param: description || null,
        is_private_param: isPrivate
      } as any);

      if (rpcError) throw rpcError;

      if (data) {
        onChannelCreated();
      }
    } catch (err: any) {
      console.error('Error creating channel:', err);
      setError(err.message || 'Ошибка при создании канала');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Создать канал</h2>
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
              Юзернейм канала
            </label>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="например, my_channel"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                maxLength={30}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {usernameValidation && (
                <div className={`flex items-center gap-2 text-sm ${
                  usernameValidation.valid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
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

          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
              Название канала
            </label>
            <input
              type="text"
              placeholder="Например, Мой первый канал"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900 dark:text-white mb-1">
              Описание (необязательно)
            </label>
            <textarea
              placeholder="Описание канала..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div>
            <p className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
              Тип канала
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsPrivate(false)}
                className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                  !isPrivate
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                }`}
              >
                <div className="font-medium">Открытый</div>
                <div className="text-xs mt-1 opacity-80">Виден всем пользователям</div>
              </button>
              <button
                type="button"
                onClick={() => setIsPrivate(true)}
                className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                  isPrivate
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                }`}
              >
                <div className="font-medium">Закрытый</div>
                <div className="text-xs mt-1 opacity-80">Подписка по коду или ссылке</div>
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
              <AlertCircle size={18} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
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
              disabled={loading || !usernameValidation?.valid}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Создание...' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
