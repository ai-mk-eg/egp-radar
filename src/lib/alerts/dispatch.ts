import { config } from "../config";

export type AlertMsg = { title: string; body: string; severity: string };

export async function sendTelegram(m: AlertMsg) {
  if (!config.telegram.token || !config.telegram.chatId) return false;
  const res = await fetch(`https://api.telegram.org/bot${config.telegram.token}/sendMessage`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: config.telegram.chatId, text: `${m.title}\n\n${m.body}`, disable_web_page_preview: true }),
  });
  return res.ok;
}

export async function sendEmail(m: AlertMsg) {
  const s = config.smtp;
  if (!s.host || !s.to || !s.from) return false;
  const nodemailer = await import("nodemailer");
  const t = nodemailer.createTransport({ host: s.host, port: s.port, secure: s.port === 465, auth: s.user ? { user: s.user, pass: s.pass } : undefined });
  await t.sendMail({ from: s.from, to: s.to, subject: `[EGP Radar] ${m.title}`, text: m.body });
  return true;
}
