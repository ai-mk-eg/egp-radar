/** Central runtime configuration. Secrets are read from env only — never sent to the client. */
export const config = {
  databaseUrl: process.env.DATABASE_URL || "", // postgres://... → Postgres; empty → SQLite
  sqlitePath: process.env.SQLITE_PATH || "data/egp-radar.db",
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
  hasAnthropic: () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
  telegram: { token: process.env.TELEGRAM_BOT_TOKEN || "", chatId: process.env.TELEGRAM_CHAT_ID || "" },
  smtp: {
    host: process.env.SMTP_HOST || "", port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || "", pass: process.env.SMTP_PASS || "",
    from: process.env.ALERT_EMAIL_FROM || "", to: process.env.ALERT_EMAIL_TO || "",
  },
  cronSecret: process.env.CRON_SECRET || "",
  fredApiKey: process.env.FRED_API_KEY || "",
  userAgent: process.env.COLLECTOR_USER_AGENT || "EGP-Radar/1.0 (+personal research; contact: set COLLECTOR_USER_AGENT)",
  /** Bank polling interval. Detection timestamps are only as precise as this. */
  bankPollSeconds: Number(process.env.BANK_POLL_SECONDS || 300),
};
