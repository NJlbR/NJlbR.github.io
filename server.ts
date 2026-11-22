import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

try {
  process.loadEnvFile?.('.env');
} catch {
  // .env is optional
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const OTP_HMAC_SECRET = process.env.OTP_SECRET || crypto.randomBytes(32).toString('hex');
const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const IP_WINDOW_MS = 15 * 60 * 1000;
const MAX_IP_REQUESTS = 20;

interface PendingOtp {
  otpHash: string;
  expiresAt: number;
  lastSentAt: number;
  attempts: number;
  username: string;
}

const pendingOtps = new Map<string, PendingOtp>();
const ipRateLimits = new Map<string, { count: number; resetAt: number }>();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hashOtp(email: string, code: string): string {
  return crypto
    .createHmac('sha256', OTP_HMAC_SECRET)
    .update(`${email}:${code}`)
    .digest('hex');
}

function timingSafeHexEqual(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, 'hex');
  const b = Buffer.from(bHex, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipRateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipRateLimits.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_IP_REQUESTS) {
    return false;
  }
  entry.count += 1;
  return true;
}

function getEmailJsConfig() {
  const serviceId = (process.env.EMAILJS_SERVICE_ID || 'service_z85aznd').trim();
  const templateId = (process.env.EMAILJS_TEMPLATE_ID || 'template_lh5axtd').trim();
  const publicKey = (process.env.EMAILJS_PUBLIC_KEY || '').trim();
  const privateKey = (process.env.EMAILJS_PRIVATE_KEY || '').trim();
  if (!serviceId || !templateId || !publicKey || !privateKey) {
    return null;
  }
  return { serviceId, templateId, publicKey, privateKey };
}

function hasEmailProviderConfigured(): boolean {
  if (getEmailJsConfig()) {
    return true;
  }
  if (process.env.RESEND_API_KEY?.trim()) {
    return true;
  }
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

async function sendOtpEmail(toEmail: string, username: string, code: string): Promise<void> {
  const emailJs = getEmailJsConfig();
  if (emailJs) {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service_id: emailJs.serviceId,
        template_id: emailJs.templateId,
        user_id: emailJs.publicKey,
        accessToken: emailJs.privateKey,
        template_params: {
          to_email: toEmail,
          email: toEmail,
          username,
          otp_code: code,
          code,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`EmailJS API error (${response.status}): ${errorText}`);
    }
    return;
  }

  const safeUsername = escapeHtml(username);
  const subject = `Код подтверждения регистрации: ${code}`;
  const text = `Здравствуйте, ${username}!\n\nВаш одноразовый код для подтверждения почты: ${code}\n\nКод действителен 10 минут. Если вы не регистрировались, просто проигнорируйте это письмо.`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #111827;">
      <h2 style="margin: 0 0 12px;">Подтверждение регистрации</h2>
      <p style="margin: 0 0 16px;">Здравствуйте, <strong>${safeUsername}</strong>!</p>
      <p style="margin: 0 0 12px;">Ваш одноразовый код для подтверждения почты:</p>
      <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; padding: 14px 20px; background: #f3f4f6; border-radius: 8px; text-align: center; margin: 16px 0;">
        ${code}
      </div>
      <p style="margin: 16px 0 0; font-size: 13px; color: #6b7280;">
        Код действителен 10 минут. Если вы не запрашивали регистрацию, просто проигнорируйте это письмо.
      </p>
    </div>
  `;

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (resendApiKey) {
    const from = process.env.RESEND_FROM?.trim() || 'onboarding@resend.dev';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [toEmail],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Resend API error (${response.status}): ${errorText}`);
    }
    return;
  }

  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const from = process.env.SMTP_FROM?.trim() || user;

  if (!host || !user || !pass) {
    throw new Error('SMTP configuration is incomplete');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to: toEmail,
    subject,
    text,
    html,
  });
}

