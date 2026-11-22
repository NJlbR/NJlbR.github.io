import { useState, useEffect } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { LogIn, UserPlus, Key, ArrowLeft, Mail, RefreshCw, CheckCircle2 } from 'lucide-react';
import {
  createOtpChallenge,
  isEmailJsConfigured,
  sendVerificationOtpEmail,
  verifyOtpChallenge,
  type OtpChallenge,
} from '../utils/emailVerification';

interface AuthPageProps {
  onAuthSuccess: () => void;
  onBack: () => void;
}

interface PendingRegistration {
  email: string;
  username: string;
  password: string;
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
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [otpChallenge, setOtpChallenge] = useState<OtpChallenge | null>(null);
  const [pendingRegistration, setPendingRegistration] = useState<PendingRegistration | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const resetOtpFlow = () => {
    setOtpChallenge(null);
    setPendingRegistration(null);
    setOtpCode('');
    setResendCooldown(0);
  };

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
    if (!isSupabaseConfigured) {
      setError('Подключение к Supabase не настроено. Проверьте переменные окружения проекта.');
      return;
    }
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
    setSuccessMessage('');

    const normalizedEmail = email.trim().toLowerCase();

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

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Неверный формат email');
      return;
    }

    if (!isSupabaseConfigured) {
      setError('Подключение к Supabase не настроено. Проверьте переменные окружения проекта.');
      return;
    }

    if (!isEmailJsConfigured()) {
      setError('Сервис подтверждения почты не настроен. Обратитесь к администратору.');
      return;
    }

    setLoading(true);

    try {
      const { data: isBlocked } = await supabase.rpc('is_registration_blocked', {
        check_username: username,
        check_email: normalizedEmail,
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
        check_email: normalizedEmail,
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

      const { code, challenge } = await createOtpChallenge(normalizedEmail);
      await sendVerificationOtpEmail({
        email: normalizedEmail,
        username,
        code,
      });

      setPendingRegistration({
        email: normalizedEmail,
        username,
        password,
      });
      setOtpChallenge(challenge);
      setOtpCode('');
      setResendCooldown(60);
    } catch (err: unknown) {
      console.error('OTP send error:', err);
      setError('Не удалось отправить код подтверждения на почту. Проверьте email и попробуйте позже.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtpAndRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!otpChallenge || !pendingRegistration) return;

    setError('');
    setLoading(true);

    try {
      const verification = await verifyOtpChallenge(otpChallenge, otpCode);
      if (!verification.valid) {
        if (verification.reason === 'expired') {
          setError('Срок действия кода истек. Запросите новый код.');
        } else if (verification.reason === 'max_attempts') {
          setError('Превышено количество попыток. Запросите новый код.');
        } else {
          setOtpChallenge((prev) => (prev ? { ...prev, attempts: prev.attempts + 1 } : null));
          if (verification.remainingAttempts === 0) {
            setError('Превышено количество попыток. Запросите новый код.');
          } else {
            setError(`Неверный код подтверждения. Осталось попыток: ${verification.remainingAttempts}`);
          }
        }
        setLoading(false);
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: pendingRegistration.email,
        password: pendingRegistration.password,
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
            username: pendingRegistration.username,
            email: pendingRegistration.email,
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

        resetOtpFlow();
        setMode('login');
        setPassword('');
        setPasswordConfirm('');
        setUsername('');
        setEmail('');
        setSuccessMessage('Почта подтверждена и регистрация успешна! Администратор должен одобрить вашу учетную запись перед тем, как вы сможете оставлять комментарии.');
      }
    } catch (err: unknown) {
      console.error('Registration error:', err);
      setError('Ошибка при регистрации. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    if (!pendingRegistration || resendCooldown > 0 || loading) return;

    setError('');
    setLoading(true);

    try {
      const { code, challenge } = await createOtpChallenge(pendingRegistration.email);
      await sendVerificationOtpEmail({
        email: pendingRegistration.email,
        username: pendingRegistration.username,
        code,
      });

      setOtpChallenge(challenge);
      setOtpCode('');
      setResendCooldown(60);
    } catch (err: unknown) {
      console.error('OTP resend error:', err);
      setError('Не удалось повторно отправить код. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!isSupabaseConfigured) {
      setError('Подключение к Supabase не настроено. Проверьте переменные окружения проекта.');
      return;
    }

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
              setSuccessMessage('');
              resetOtpFlow();
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
              setSuccessMessage('');
              resetOtpFlow();
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
              setSuccessMessage('');
              resetOtpFlow();
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
            {successMessage && (
              <div className="p-3 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg text-sm flex items-start gap-2">
                <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
                <span>{successMessage}</span>
              </div>
            )}

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

        {mode === 'register' && otpChallenge && pendingRegistration && (
          <form onSubmit={handleVerifyOtpAndRegister} className="space-y-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-200 flex items-start gap-2.5">
              <Mail size={18} className="shrink-0 mt-0.5" />
              <div>
                <p>
                  Мы отправили одноразовый 6-значный код на{' '}
                  <span className="font-semibold break-all">{pendingRegistration.email}</span>.
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  Код действителен 10 минут. Проверьте папку «Спам», если письмо не пришло.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Код подтверждения из письма
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center text-xl tracking-[0.4em] font-mono"
                required
                autoFocus
              />
            </div>

            {error && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || otpCode.length !== 6}
              className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
            >
              {loading ? 'Проверка и регистрация...' : 'Подтвердить и зарегистрироваться'}
            </button>

            <div className="flex items-center justify-between gap-2 pt-1 text-sm">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={loading || resendCooldown > 0}
                className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 disabled:text-gray-400 dark:text-blue-400 dark:hover:text-blue-300 dark:disabled:text-gray-500 transition-colors"
              >
                <RefreshCw size={14} />
                {resendCooldown > 0 ? `Отправить снова (${resendCooldown}с)` : 'Отправить код снова'}
              </button>

              <button
                type="button"
                onClick={() => {
                  resetOtpFlow();
                  setError('');
                }}
                disabled={loading}
                className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                Изменить данные
              </button>
            </div>
          </form>
        )}

        {mode === 'register' && (!otpChallenge || !pendingRegistration) && (
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
              {loading ? 'Отправка кода...' : 'Зарегистрироваться'}
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
