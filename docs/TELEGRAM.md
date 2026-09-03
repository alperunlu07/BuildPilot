# Telegram integration

BuildPilot can send Telegram messages from pipelines (the
`telegramNotify` step), prompt you for build approvals when a watched
branch advances, and respond to chat commands so you can list / build
pipelines from your phone.

This doc covers BotFather setup, finding your chat id, configuring the
dashboard, the bot command reference, and the approval flow.

For the HTTP API behind the Settings page, see
[API.md → Server config](API.md#server-config).

---

## Table of contents

- [What you can do](#what-you-can-do)
- [Setup — three steps](#setup--three-steps)
  - [1. Create a bot via @BotFather](#1-create-a-bot-via-botfather)
  - [2. Get the chat id](#2-get-the-chat-id)
  - [3. Configure BuildPilot](#3-configure-buildpilot)
- [Bot commands](#bot-commands)
- [Startup report](#startup-report)
- [Approval prompts on new commits](#approval-prompts-on-new-commits)
- [The `telegramNotify` step](#the-telegramnotify-step)
- [Security model](#security-model)
- [Troubleshooting](#troubleshooting)

---

## What you can do

| Surface | What happens | Where it's configured |
| --- | --- | --- |
| **Pipeline step** | A `telegramNotify` node sends a message during a build | The step's `data` (or fall through to defaults) |
| **Approval prompts** | New commits on a watched branch send an inline **✅ Build / ⏭ Skip** message | `pipeline.watch.telegramApprovals = true` |
| **Bot commands** | `/list`, `/build`, `/help` work in your authorised chat | Settings → Telegram |
| **Startup report** | Every server boot posts machine, local time, server URL and the latest commits of BuildPilot *and* every registered project | Settings → Telegram → **Startup report** |
| **Build-started / build-finished pings** | Optional — wire `telegramNotify` nodes with `condition: always` | Pipeline edges |

---

## Setup — three steps

### 1. Create a bot via @BotFather

Telegram bots are created by talking to the official `@BotFather`
account.

1. Open Telegram and search for **`@BotFather`**.
2. Send `/newbot`.
3. Choose a display name (e.g. `MyTeam BuildPilot`).
4. Choose a username — must end with `bot` (e.g. `myteam_buildpilot_bot`).
5. BotFather replies with a token in the form
   `123456789:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`. **Copy it.**
6. (Optional) `/setprivacy` → **Disable** if you want the bot to read
   group messages. With privacy ON the bot only sees commands directed
   at it (`/build@myteam_buildpilot_bot`) — fine for most users.

### 2. Get the chat id

BuildPilot only talks to **one** chat. The simplest way to find that
chat's id:

**For a 1:1 chat with yourself**

1. Search for **`@userinfobot`** in Telegram and send `/start`.
2. It replies with your numeric user id (e.g. `995626626`). That's
   your chat id.

**For a group chat**

1. Add the bot to the group.
2. Send any message in the group.
3. Hit `https://api.telegram.org/bot<TOKEN>/getUpdates` in your browser
   (replace `<TOKEN>`).
4. The response includes `"chat":{"id":-1001234567890,…}`. Group ids
   are negative; supergroup ids start with `-100`.

**For a public channel**

Use the channel handle directly, e.g. `@my_channel` — BuildPilot
treats `@…` values as channel handles and skips the numeric chat-id
flow. The bot must be an admin of the channel.

### 3. Configure BuildPilot

Open the dashboard, click **Settings** in the sidebar, then fill the
**Telegram** section:

| Field | Notes |
| --- | --- |
| **Enabled** | Master toggle; uncheck to stop the bot polling loop |
| **Bot token** | Paste the BotFather token. Stored encrypted (AES-256-GCM). Once saved it's never displayed in full again — only `••••<last4>` |
| **Default chat ID** | The numeric id from step 2, or `@channel_handle`. Also encrypted at rest |

Click **Save**. The server restarts the polling loop in-process; you
should see this in the server log:

```
INFO: telegram bot polling for updates
```

Then click **Send test message** — you should receive a "BuildPilot
test message" in the target chat within a second. If you don't, the
button shows `Test failed: <reason>` (chat not found, blocked,
wrong token, …).

Done. The same settings can be driven from the API
(`PUT /api/config/telegram`) for headless deployments — see
[API.md → Server config](API.md#server-config).

---

## Bot commands

Once configured, send these in the authorised chat:

| Command | Effect |
| --- | --- |
| `/start` | Same as `/help` |
| `/help` | Lists available commands |
| `/list` | Lists every pipeline with its project + watched branch |
| `/build` | Replies with a button menu of every pipeline; tap one to start it |
| `/build <name>` | Triggers the pipeline whose name **contains** `<name>` (case-insensitive). Multiple matches → bot asks you to refine |

In groups, append the bot username so commands aren't ambiguous —
e.g. `/build@myteam_buildpilot_bot ios`.

When a build starts via Telegram, the bot edits its own message to
show the build id (`🚀 Build started for iOS → TestFlight — abc12345`).
For the live log, jump over to the dashboard — Telegram is intentionally
minimal here.

### Authorisation

The bot only responds to the configured **Default chat ID**. Any other
chat receives **no reply at all** — this is intentional: the bot
doesn't advertise its existence to randoms who guess the username.
If you find your bot in someone else's chat, they'll see it sit
silent.

To rotate which chat is authorised, just update **Default chat ID**
in Settings.

---

## Startup report

Whenever the BuildPilot server starts — you launched the desktop app,
rebooted the build machine, or the service restarted on its own — the
bot posts a short report to the **default chat**:

```
🚀 BuildPilot started

PC:     BUILDBOX (PF)
OS:     win32 10.0.26200
Time:   03.09.2026 10:45:12 (UTC+03:00)
Server: http://127.0.0.1:35700 · v0.1.0

BuildPilot @ main · in sync · 6 uncommitted files
  • fe9d09c fix(desktop): build the main process before `start` — Alper Ünlü · 21.07
  • 479bc67 fix(server): fall back to another port instead of failing to start — Alper Ünlü · 21.07

Zooyale @ development · ↓2 · clean
  • 7c31a08 feat: daily reward streak — Alper Ünlü · 02.09

NetworkTest @ development · in sync · clean
  • 1a9f4d2 fix: lobby reconnect — Alper Ünlü · 28.08
```

It answers "which machine is this, and what code is it running?" at a
glance when one bot serves several build boxes. The message is sent
silently (no notification sound).

**Which repositories are listed.** The BuildPilot checkout the server
itself runs from comes first (found by walking up from the server
source directory until a `.git` shows up, 5 commits deep), then one
section per **registered project** whose path is a git checkout, 3
commits each, newest project first.

Projects sharing a working copy are listed once, a project pointing at
the BuildPilot checkout isn't repeated, and a project whose directory
has gone missing is skipped. At most 10 projects are inspected; the
rest are summarised as `… and N more repos not shown`, which also
appears if the message would otherwise pass Telegram's 4096-char limit
(whole sections are dropped, never half of one).

A packaged install outside any checkout has no BuildPilot section — set
`BUILDPILOT_REPO_DIR` to point the report at a specific repository.

**Restart flood control.** `pnpm dev` restarts the server on every file
save, and a crash loop restarts it faster still. A report is therefore
suppressed if one was already sent in the last 5 minutes; the last-sent
timestamp lives in `~/.buildpilot/startup-report.json`. Override the
window with `BUILDPILOT_STARTUP_NOTIFY_COOLDOWN_MS` (`0` disables the
suppression entirely).

**Turning it off.** Settings → Telegram → **Startup report**, or in
`~/.buildpilot/config.json`:

```jsonc
"telegram": {
  "enabled": true,
  "startupNotify": false   // ← absent means on
}
```

The report never blocks or fails the boot: the repositories are
inspected in parallel, and git errors, a slow `git status` (8s budget
per repo) and Telegram outages are logged and dropped.

---

## Approval prompts on new commits

If you set `watch.telegramApprovals = true` on a pipeline *and* the
bot is configured, every new-commit event sends an interactive
message:

```
📦 New commits on main (3 commits — abc1234)

[ ✅ Build ]   [ ⏭ Skip ]
```

- **✅ Build** → fires a build for that pipeline immediately. The
  message edits itself to `✅ <username> approved → build abc12345
  started`.
- **⏭ Skip** → just logs the skip and edits the message to
  `⏭ <username> skipped`.

This pairs well with `watch.autoTrigger = 'ask'` (the default) — the
dashboard toast and the Telegram prompt fire side-by-side, and either
one can approve. If you flip `autoTrigger` to `pullAndBuild`, the
Telegram approval becomes the *delay* before automatic builds, which
isn't usually what you want — pick one or the other.

You can also flip the flag in the editor: open a pipeline → **Watch**
section → toggle **Telegram ask**.

---

## The `telegramNotify` step

Drop a `telegramNotify` step into any pipeline to send messages mid-build.

| Field | Notes |
| --- | --- |
| `text` (required) | Message body. Telegram HTML / MarkdownV2 supported via `parseMode` |
| `botToken?` | Empty → fall back to `telegram.botToken` from settings |
| `chatId?` | Empty → fall back to `telegram.defaultChatId` |
| `parseMode?` | `HTML`, `MarkdownV2`, or `plain` (default) |
| `silent?` | `'true'` for muted notifications |

A common pattern is to leave `botToken` / `chatId` blank in the step
and let it inherit from settings — that way, changing the team chat
is one place to edit, not one per pipeline.

**Notify-on-break.** Wire a `failure` edge from your build step into a
`telegramNotify` node. See
[PIPELINES.md → Notify-on-break](PIPELINES.md#notify-on-break-slack--telegram).

---

## Security model

- **Token + chat ID are encrypted at rest** with AES-256-GCM. Master
  key lives at `~/.buildpilot/master.key` (POSIX 0600; Windows NTFS
  ACL). Deleting the key bricks every stored secret — back it up if
  you back up the config.
- **Tokens never leave the server in cleartext.** The `GET
  /api/config/telegram` endpoint returns `••••<last4>` previews only;
  the dashboard never re-displays the full token.
- **Bot is single-chat.** Only commands from the configured chat id
  are honoured — no command surface for anonymous Telegram users.
- **No web-callback URL.** BuildPilot uses Telegram's long-polling
  (`getUpdates`); the server never needs an inbound webhook URL, so
  you can run the bot from a fully private network.

What encryption does **not** protect against: another local process
running as the same OS user. Threat model is "casual exposure" — DB
backups, screenshots of config files, accidentally committing config
files (the .gitignore already covers `~/.buildpilot/`).

If you suspect the token leaked, regenerate it via BotFather
(`/revoke`) and update Settings → Telegram.

---

## Troubleshooting

### "Test message" returns `chat not found`

The bot is talking to Telegram correctly, but the chat id is wrong or
the bot isn't a member of that chat. Fix:

- For a group: make sure you've added the bot to the group at least
  once.
- For a channel: the bot must be an **admin**, not just a member.
- For a `@handle`: only public channels work this way. Private channels
  need the numeric `-100…` id.

### "Test message" returns `Forbidden: bot was blocked by the user`

The target user (in a 1:1 chat) blocked the bot in Telegram. Have them
unblock and retry.

### Bot doesn't respond to `/build` or `/list`

- Confirm **Enabled** is on in Settings → Telegram.
- Confirm the chat you're typing in matches the configured **Default
  chat ID**. Other chats get silent ignore.
- Tail server logs — every inbound update is logged at INFO level.
- If you changed BotFather privacy to **Enabled** after adding the bot
  to a group, kick + re-add the bot so the new ACL takes effect.

### Bot polled, restarted, polled again forever

That's the normal log shape — the long-polling loop reconnects every
30s. If you see a real error (`429`, `401`), the most common causes:

- **`401 Unauthorized`** — wrong token. Update Settings → Telegram.
- **`409 Conflict: terminated by other getUpdates request`** — another
  bot instance (older container, another machine) is polling with the
  same token. Stop the duplicate.

### Approval prompt didn't fire on a new commit

Check both flags are set on the pipeline:

```jsonc
"watch": {
  "branch": "main",
  "intervalSec": 60,
  "autoTrigger": "ask",
  "telegramApprovals": true   // ← this one
}
```

And confirm `Enabled` is on in Settings. If `telegramApprovals` is
true but the bot is disabled, the poller silently falls back to
"dashboard toast only".

### I want a different chat for one pipeline

Use a `telegramNotify` step with an explicit `chatId` — the step's
own override beats the global default. Step-level `botToken` overrides
also work if you want a different bot per project.
