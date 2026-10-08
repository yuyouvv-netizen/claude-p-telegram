export class SerialQueue {
  constructor() {
    this.pending = [];
    this.running = false;
  }

  get size() {
    return this.pending.length + (this.running ? 1 : 0);
  }

  add(task) {
    this.pending.push(task);
    void this.#drain();
  }

  async #drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.pending.length) {
        const task = this.pending.shift();
        try {
          await task();
        } catch (error) {
          console.error("Queued task failed:", error.message);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
