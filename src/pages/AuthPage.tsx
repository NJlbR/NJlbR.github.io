import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { LogIn, UserPlus, Key, ArrowLeft, MailCheck, RefreshCw } from 'lucide-react';

interface AuthPageProps {
  onAuthSuccess: () => void;
  onBack: () => void;
}

export function AuthPage({ onAuthSuccess, onBack }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'change-password'>('login');
  const [registerStep, setRegisterStep] = useState<'form' | 'otp'>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [username, setUsername] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingUsername, setPendingUsername] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const validateUsername = (value: string): string | null => {
    if (value.length < 4) {
      return 'Username должен быть не менее 4 символов';
    }
    if (value.length > 30) {
      return 'Username не может быть длиннее 30 символов';
    }
    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      return 'Username может содержать только латиницу, цифры и подчеркивания';
    }
    const reservedNames = ['admin', 'administrator', 'root', 'system', 'moderator', 'support'];
    if (reservedNames.includes(value.toLowerCase())) {
      return 'Это имя зарезервировано';
    }
    return null;
  };

  async function ensureUserProfile(userId: string, profileUsername: string, profileEmail: string) {
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (existingProfile) {
      return null;
    }

    const { error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        id: userId,
        username: profileUsername,
        email: profileEmail,
      });

    return profileError;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (authError) throw authError;

      if (authData.user) {
        let { data: profile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', authData.user.id)
          .maybeSingle();

        const metaUsername = typeof authData.user.user_metadata?.username === 'string'
          ? authData.user.user_metadata.username
          : '';

        if (!profile && metaUsername) {
          const createError = await ensureUserProfile(
            authData.user.id,
            metaUsername,
            authData.user.email || normalizedEmail
          );
          if (!createError) {
            const { data: createdProfile } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('id', authData.user.id)
              .maybeSingle();
            profile = createdProfile;
          }
        }

        if (!profile) {
          await supabase.auth.signOut();
          throw new Error('Профиль пользователя не найден');
        }

        setTimeout(() => {
          onAuthSuccess();
        }, 100);
      }
    } catch (err: unknown) {
      console.error('Login error:', err);
      const message = err instanceof Error ? err.message : '';
      if (message.toLowerCase().includes('email not confirmed')) {
        setError('Почта не подтверждена. Завершите подтверждение кодом из письма.');
      } else {
        setError('Ошибка входа. Проверьте email и пароль.');
      }
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();

    const usernameError = validateUsername(normalizedUsername);
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

    setLoading(true);

    try {
      const { data: isBlocked } = await supabase.rpc('is_registration_blocked', {
        check_username: normalizedUsername,
        check_email: normalizedEmail,
      } as never);

      if (isBlocked) {
        setError('Регистрация временно заблокирована. Попробуйте позже.');
        setLoading(false);
        return;
      }

      const { data: bannedUsername } = await supabase.rpc('is_banned', {
        check_username: normalizedUsername,
        check_email: null,
      } as never);

      if (bannedUsername) {
        setError('Этот username недоступен.');
        setLoading(false);
        return;
      }

      const { data: bannedEmail } = await supabase.rpc('is_banned', {
        check_username: null,
        check_email: normalizedEmail,
      } as never);

      if (bannedEmail) {
        setError('Этот email недоступен.');
        setLoading(false);
        return;
      }

      const { data: isTaken } = await supabase.rpc('is_username_taken' as never, {
        check_username: normalizedUsername,
      } as never);

      if (isTaken) {
        setError('Этот username уже занят.');
        setLoading(false);
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            username: normalizedUsername,
          },
        },
      });

      if (authError) {
        if (authError.message.toLowerCase().includes('already registered')) {
          setError('Email уже зарегистрирован.');
        } else if (authError.message.toLowerCase().includes('rate limit')) {
          setError('Слишком много попыток. Подождите немного и попробуйте снова.');
        } else {
          console.error('Signup error:', authError);
          setError('Ошибка при регистрации. Попробуйте позже.');
        }
        setLoading(false);
        return;
      }

      if (authData.user && Array.isArray(authData.user.identities) && authData.user.identities.length === 0) {
        setError('Этот email уже зарегистрирован.');
        setLoading(false);
        return;
      }

      if (authData.session && authData.user) {
        const profileError = await ensureUserProfile(
          authData.user.id,
          normalizedUsername,
          normalizedEmail
        );

        if (profileError) {
          console.error('Profile creation error:', profileError);
          if (profileError.code === '23505') {
            setError('Этот username уже занят.');
          } else {
            setError('Ошибка при создании профиля. Попробуйте позже.');
          }
          setLoading(false);
          return;
        }

        await supabase.auth.signOut();
        setMode('login');
        setRegisterStep('form');
        setPassword('');
        setPasswordConfirm('');
        setUsername('');
        setEmail('');
        setInfoMessage('Регистрация успешна! Администратор должен одобрить вашу учетную запись перед тем, как вы сможете оставлять комментарии.');
        setLoading(false);
        return;
      }

      if (authData.user) {
        setPendingEmail(normalizedEmail);
        setPendingUsername(normalizedUsername);
        setOtpCode('');
        setRegisterStep('otp');
        setResendCooldown(60);
        setInfoMessage(`Одноразовый код отправлен на ${normalizedEmail}. Проверьте входящие и папку «Спам».`);
      }
    } catch (err: unknown) {
      console.error('Registration error:', err);
      setError('Ошибка при регистрации. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    const cleanedToken = otpCode.replace(/\s+/g, '').trim();
    if (!/^[a-zA-Z0-9]{6,10}$/.test(cleanedToken)) {
      setError('Введите одноразовый код подтверждения из письма (6–8 символов).');
      return;
    }

    setLoading(true);

    try {
      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        email: pendingEmail,
        token: cleanedToken,
        type: 'signup',
      });

      if (verifyError) {
        console.error('OTP verify error:', verifyError);
        setError('Неверный или просроченный код подтверждения. Проверьте код или запросите новый.');
        setLoading(false);
        return;
      }

      if (verifyData.user) {
        const profileError = await ensureUserProfile(
          verifyData.user.id,
          pendingUsername,
          pendingEmail
        );

        if (profileError) {
          console.error('Profile creation error:', profileError);
          if (profileError.code === '23505') {
            setError('Этот username уже занят.');
          } else {
            setError('Почта подтверждена, но возникла ошибка при создании профиля. Попробуйте войти.');
          }
          setLoading(false);
          return;
        }
      }

      await supabase.auth.signOut();

      setMode('login');
      setRegisterStep('form');
      setOtpCode('');
      setPendingEmail('');
      setPendingUsername('');
      setPassword('');
      setPasswordConfirm('');
      setUsername('');
      setEmail('');
      setInfoMessage('Почта подтверждена и регистрация завершена! Администратор должен одобрить вашу учетную запись перед тем, как вы сможете оставлять комментарии.');
    } catch (err: unknown) {
      console.error('Verify OTP unexpected error:', err);
      setError('Не удалось подтвердить код. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0 || !pendingEmail) return;
    setError('');
    setInfoMessage('');
    setLoading(true);

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: pendingEmail,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (resendError) {
        console.error('Resend OTP error:', resendError);
        setError('Не удалось отправить код повторно. Подождите немного и попробуйте снова.');
      } else {
        setResendCooldown(60);
        setInfoMessage(`Новый одноразовый код отправлен на ${pendingEmail}.`);
      }
    } catch (err: unknown) {
      console.error('Resend OTP unexpected error:', err);
      setError('Ошибка при повторной отправке кода.');
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfoMessage('');

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
        email: email.trim().toLowerCase(),
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

      setEmail('');
      setOldPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setMode('login');
      setInfoMessage('Пароль успешно изменен! Войдите с новым паролем.');
    } catch (err: unknown) {
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
          {mode === 'login'
            ? 'Вход'
            : mode === 'register'
              ? registerStep === 'otp'
                ? 'Подтверждение почты'
                : 'Регистрация'
              : 'Смена пароля'}
        </h1>

        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setRegisterStep('form');
              setError('');
              setInfoMessage('');
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
            type="button"
            onClick={() => {
              setMode('register');
              setRegisterStep('form');
              setError('');
              setInfoMessage('');
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
            type="button"
            onClick={() => {
              setMode('change-password');
              setRegisterStep('form');
              setError('');
              setInfoMessage('');
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

        {infoMessage && (
          <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-lg text-sm">
            {infoMessage}
          </div>
        )}

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

        {mode === 'register' && registerStep === 'form' && (
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

        {mode === 'register' && registerStep === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-900 dark:text-blue-200 flex items-start gap-2.5">
              <MailCheck size={18} className="mt-0.5 flex-shrink-0" />
              <div>
                Мы отправили одноразовый код подтверждения на <strong>{pendingEmail}</strong>.
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Одноразовый код из письма
              </label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\s+/g, ''))}
                placeholder="Введите 6–8 значный код"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center tracking-widest text-lg font-mono"
                required
                minLength={6}
                maxLength={10}
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
              {loading ? 'Проверка кода...' : 'Подтвердить код'}
            </button>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={loading || resendCooldown > 0}
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 disabled:text-gray-400 dark:text-blue-400 dark:disabled:text-gray-500 transition-colors"
              >
                <RefreshCw size={14} />
                {resendCooldown > 0
                  ? `Отправить повторно (${resendCooldown}с)`
                  : 'Отправить код повторно'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setRegisterStep('form');
                  setOtpCode('');
                  setError('');
                  setInfoMessage('');
                }}
                className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                Назад к форме
              </button>
            </div>
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
