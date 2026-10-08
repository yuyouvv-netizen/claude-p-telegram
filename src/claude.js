import { spawn } from "node:child_process";

const NO_CONVERSATION_PATTERNS = [
  /no conversation found/i,
  /no previous conversation/i,
  /no conversation to continue/i,
];

function looksLikeMissingConversation(message) {
  return NO_CONVERSATION_PATTERNS.some((pattern) => pattern.test(message));
}

export class ClaudeRunner {
  constructor(config) {
    this.command = config.claudeCommand;
    this.workdir = config.workdir;
    this.extraArgs = config.claudeExtraArgs;
    this.timeoutMs = config.claudeTimeoutMs;
    this.current = null;
  }

  get busy() {
    return this.current !== null;
  }

  stop() {
    if (!this.current) return false;
    this.current.stop("Stopped from Telegram");
    return true;
  }

  async ask(prompt, { continueConversation = true, allowFreshFallback = true } = {}) {
    const first = await this.#run(prompt, { continueConversation });
    if (
      continueConversation &&
      allowFreshFallback &&
      first.exitCode !== 0 &&
      looksLikeMissingConversation(`${first.stderr}\n${first.stdout}`)
    ) {
      return this.#assertSuccess(
        await this.#run(prompt, { continueConversation: false }),
      );
    }
    return this.#assertSuccess(first);
  }

  #assertSuccess(result) {
    if (result.timedOut) {
      throw new Error("Claude timed out and was stopped. This turn was not retried.");
    }
    if (result.stopped) {
      throw new Error("Claude was stopped. This turn was not retried.");
    }
    if (result.exitCode !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim() || "unknown error";
      throw new Error(`Claude exited with code ${result.exitCode}: ${detail.slice(0, 1200)}`);
    }
    const output = result.stdout.trim();
    if (!output) throw new Error("Claude returned an empty response.");
    return output;
  }

  #run(prompt, { continueConversation }) {
    if (this.current) {
      throw new Error("Claude is already processing another message");
    }

    const args = ["-p", "--output-format", "text"];
    if (continueConversation) args.push("--continue");
    args.push(...this.extraArgs);

    return new Promise((resolve, reject) => {
      const child = spawn(this.command, args, {
        cwd: this.workdir,
        env: process.env,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let stopped = false;
      let settled = false;

      const finish = (value, error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearTimeout(killTimer);
        this.current = null;
        if (error) reject(error);
        else resolve(value);
      };

      const terminate = (reason) => {
        if (child.exitCode !== null) return;
        if (reason === "timeout") timedOut = true;
        else stopped = true;
        child.kill("SIGTERM");
        killTimer = setTimeout(() => child.kill("SIGKILL"), 5_000);
        killTimer.unref();
      };

      let killTimer = null;
      const timeout = setTimeout(() => terminate("timeout"), this.timeoutMs);
      timeout.unref();

      this.current = { child, stop: () => terminate("stop") };

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        if (stdout.length > 2_000_000) terminate("output-limit");
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
        if (stderr.length > 200_000) terminate("output-limit");
      });
      child.once("error", (error) => finish(null, error));
      child.once("close", (exitCode, signal) =>
        finish({ exitCode, signal, stdout, stderr, timedOut, stopped }),
      );

      child.stdin.end(prompt);
    });
  }
}