function getSupabaseAdmin() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceRoleKey) {
    return null;
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '32kb' }));

  app.post('/api/auth/send-otp', async (req, res) => {
    const clientIp = req.ip || 'unknown';
    if (!checkIpRateLimit(clientIp)) {
      res.status(429).json({ ok: false, error: 'Слишком много запросов. Попробуйте позже.' });
      return;
    }

    if (!hasEmailProviderConfigured()) {
      res.status(503).json({
        ok: false,
        configured: false,
        error: 'Серверная отправка писем не настроена (SMTP или RESEND_API_KEY).',
      });
      return;
    }

    const rawEmail = typeof req.body?.email === 'string' ? req.body.email : '';
    const rawUsername = typeof req.body?.username === 'string' ? req.body.username : '';
    const email = rawEmail.trim().toLowerCase();
    const username = rawUsername.trim().toLowerCase();

    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ ok: false, error: 'Неверный формат email.' });
      return;
    }

    if (!/^[a-zA-Z0-9_]{4,30}$/.test(username)) {
      res.status(400).json({ ok: false, error: 'Неверный формат username.' });
      return;
    }

    const now = Date.now();
    const existing = pendingOtps.get(email);
    if (existing && now - existing.lastSentAt < RESEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (now - existing.lastSentAt)) / 1000);
      res.status(429).json({
        ok: false,
        error: `Повторная отправка возможна через ${waitSec} сек.`,
      });
      return;
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    pendingOtps.set(email, {
      otpHash: hashOtp(email, code),
      expiresAt: now + OTP_TTL_MS,
      lastSentAt: now,
      attempts: 0,
      username,
    });

    try {
      await sendOtpEmail(email, username, code);
      res.json({ ok: true, configured: true, expiresInSeconds: OTP_TTL_MS / 1000 });
    } catch (err) {
      pendingOtps.delete(email);
      console.error('Failed to send OTP email:', err instanceof Error ? err.message : err);
      res.status(502).json({
        ok: false,
        configured: true,
        error: 'Не удалось отправить письмо с кодом. Проверьте настройки SMTP/Resend.',
      });
    }
  });

  app.post('/api/auth/verify-otp', async (req, res) => {
    const clientIp = req.ip || 'unknown';
    if (!checkIpRateLimit(clientIp)) {
      res.status(429).json({ ok: false, error: 'Слишком много попыток. Попробуйте позже.' });
      return;
    }

    const rawEmail = typeof req.body?.email === 'string' ? req.body.email : '';
    const rawCode = typeof req.body?.code === 'string' ? req.body.code : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    const email = rawEmail.trim().toLowerCase();
    const code = rawCode.replace(/\s+/g, '').trim();

    if (!email || !/^\d{6}$/.test(code)) {
      res.status(400).json({ ok: false, error: 'Введите корректный 6-значный код.' });
      return;
    }

    const record = pendingOtps.get(email);
    if (!record) {
      res.status(400).json({ ok: false, error: 'Код не найден или уже использован. Запросите новый код.' });
      return;
    }

    if (Date.now() > record.expiresAt) {
      pendingOtps.delete(email);
      res.status(400).json({ ok: false, error: 'Срок действия кода истек. Запросите новый код.' });
      return;
    }

    if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
      pendingOtps.delete(email);
      res.status(400).json({ ok: false, error: 'Превышено число попыток. Запросите новый код.' });
      return;
    }

    const expectedHash = hashOtp(email, code);
    if (!timingSafeHexEqual(record.otpHash, expectedHash)) {
      record.attempts += 1;
      if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
        pendingOtps.delete(email);
        res.status(400).json({ ok: false, error: 'Превышено число попыток. Запросите новый код.' });
        return;
      }
      res.status(400).json({ ok: false, error: 'Неверный код подтверждения.' });
      return;
    }

    pendingOtps.delete(email);

    const supabaseAdmin = getSupabaseAdmin();
    if (supabaseAdmin && password) {
      if (password.length < 12 || password.length > 100 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password)) {
        res.status(400).json({ ok: false, error: 'Пароль не соответствует требованиям безопасности.' });
        return;
      }

      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username: record.username },
      });

      if (createError || !created.user) {
        const msg = createError?.message?.toLowerCase() || '';
        if (msg.includes('already') || msg.includes('registered')) {
          res.status(409).json({ ok: false, error: 'Email уже зарегистрирован.' });
          return;
        }
        console.error('Supabase admin createUser error:', createError?.message);
        res.status(500).json({ ok: false, error: 'Не удалось создать пользователя после подтверждения почты.' });
        return;
      }

      const { error: profileError } = await supabaseAdmin
        .from('user_profiles')
        .upsert(
          {
            id: created.user.id,
            username: record.username,
            email,
          },
          { onConflict: 'id' }
        );

      if (profileError) {
        console.error('Supabase admin profile insert error:', profileError.message);
        res.status(500).json({ ok: false, error: 'Почта подтверждена, но не удалось создать профиль.' });
        return;
      }

      res.json({ ok: true, accountCreated: true });
      return;
    }

    res.json({ ok: true, accountCreated: false });
  });

  if (IS_PRODUCTION) {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/admin.html', (_req, res) => {
      res.sendFile(path.join(distDir, 'admin.html'));
    });
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'mpa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
