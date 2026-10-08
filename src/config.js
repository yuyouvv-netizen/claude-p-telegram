import path from "node:path";

function integer(name, fallback, { min = 0 } = {}) {
  const raw = process.env[name];
  const value = raw == null || raw === "" ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < min) {
    throw new Error(`${name} must be an integer >= ${min}`);
  }
  return value;
}

function csvSet(raw) {
  return new Set(
    String(raw ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function jsonArray(name, fallback = []) {
  const raw = process.env[name];
  if (!raw) return fallback;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`${name} must be valid JSON`);
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${name} must be a JSON array of strings`);
  }
  return value;
}

export function loadConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");

  const allowedChatIds = csvSet(process.env.TELEGRAM_ALLOWED_CHAT_IDS);
  if (allowedChatIds.size === 0) {
    console.warn(
      "TELEGRAM_ALLOWED_CHAT_IDS is empty. The bridge will reject every chat and log its chat ID.",
    );
  }

  const stateDir = path.resolve(
    process.env.STATE_DIR || path.join(process.cwd(), ".data"),
  );
  const workdir = path.resolve(process.env.CLAUDE_WORKDIR || process.cwd());

  return {
    token,
    allowedChatIds,
    stateDir,
    workdir,
    claudeCommand: process.env.CLAUDE_COMMAND?.trim() || "claude",
    claudeExtraArgs: jsonArray("CLAUDE_EXTRA_ARGS_JSON"),
    claudeTimeoutMs: integer("CLAUDE_TIMEOUT_MS", 300_000, { min: 1_000 }),
    port: integer("PORT", 3000, { min: 1 }),
    heartbeatIntervalMinutes: integer("HEARTBEAT_INTERVAL_MINUTES", 0),
    heartbeatChatId: process.env.HEARTBEAT_CHAT_ID?.trim() || "",
    heartbeatSilentToken:
      process.env.HEARTBEAT_SILENT_TOKEN?.trim() || "SILENT",
    heartbeatPrompt:
      process.env.HEARTBEAT_PROMPT?.trim() ||
      "This is an optional scheduled check-in. Reply SILENT if there is nothing useful to say; otherwise write one short message to the person in this chat.",
  };
}
