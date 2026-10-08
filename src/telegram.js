import { splitText } from "./split.js";

export class TelegramApi {
  constructor(token) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  async call(method, payload = {}, { signal } = {}) {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      const description = data?.description || `HTTP ${response.status}`;
      throw new Error(`Telegram ${method} failed: ${description}`);
    }
    return data.result;
  }

  getUpdates(offset, signal) {
    return this.call(
      "getUpdates",
      {
        offset,
        timeout: 30,
        allowed_updates: ["message"],
      },
      { signal },
    );
  }

  async sendText(chatId, text) {
    const chunks = splitText(text);
    for (const chunk of chunks) {
      await this.call("sendMessage", {
        chat_id: chatId,
        text: chunk,
        disable_web_page_preview: false,
      });
    }
  }

  sendTyping(chatId) {
    return this.call("sendChatAction", {
      chat_id: chatId,
      action: "typing",
    });
  }
}
