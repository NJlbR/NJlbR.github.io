const EMAILJS_API_URL = 'https://api.emailjs.com/api/v1.0/email/send';
const OTP_TTL_MS = 10 * 60 * 1000;
export const MAX_OTP_ATTEMPTS = 5;

export interface OtpChallenge {
  email: string;
  salt: string;
  hash: string;
  expiresAt: number;
  attempts: number;
}

export type OtpVerificationResult =
  | { valid: true }
  | { valid: false; reason: 'expired' | 'max_attempts' | 'mismatch'; remainingAttempts: number };

function getEmailJsConfig() {
  return {
    serviceId: import.meta.env.VITE_EMAILJS_SERVICE_ID?.trim() || '',
    templateId: import.meta.env.VITE_EMAILJS_TEMPLATE_ID?.trim() || '',
    publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY?.trim() || '',
  };
}

export function isEmailJsConfigured(): boolean {
  const { serviceId, templateId, publicKey } = getEmailJsConfig();
  return Boolean(serviceId && templateId && publicKey);
}

function generateRandomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function generateOtpCode(): string {
  const range = 900000;
  const maxUnbiased = Math.floor(0x100000000 / range) * range;
  const buffer = new Uint32Array(1);

  let value: number;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= maxUnbiased);

  return String(100000 + (value % range));
}

async function hashChallengeValue(email: string, code: string, salt: string): Promise<string> {
  const payload = `${salt}:${email.trim().toLowerCase()}:${code.trim()}`;

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(payload);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback hash for non-secure HTTP origins without WebCrypto subtle
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + i;
    h2 = Math.imul(h2, 0x01000193);
  }
  return `${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function createOtpChallenge(email: string): Promise<{ code: string; challenge: OtpChallenge }> {
  const normalizedEmail = email.trim().toLowerCase();
  const code = generateOtpCode();
  const salt = generateRandomHex(16);
  const hash = await hashChallengeValue(normalizedEmail, code, salt);

  return {
    code,
    challenge: {
      email: normalizedEmail,
      salt,
      hash,
      expiresAt: Date.now() + OTP_TTL_MS,
      attempts: 0,
    },
  };
}

export async function verifyOtpChallenge(
  challenge: OtpChallenge,
  inputCode: string
): Promise<OtpVerificationResult> {
  if (Date.now() > challenge.expiresAt) {
    return { valid: false, reason: 'expired', remainingAttempts: 0 };
  }

  if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
    return { valid: false, reason: 'max_attempts', remainingAttempts: 0 };
  }

  const sanitizedInput = inputCode.replace(/\D/g, '');
  if (sanitizedInput.length !== 6) {
    const remaining = Math.max(0, MAX_OTP_ATTEMPTS - (challenge.attempts + 1));
    return { valid: false, reason: 'mismatch', remainingAttempts: remaining };
  }

  const inputHash = await hashChallengeValue(challenge.email, sanitizedInput, challenge.salt);
  if (constantTimeEqual(inputHash, challenge.hash)) {
    return { valid: true };
  }

  const remaining = Math.max(0, MAX_OTP_ATTEMPTS - (challenge.attempts + 1));
  return { valid: false, reason: 'mismatch', remainingAttempts: remaining };
}

export async function sendVerificationOtpEmail(params: {
  email: string;
  username: string;
  code: string;
}): Promise<void> {
  const { serviceId, templateId, publicKey } = getEmailJsConfig();

  if (!serviceId || !templateId || !publicKey) {
    throw new Error('EmailJS is not configured');
  }

  const normalizedEmail = params.email.trim().toLowerCase();

  const response = await fetch(EMAILJS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: {
        to_email: normalizedEmail,
        email: normalizedEmail,
        user_email: normalizedEmail,
        reply_to: normalizedEmail,
        to_name: params.username,
        username: params.username,
        name: params.username,
        code: params.code,
        otp: params.code,
        passcode: params.code,
        verification_code: params.code,
        expires_in: '10 минут',
        app_name: 'тгк без блокировок',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`EmailJS request failed with status ${response.status}`);
  }
}
