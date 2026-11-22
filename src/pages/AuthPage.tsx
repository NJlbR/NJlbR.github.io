import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  generateOtpCode,
  isEmailJsConfigured,
  sendRegistrationOtpEmail,
} from '../lib/emailjs';
import {
  LogIn,
  UserPlus,
  Key,
  ArrowLeft,
  MailCheck,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';

interface AuthPageProps {
  onAuthSuccess: () => void;
  onBack: () => void;
}

interface PendingOtpState {
  email: string;
  code: string;
  expiresAt: number;
  attemptsLeft: number;
}

const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;

export function AuthPage({ onAuthSuccess, onBack }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'change-password'>('login');
  const [registerStep, setRegisterStep] = useState<'form' | 'verify-otp'>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [username, setUsername] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [pendingOtp, setPendingOtp] = useState<PendingOtpState | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [otpInfoMessage, setOtpInfoMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (registerStep !== 'verify-otp' || !pendingOtp) {
      setOtpSecondsLeft(0);
      return;
    }

    const updateRemaining = () => {
      const remaining = Math.max(
        0,
        Math.ceil((pendingOtp.expiresAt - Date.now()) / 1000)
      );
      setOtpSecondsLeft(remaining);
    };

    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [registerStep, pendingOtp]);

  const formatSeconds = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const resetRegisterVerification = () => {
    setRegisterStep('form');
    setPendingOtp(null);
    setOtpInput('');
    setResendCooldown(0);
    setOtpSecondsLeft(0);
    setOtpInfoMessage('');
  };

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

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
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

  async function handleStartRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setOtpInfoMessage('');

    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();

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

    if (!isEmailJsConfigured()) {
      setError('Отправка кода подтверждения не настроена (отсутствуют ключи EmailJS).');
      return;
    }

    setLoading(true);

    try {
      const { data: isBlocked } = await supabase.rpc('is_registration_blocked', {
        check_username: normalizedUsername,
        check_email: normalizedEmail,
      } as any);

      if (isBlocked) {
        setError('Регистрация временно заблокирована. Попробуйте позже.');
        return;
      }

      const { data: bannedUsername } = await supabase.rpc('is_banned', {
        check_username: normalizedUsername,
        check_email: null,
      } as any);

      if (bannedUsername) {
        setError('Этот username недоступен.');
        return;
      }

      const { data: bannedEmail } = await supabase.rpc('is_banned', {
        check_username: null,
        check_email: normalizedEmail,
      } as any);

      if (bannedEmail) {
        setError('Этот email недоступен.');
        return;
      }

      const { data: isTaken } = await (supabase.rpc as any)('is_username_taken', {
        check_username: normalizedUsername,
      });

      if (isTaken) {
        setError('Этот username уже занят.');
        return;
      }

      const code = generateOtpCode();
      await sendRegistrationOtpEmail({
        email: normalizedEmail,
        username: normalizedUsername,
        code,
        expiresMinutes: OTP_EXPIRY_MINUTES,
      });

      setEmail(normalizedEmail);
      setUsername(normalizedUsername);
      setPendingOtp({
        email: normalizedEmail,
        code,
        expiresAt: Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
        attemptsLeft: OTP_MAX_ATTEMPTS,
      });
      setOtpInput('');
      setResendCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      setRegisterStep('verify-otp');
    } catch (err: any) {
      console.error('OTP send error:', err);
      setError('Не удалось отправить код подтверждения на почту. Проверьте адрес и попробуйте позже.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0 || loading || !pendingOtp) return;

    setError('');
    setOtpInfoMessage('');

    if (!isEmailJsConfigured()) {
      setError('Отправка кода подтверждения не настроена (отсутствуют ключи EmailJS).');
      return;
    }

    setLoading(true);

    try {
      const newCode = generateOtpCode();
      await sendRegistrationOtpEmail({
        email: pendingOtp.email,
        username: username.trim().toLowerCase(),
        code: newCode,
        expiresMinutes: OTP_EXPIRY_MINUTES,
      });

      setPendingOtp({
        email: pendingOtp.email,
        code: newCode,
        expiresAt: Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
        attemptsLeft: OTP_MAX_ATTEMPTS,
      });
      setOtpInput('');
      setResendCooldown(OTP_RESEND_COOLDOWN_SECONDS);
      setOtpInfoMessage('Новый код подтверждения отправлен на вашу почту.');
    } catch (err: any) {
      console.error('OTP resend error:', err);
      setError('Не удалось повторно отправить код. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtpAndRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setOtpInfoMessage('');

    if (!pendingOtp) {
      setError('Сессия подтверждения не найдена. Запросите код заново.');
      setRegisterStep('form');
      return;
    }

    if (Date.now() > pendingOtp.expiresAt) {
      setError('Срок действия кода истёк. Запросите новый код.');
      return;
    }

    if (pendingOtp.attemptsLeft <= 0 || !pendingOtp.code) {
      setError('Превышено количество попыток. Запросите новый код.');
      return;
    }

    const sanitizedCode = otpInput.replace(/\D/g, '');
    if (sanitizedCode.length !== 6) {
      setError('Введите 6-значный код из письма.');
      return;
    }

    if (sanitizedCode !== pendingOtp.code) {
      const nextAttempts = pendingOtp.attemptsLeft - 1;
      if (nextAttempts <= 0) {
        setPendingOtp({
          ...pendingOtp,
          code: '',
          attemptsLeft: 0,
        });
        setError('Превышено количество попыток. Запросите новый код.');
      } else {
        setPendingOtp({
          ...pendingOtp,
          attemptsLeft: nextAttempts,
        });
        setError(`Неверный код. Осталось попыток: ${nextAttempts}`);
      }
      return;
    }

    setLoading(true);
    const verifiedEmail = pendingOtp.email;
    const normalizedUsername = username.trim().toLowerCase();

    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: verifiedEmail,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            email_verified_via_otp: true,
            username: normalizedUsername,
          },
        },
      });

      if (authError) {
        if (authError.message.toLowerCase().includes('already registered')) {
          setError('Email уже зарегистрирован.');
          resetRegisterVerification();
        } else {
          console.error('Signup error:', authError);
          setError('Ошибка при регистрации. Попробуйте позже.');
        }
        return;
      }

      if (
        authData.user &&
        Array.isArray(authData.user.identities) &&
        authData.user.identities.length === 0
      ) {
        setError('Email уже зарегистрирован.');
        resetRegisterVerification();
        return;
      }

      if (authData.user) {
        const { error: profileError } = await supabase
          .from('user_profiles')
          .insert({
            id: authData.user.id,
            username: normalizedUsername,
            email: verifiedEmail,
          });

        if (profileError) {
          console.error('Profile creation error:', profileError);

          if (profileError.code === '23505') {
            setError('Этот username или email уже занят.');
          } else {
            setError('Ошибка при создании профиля. Попробуйте позже.');
          }
          return;
        }

        // Одноразовый код использован — очищаем состояние и выходим из временной сессии до одобрения админом
        resetRegisterVerification();
        await supabase.auth.signOut();

        setSuccessMessage(
          'Почта подтверждена, регистрация завершена! Администратор должен одобрить вашу учетную запись перед тем, как вы сможете оставлять комментарии.'
        );
        setMode('login');
        setPassword('');
        setPasswordConfirm('');
        setUsername('');
        setEmail('');
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
    setSuccessMessage('');

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
        email: email.trim(),
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

      setSuccessMessage('Пароль успешно изменен! Войдите с новым паролем.');
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
          {mode === 'login'
            ? 'Вход'
            : mode === 'register'
              ? registerStep === 'verify-otp'
                ? 'Подтверждение почты'
                : 'Регистрация'
              : 'Смена пароля'}
        </h1>

        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
              setSuccessMessage('');
              resetRegisterVerification();
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
              setError('');
              setSuccessMessage('');
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
              setError('');
              setSuccessMessage('');
              resetRegisterVerification();
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

        {successMessage && mode === 'login' && (
          <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-lg text-sm flex items-start gap-2">
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
            <span>{successMessage}</span>
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
          <form onSubmit={handleStartRegister} className="space-y-4">
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
                autoComplete="email"
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
                minLength={12}
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
              {loading ? 'Отправка кода...' : 'Отправить код на почту'}
            </button>
          </form>
        )}

        {mode === 'register' && registerStep === 'verify-otp' && pendingOtp && (
          <form onSubmit={handleVerifyOtpAndRegister} className="space-y-4">
            <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-900 dark:text-blue-200 space-y-1">
              <div className="flex items-center gap-2 font-medium">
                <MailCheck size={18} className="shrink-0" />
                <span>Код отправлен на почту</span>
              </div>
              <p className="break-all font-semibold">{pendingOtp.email}</p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Введите одноразовый 6-значный код из письма. Если письма нет, проверьте папку «Спам».
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Одноразовый код
                </label>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {otpSecondsLeft > 0
                    ? `Действителен: ${formatSeconds(otpSecondsLeft)}`
                    : 'Срок действия истёк'}
                </span>
              </div>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-center text-2xl font-mono tracking-[0.4em]"
                required
                autoFocus
              />
            </div>

            {otpInfoMessage && (
              <div className="p-3 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg text-sm">
                {otpInfoMessage}
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || otpInput.length !== 6 || otpSecondsLeft <= 0}
              className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
            >
              {loading ? 'Регистрация...' : 'Подтвердить и зарегистрироваться'}
            </button>

            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  resetRegisterVerification();
                  setError('');
                }}
                disabled={loading}
                className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
              >
                Изменить данные
              </button>

              <button
                type="button"
                onClick={handleResendOtp}
                disabled={loading || resendCooldown > 0}
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 disabled:text-gray-400 dark:text-blue-400 dark:disabled:text-gray-500 transition-colors"
              >
                <RefreshCw size={14} />
                {resendCooldown > 0
                  ? `Отправить повторно (${resendCooldown} с)`
                  : 'Отправить код повторно'}
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
                minLength={12}
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
