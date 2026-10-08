# Security

- Never commit a Telegram bot token, Claude authentication material, chat ID,
  private prompt, or deployment export.
- Keep `TELEGRAM_ALLOWED_CHAT_IDS` restrictive. An empty list rejects everyone.
- `CLAUDE_EXTRA_ARGS_JSON` is passed directly to the official Claude Code CLI.
  In particular, `--dangerously-skip-permissions` removes an important safety
  boundary. It is intentionally not enabled by this repository.
- Give the container only the files and MCP tools that the Telegram user should
  be able to reach.
- Mount persistent storage for `STATE_DIR`. The bridge records Telegram's next
  update offset before executing a turn so a restart does not repeat a tool
  action.

To report a vulnerability, open a GitHub security advisory rather than a
public issue.
