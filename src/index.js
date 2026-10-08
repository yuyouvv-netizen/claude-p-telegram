import fs from "node:fs/promises";
import http from "node:http";
import { loadConfig } from "./config.js";
import { StateStore } from "./state.js";
import { TelegramApi } from "./telegram.js";
import { ClaudeRunner } from "./claude.js";
import { SerialQueue } from "./queue.js";

const config = loadConfig();
await fs.mkdir(config.workdir, { recursive: true });

const state = new StateStore(config.stateDir);
await state.init();

const telegram = new TelegramApi(config.token);
const claude = new ClaudeRunner(config);
const queue = new SerialQueue();
let offset = await state.readOffset();
let shuttingDown = false;
let lastHumanMessageAt = Date.now();

function isAllowed(chatId) {
  return config.allowedChatIds.has(String(chatId));
}

async function withTyping(chatId, work) {
  await telegram.sendTyping(chatId).catch(() => {});
  const timer = setInterval(
    () => telegram.sendTyping(chatId).catch(() => {}),
    4_000,
  );
  timer.unref();
  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
}

async function answer(chatId, text, options = {}) {
  try {
    const response = await withTyping(chatId, () => claude.ask(text, options));
    await telegram.sendText(chatId, response);
  } catch (error) {
    console.error("Claude turn failed:", error.message);
    const safeMessage = error.message.startsWith("Claude timed out")
      ? "This turn timed out and was stopped. It was not retried."
      : error.message.startsWith("Claude was stopped")
        ? "This turn was stopped. It was not retried."
        : "This turn did not complete and was not retried. Check the deployment logs.";
    await telegram
      .sendText(chatId, safeMessage)
      .catch((sendError) => console.error("Could not send error message:", sendError.message));
  }
}

function enqueueMessage(chatId, text, options) {
  queue.add(() => answer(chatId, text, options));
}

async function handleUpdate(update) {
  const message = update.message;
  if (!message?.chat?.id || message.from?.is_bot) return;

  const chatId = String(message.chat.id);
  if (!isAllowed(chatId)) {
    console.warn(`Rejected Telegram chat ID: ${chatId}`);
    return;
  }

  const text = message.text?.trim();
  if (!text) {
    await telegram.sendText(chatId, "This starter currently accepts text messages only.");
    return;
  }

  lastHumanMessageAt = Date.now();

  if (text === "/start" || text === "/help") {
    await telegram.sendText(
      chatId,
      [
        "Send a text message to talk through Claude Code print mode.",
        "",
        "/new — start a fresh Claude Code conversation",
        "/stop — stop the active Claude turn without retrying it",
        "/status — show whether the bridge is busy",
      ].join("\n"),
    );
    return;
  }

  if (text === "/stop") {
    const stopped = claude.stop();
    await telegram.sendText(
      chatId,
      stopped ? "Stopping the active turn. It will not be retried." : "Nothing is running.",
    );
    return;
  }

  if (text === "/status") {
    await telegram.sendText(
      chatId,
      claude.busy || queue.size > 0
        ? `Busy. Queue size: ${queue.size}.`
        : "Idle.",
    );
    return;
  }

  if (text === "/new") {
    enqueueMessage(chatId, "Begin a new conversation and say hello briefly.", {
      continueConversation: false,
      allowFreshFallback: false,
    });
    return;
  }

  enqueueMessage(chatId, text, {
    continueConversation: true,
    allowFreshFallback: true,
  });
}

async function poll() {
  while (!shuttingDown) {
    const controller = new AbortController();
    const shutdownTimer = setInterval(() => {
      if (shuttingDown) controller.abort();
    }, 250);
    shutdownTimer.unref();

    try {
      const updates = await telegram.getUpdates(offset, controller.signal);
      for (const update of updates) {
        if (!Number.isSafeInteger(update.update_id) || update.update_id < offset) {
          continue;
        }

        // Save before processing: a crash may drop this message, but will not
        // repeat a possibly tool-using Claude turn after restart.
        offset = update.update_id + 1;
        await state.writeOffset(offset);
        await handleUpdate(update);
      }
    } catch (error) {
      if (!shuttingDown && error.name !== "AbortError") {
        console.error("Telegram polling failed:", error.message);
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    } finally {
      clearInterval(shutdownTimer);
    }
  }
}

function startHeartbeat() {
  if (config.heartbeatIntervalMinutes <= 0) return;

  const chatId =
    config.heartbeatChatId || config.allowedChatIds.values().next().value || "";
  if (!chatId || !isAllowed(chatId)) {
    console.warn("Heartbeat is enabled but HEARTBEAT_CHAT_ID is not allowed.");
    return;
  }

  const intervalMs = config.heartbeatIntervalMinutes * 60_000;
  const timer = setInterval(() => {
    if (Date.now() - lastHumanMessageAt < intervalMs || queue.size > 0) return;
    queue.add(async () => {
      try {
        const response = await claude.ask(config.heartbeatPrompt, {
          continueConversation: true,
          allowFreshFallback: false,
        });
        if (response.trim() !== config.heartbeatSilentToken) {
          await telegram.sendText(chatId, response);
        }
      } catch (error) {
        console.error("Heartbeat skipped:", error.message);
      }
    });
  }, intervalMs);
  timer.unref();
}

const healthServer = http.createServer((request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, busy: claude.busy, queue: queue.size }));
    return;
  }
  response.writeHead(404, { "content-type": "text/plain" });
  response.end("Not found\n");
});

healthServer.listen(config.port, "0.0.0.0", () => {
  console.log(`Health server listening on :${config.port}/healthz`);
});

startHeartbeat();
console.log("Telegram bridge started. No session ID is stored or pinned.");
void poll();

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down.`);
  claude.stop();
  healthServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
