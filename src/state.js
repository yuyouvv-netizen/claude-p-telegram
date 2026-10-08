import fs from "node:fs/promises";
import path from "node:path";

export class StateStore {
  constructor(stateDir) {
    this.stateDir = stateDir;
    this.offsetFile = path.join(stateDir, "telegram-offset.json");
  }

  async init() {
    await fs.mkdir(this.stateDir, { recursive: true });
  }

  async readOffset() {
    try {
      const parsed = JSON.parse(await fs.readFile(this.offsetFile, "utf8"));
      return Number.isSafeInteger(parsed.offset) && parsed.offset >= 0
        ? parsed.offset
        : 0;
    } catch (error) {
      if (error.code === "ENOENT") return 0;
      console.warn("Could not read the saved Telegram offset; starting at 0.");
      return 0;
    }
  }

  async writeOffset(offset) {
    const temporary = `${this.offsetFile}.tmp`;
    await fs.writeFile(temporary, JSON.stringify({ offset }), {
      encoding: "utf8",
      mode: 0o600,
    });
    await fs.rename(temporary, this.offsetFile);
  }
}
