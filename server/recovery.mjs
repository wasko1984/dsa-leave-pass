import { randomBytes } from 'node:crypto';
import { clean, requireThat, tokenHash, hashPassword, verifyPassword } from './security.mjs';
import { transaction, audit } from './db.mjs';

export function emailAddress(value, required = false) {
  const email = clean(value, 254).toLowerCase();
  requireThat((!required && !email) || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email), 400, 'Enter a valid registered email address.');
  return email;
}
export function createRecovery(db, options = {}) {
  const now = options.now || Date.now;
  const baseUrl = options.baseUrl || process.env.APP_BASE_URL;
  const configured = Boolean(options.send || (process.env.SMTP_HOST && process.env.SMTP_FROM && baseUrl));
  const generic = { message: 'If this email is registered to an active account, a password recovery link will be sent. Please check your inbox and spam folder.' };
  async function send(message) {
    if (options.send) return options.send(message);
    const { default: nodemailer } = await import('nodemailer');
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      requireTLS: process.env.SMTP_SECURE !== 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      connectionTimeout: 10000, socketTimeout: 15000,
    });
    try {
      await transport.sendMail({ from: process.env.SMTP_FROM, to: message.to,
        subject: 'DSA-LEAVE-PASS — reset your password',
        text: `A password reset was requested for your DSA-LEAVE-PASS account.\n\nOpen this link to choose a new password:\n${message.resetUrl}\n\nThis link expires in 30 minutes and can be used once. If you did not request it, ignore this email. Your password has not changed.\n\nDefence Space Administration`,
      });
    } finally { transport.close(); }
  }
  return {
    configured,
    async request(value) {
      const email = emailAddress(value, true);
      requireThat(configured, 503, 'Email recovery is not configured yet. Please contact your administrator.');
      const origin = new URL(baseUrl);
      requireThat(['https:', 'http:'].includes(origin.protocol) && !origin.username && !origin.password, 503, 'Email recovery configuration needs attention. Contact your administrator.');
      const user = db.prepare('SELECT * FROM users WHERE lower(email)=? AND active=1').get(email);
      if (!user) return generic;
      const recent = db.prepare('SELECT created FROM password_resets WHERE user_id=? ORDER BY created DESC LIMIT 1').get(user.id);
      if (recent && now() - recent.created < 60000) return generic;
      const token = randomBytes(32).toString('hex');
      const resetUrl = new URL('/#reset-password?token=' + token, origin.origin).href;
      transaction(db, () => {
        db.prepare('DELETE FROM password_resets WHERE user_id=? OR expires<?').run(user.id, now());
        db.prepare('INSERT INTO password_resets(token_hash,user_id,expires,created) VALUES(?,?,?,?)').run(tokenHash(token), user.id, now() + 30 * 60000, now());
      });
      try { await send({ to: email, resetUrl }); audit(db, user, 'password.recovery.request', user.id); }
      catch {
        db.prepare('DELETE FROM password_resets WHERE token_hash=?').run(tokenHash(token));
        audit(db, user, 'password.recovery.delivery_failed', user.id, 'Email transport failed; check SMTP configuration.');
        // Keep public responses identical for registered and unknown addresses.
      }
      return generic;
    },
    reset(input) {
      requireThat(typeof input.token === 'string' && /^[a-f0-9]{64}$/.test(input.token), 400, 'This recovery link is invalid or has expired. Request a new one.');
      const hash = hashPassword(input.newPassword);
      return transaction(db, () => {
        const row = db.prepare('SELECT u.*,r.expires FROM password_resets r JOIN users u ON u.id=r.user_id WHERE r.token_hash=?').get(tokenHash(input.token));
        requireThat(row && row.active && row.expires > now(), 400, 'This recovery link is invalid or has expired. Request a new one.');
        requireThat(!verifyPassword(input.newPassword, row.password), 400, 'Choose a different password from your current password.');
        db.prepare('UPDATE users SET password=?,must_change_password=0 WHERE id=?').run(hash, row.id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.id);
        db.prepare('DELETE FROM password_resets WHERE user_id=?').run(row.id);
        audit(db, row, 'user.password', row.id, 'Password recovered through registered email');
        return { message: 'Password updated. Sign in with your new password.' };
      });
    },
  };
}
