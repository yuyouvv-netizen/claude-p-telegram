# claude-p-telegram

一个尽量小、尽量干净的 **Telegram ↔ Claude Code `claude -p`** 桥接模板。

它把 Telegram 里的文字消息串行交给官方 Claude Code CLI，再把文本结果送回
原聊天，让 Telegram 成为 `claude -p` 的日常聊天入口。

## 这个模板做什么

- 使用 Telegram Bot API 长轮询，不需要公开 webhook 地址。
- 使用官方 Claude Code 的非交互模式 `claude -p`。
- 后续消息使用 `--continue` 继续当前工作目录里最近的会话。
- **不保存、不绑定固定 session ID。** `/new` 会新建会话；之后仍由
  `--continue` 接上最近会话。
- 消息严格串行，Telegram `update_id` 在执行前持久化，避免重启后重复执行
  可能调用工具的同一轮。
- `/stop` 只停止当前轮，不自动重试。
- 回复超过 Telegram 限制时优先按空行或换行拆分。
- 心跳可选，默认关闭；静默词默认是 `SILENT`。
- 提供 `/healthz`，便于 Zeabur 等平台检查进程。

这个版本最适合一个人使用一个机器人：每次消息都会继续同一工作目录里最近的
Claude Code 会话，因此不需要手动填写或固定 session ID。如果几个人各自想要
独立、连续的聊天，分别 Fork 并部署一份即可。

## 使用前准备

1. 一个由 [@BotFather](https://t.me/BotFather) 创建的 Telegram Bot。
2. 一个已经能正常运行 `claude -p "hello"` 的 Claude Code 环境。
3. Node.js 20+，或能够构建本仓库 `Dockerfile` 的托管平台。

Claude Code 的安装和登录请遵循 Anthropic 官方文档。本仓库不生成、收集或
代理任何 Claude 凭据。

## 本地运行

```bash
# 先用你自己的安全方式把 .env.example 中的变量放进当前 shell
npm start
```

这个项目不自动读取 `.env`，以免误把本地秘密混进其他工具链。部署时请直接
使用平台的“私密环境变量”功能。

必填变量：

| 变量 | 用途 |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | BotFather 生成的 Token，只能放在私密变量里 |
| `TELEGRAM_ALLOWED_CHAT_IDS` | 允许使用机器人的数字 Chat ID；可用逗号分隔 |

首次不知道 Chat ID 时，可以先只设置 Token 启动一次，然后给机器人发送一条
消息。程序会拒绝消息，但在你自己的部署日志中打印
`Rejected Telegram chat ID: ...`。把该数字填入允许列表后重新部署即可。

常用可选变量见 [`.env.example`](./.env.example)。

## Claude 会话逻辑

普通消息对应：

```bash
claude -p --output-format text --continue
```

消息正文通过标准输入传入，不会拼接成 shell 命令。若 Claude Code 明确报告
当前目录从未有过可继续的会话，程序只在这一种情况下改用一次新的
`claude -p`；超时、空回复、网络错误和其他失败都不会自动重跑。

这意味着它保留连续性，但没有“锁死某个 session ID”：同一工作目录若被别的
Claude Code 进程创建了更新的会话，下一条 Telegram 消息会继续那个最近会话。
如果你需要严格会话隔离，应当在自己的 Fork 中另行实现 session ID 管理。

## Telegram 命令

| 命令 | 行为 |
| --- | --- |
| `/start` 或 `/help` | 显示帮助 |
| `/new` | 新建一次 Claude Code 会话，之后继续最近会话 |
| `/stop` | 停止当前 Claude 进程，不重跑 |
| `/status` | 查看是否繁忙及队列长度 |

## 在 Zeabur 部署

GitHub 负责保存代码，Zeabur 负责让这段代码一直在云端运行，Telegram Bot 则是
你每天实际打开的聊天入口。只完成 Fork 相当于复制了一份代码，机器人还不会
上线；把 Fork 部署到 Zeabur 后，桥接程序才会持续接收 Telegram 消息并调用
`claude -p`。

1. 点击 GitHub 页面右上角的 **Fork**，把仓库复制到自己的 GitHub 账号。
2. 在 Zeabur 新建项目，选择 **从 GitHub 部署**，再选中刚刚 Fork 的仓库。
   Zeabur 会读取仓库里的 `Dockerfile`，自动安装 Node.js、Claude Code 和桥接
   程序。
3. 在服务的 **Variables / 环境变量** 页面填写 `.env.example` 中的必填项，
   以及自己的 Claude Code 认证信息。环境变量就是“交给程序使用、但不写进
   公开代码”的设置，真实 Token 只放在这里。
4. 在服务中添加一个挂载到 `/data` 的 **Volume / 持久卷**。持久卷是服务重启
   或重新部署后仍会保留的空间；它用来保存 Telegram 去重进度和 Claude Code
   的会话数据，避免重启后重复处理旧消息或丢失最近会话。
5. 重新部署服务，然后在 Telegram 中给机器人发送消息。默认的
   `CLAUDE_WORKDIR=/workspace` 可以直接使用；只有接入自己已有的工作目录时才
   需要修改它。

`/healthz` 是给 Zeabur 检查程序是否仍在运行的小接口，不是聊天页面。打开后若
看到 `{"ok":true,...}`，就表示桥接进程已经启动；真正的对话仍在 Telegram
里进行。

不要把任何真实 Token 写进 Fork、提交记录、Issue、截图或普通环境变量说明中。

## 可选心跳

设置 `HEARTBEAT_INTERVAL_MINUTES` 为大于 0 的整数即可启用。心跳：

- 只会在对应时长内没有收到人的消息且队列为空时进入队列；
- 使用 `--continue`，若没有现成会话则直接跳过，不会悄悄新建；
- 仅当结果不等于 `HEARTBEAT_SILENT_TOKEN` 时发送 Telegram 消息；
- 默认目标为允许列表中的第一个 Chat ID，也可显式设置
  `HEARTBEAT_CHAT_ID`。

模板里的心跳提示只是中性占位句。请在自己的私密环境变量里配置实际提示，
不要把私人内容提交到公开 Fork。

## 权限边界

公开模板不会默认加入 `--dangerously-skip-permissions`。如需指定模型或允许的
工具，可把官方 Claude Code 参数写成 JSON 字符串放入
`CLAUDE_EXTRA_ARGS_JSON`，例如：

```json
["--model", "sonnet", "--allowedTools", "Read"]
```

只给容器挂载 Telegram 使用者本来就应当访问的文件和工具。部署在网络上的
聊天入口会放大错误权限配置的后果。

## 开发与验证

```bash
npm test
docker build -t claude-p-telegram .
```

项目只使用 Node.js 内置模块；运行时没有第三方 npm 依赖。Telegram 和 Claude
Code 都通过各自官方接口调用。

## 许可

[MIT](./LICENSE)
