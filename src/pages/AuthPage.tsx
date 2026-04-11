import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { LogIn, UserPlus, Key, ArrowLeft } from 'lucide-react';

interface AuthPageProps {
  onAuthSuccess: () => void;
  onBack: () => void;
}

export function AuthPage({ onAuthSuccess, onBack }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'change-password'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [username, setUsername] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validateUsername = (username: string): string | null => {
    if (username.length < 4) {
      return 'Username должен быть не менее 4 символов';
    }
    if (username.length > 30) {
      return 'Username не может быть длиннее 30 символов';
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return 'Username может содержать только латиницу, цифры и подчеркивания';
    }
    const reservedNames = ['admin', 'administrator', 'root', 'system', 'moderator', 'support'];
    if (reservedNames.includes(username.toLowerCase())) {
      return 'Это имя зарезервировано';
    }
    return null;
  };

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      if (authData.user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', authData.user.id)
          .maybeSingle();

        if (!profile) {
          await supabase.auth.signOut();
          throw new Error('Профиль пользователя не найден');
        }

        // Небольшая задержка для завершения обновления состояния
        setTimeout(() => {
          onAuthSuccess();
        }, 100);
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError('Ошибка входа. Проверьте email и пароль.');
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const usernameError = validateUsername(username);
    if (usernameError) {
      setError(usernameError);
      return;
    }

    if (password !== passwordConfirm) {
      setError('Пароли не совпадают');
      return;
    }

    if (password.length < 12) {
      setError('Пароль должен быть не менее 12 символов');
      return;
    }

    if (password.length > 100) {
      setError('Пароль слишком длинный (максимум 100 символов)');
      return;
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
      setError('Пароль должен содержать заглавные и строчные буквы, и цифры');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Неверный формат email');
      return;
    }

    setLoading(true);

    try {
      const { data: isBlocked } = await supabase.rpc('is_registration_blocked', {
        check_username: username,
        check_email: email,
      } as any);

      if (isBlocked) {
        setError('Регистрация временно заблокирована. Попробуйте позже.');
        setLoading(false);
        return;
      }

      const { data: bannedUsername } = await supabase.rpc('is_banned', {
        check_username: username,
        check_email: null,
      } as any);

      if (bannedUsername) {
        setError('Этот username недоступен.');
        setLoading(false);
        return;
      }

      const { data: bannedEmail } = await supabase.rpc('is_banned', {
        check_username: null,
        check_email: email,
      } as any);

      if (bannedEmail) {
        setError('Этот email недоступен.');
        setLoading(false);
        return;
      }

      // Проверяем занят ли username
      const { data: isTaken } = await supabase.rpc('is_username_taken', {
        check_username: username,
      } as any);

      if (isTaken) {
        setError('Этот username уже занят.');
        setLoading(false);
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          setError('Email уже зарегистрирован.');
        } else {
          console.error('Signup error:', authError);
          setError('Ошибка при регистрации. Попробуйте позже.');
        }
        setLoading(false);
        return;
      }

      if (authData.user) {
        const { error: profileError } = await supabase
          .from('user_profiles')
          .insert({
            id: authData.user.id,
            username: username,
            email: email,
          });

        if (profileError) {
          console.error('Profile creation error:', profileError);

          // Проверяем код ошибки для более точного сообщения
          if (profileError.code === '23505') {
            setError('Этот username уже занят.');
          } else {
            setError('Ошибка при создании профиля. Попробуйте позже.');
          }
          setLoading(false);
          return;
        }

        // Выходим из аккаунта после успешной регистрации
        await supabase.auth.signOut();

        alert('Регистрация успешна! Администратор должен одобрить вашу учетную запись перед тем, как вы сможете оставлять комментарии.');

        setMode('login');
        setPassword('');
        setPasswordConfirm('');
        setUsername('');
        setEmail('');
        setLoading(false);
      }
    } catch (err: any) {
      console.error('Registration error:', err);
      setError('Ошибка при регистрации. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== newPasswordConfirm) {
      setError('Новые пароли не совпадают');
      return;
    }

    if (newPassword.length < 12) {
      setError('Новый пароль должен быть не менее 12 символов');
      return;
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      setError('Пароль должен содержать заглавные и строчные буквы, и цифры');
      return;
    }

    setLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: oldPassword,
      });

      if (signInError) {
        console.error('Sign in error:', signInError);
        setError('Неверный email или старый пароль.');
        setLoading(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        console.error('Password update error:', updateError);
        setError('Ошибка при смене пароля. Попробуйте позже.');
        setLoading(false);
        return;
      }

      await supabase.auth.signOut();

      alert('Пароль успешно изменен! Войдите с новым паролем.');
      setEmail('');
      setOldPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setMode('login');
    } catch (err: any) {
      console.error('Change password error:', err);
      setError('Ошибка при смене пароля. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 px-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 sm:p-8 w-full max-w-md">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors"
        >
          <ArrowLeft size={16} />
          Назад на главную
        </button>

        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">
          {mode === 'login' ? 'Вход' : mode === 'register' ? 'Регистрация' : 'Смена пароля'}
        </h1>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => {
              setMode('login');
              setError('');
            }}
            className={`flex-1 py-2 rounded-lg transition-colors ${
              mode === 'login'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <LogIn size={18} />
              <span className="hidden sm:inline">Вход</span>
            </div>
          </button>
          <button
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className={`flex-1 py-2 rounded-lg transition-colors ${
              mode === 'register'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <UserPlus size={18} />
              <span className="hidden sm:inline">Регистрация</span>
            </div>
          </button>
          <button
            onClick={() => {
              setMode('change-password');
              setError('');
            }}
            className={`flex-1 py-2 rounded-lg transition-colors ${
              mode === 'change-password'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Key size={18} />
              <span className="hidden sm:inline">Пароль</span>
            </div>
          </button>
        </div>

        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Пароль
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
              />
            </div>

            {error && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
            >
              {loading ? 'Вход...' : 'Войти'}
            </button>
          </form>
        )}

        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Username (4+ символов, латиница, цифры, _)
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
                minLength={4}
                maxLength={30}
                pattern="[a-zA-Z0-9_]+"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Пароль (мин. 12 символов, заглавные, строчные, цифры)
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
                minLength={12}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Подтвердите пароль
              </label>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
                minLength={6}
              />
            </div>

            {error && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
            >
              {loading ? 'Регистрация...' : 'Зарегистрироваться'}
            </button>
          </form>
        )}

        {mode === 'change-password' && (
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Старый пароль
              </label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Новый пароль (мин. 12 символов, заглавные, строчные, цифры)
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
                minLength={12}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Подтвердите новый пароль
              </label>
              <input
                type="password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                required
                minLength={6}
              />
            </div>

            {error && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
            >
              {loading ? 'Изменение...' : 'Изменить пароль'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
