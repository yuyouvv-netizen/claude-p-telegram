export const TELEGRAM_TEXT_LIMIT = 4096;

export function splitText(text, limit = 4000) {
  if (typeof text !== "string") text = String(text ?? "");
  if (!text) return [];
  if (limit < 1 || limit > TELEGRAM_TEXT_LIMIT) {
    throw new Error(`limit must be between 1 and ${TELEGRAM_TEXT_LIMIT}`);
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > limit) {
    const window = remaining.slice(0, limit + 1);
    let splitAt = window.lastIndexOf("\n\n", limit);
    if (splitAt < Math.floor(limit * 0.5)) {
      splitAt = window.lastIndexOf("\n", limit);
    }
    if (splitAt < Math.floor(limit * 0.25)) {
      splitAt = limit;
    }

    const chunk = remaining.slice(0, splitAt).trimEnd();
    chunks.push(chunk || remaining.slice(0, limit));
    remaining = remaining.slice(splitAt);
    if (remaining.startsWith("\n\n")) remaining = remaining.slice(2);
    else if (remaining.startsWith("\n")) remaining = remaining.slice(1);
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}
