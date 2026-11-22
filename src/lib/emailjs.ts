import { send as sendEmailJs } from '@emailjs/browser';

const getEmailJsConfig = () => {
  const serviceId = (import.meta.env.VITE_EMAILJS_SERVICE_ID || '').trim();
  const templateId = (import.meta.env.VITE_EMAILJS_TEMPLATE_ID || '').trim();
  const publicKey = (
    import.meta.env.VITE_EMAILJS_PUBLIC_KEY ||
    import.meta.env.VITE_EMAILJS_USER_ID ||
    ''
  ).trim();

  return { serviceId, templateId, publicKey };
};

export function isEmailJsConfigured(): boolean {
  const { serviceId, templateId, publicKey } = getEmailJsConfig();
  return Boolean(serviceId && templateId && publicKey);
}

export function generateOtpCode(): string {
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const array = new Uint32Array(1);
    cryptoObj.getRandomValues(array);
    return String(array[0] % 1000000).padStart(6, '0');
  }
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
}

export interface SendRegistrationOtpParams {
  email: string;
  username: string;
  code: string;
  expiresMinutes?: number;
}

export async function sendRegistrationOtpEmail({
  email,
  username,
  code,
  expiresMinutes = 10,
}: SendRegistrationOtpParams): Promise<void> {
  const { serviceId, templateId, publicKey } = getEmailJsConfig();

  if (!serviceId || !templateId || !publicKey) {
    throw new Error('EmailJS is not configured');
  }

  const expiresAtFormatted = new Date(
    Date.now() + expiresMinutes * 60 * 1000
  ).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const templateParams: Record<string, string> = {
    email,
    to_email: email,
    user_email: email,
    reply_to: email,
    to_name: username,
    username,
    user_name: username,
    passcode: code,
    code,
    otp: code,
    verification_code: code,
    time: expiresAtFormatted,
    expires_in: `${expiresMinutes} минут`,
    app_name: 'тгк без блокировок',
    message: `Ваш одноразовый код подтверждения регистрации: ${code}. Код действителен ${expiresMinutes} минут.`,
  };

  await sendEmailJs(serviceId, templateId, templateParams, {
    publicKey,
  });
}
