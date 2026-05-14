# HTTP + SSE API reference

BuildPilot's dashboard talks to the server entirely over HTTP/JSON and a
single Server-Sent Events stream. Every action you can take in the UI
— create a project, edit a pipeline, trigger a build, change Telegram
settings — has a matching endpoint. This file documents them all.

**Base URL (default dev):** `http://127.0.0.1:51731`

The web app proxies `/api/*` and `/events` to the server, so when
developing you can also use the Vite origin (`http://127.0.0.1:51732`)
as the base and skip CORS. Production deployments bind the server
directly.

**Conventions**

- All request and response bodies are JSON unless noted (`application/json`).
- IDs are server-generated UUIDs (strings).
- Timestamps are unix milliseconds (numbers).
- `400` = body failed zod validation (see `error` field for `flatten()` output).
- `404` = referenced resource not found.
- `409` = state conflict (e.g. cancel an already-finished build).
- `410` = artifact metadata exists but the on-disk file is gone.
- `401` = webhook signature / token check failed.

**Authentication.** None today. Bind to `127.0.0.1` or use a trusted
LAN until the auth phase ships (Phase 2.6.B in `TODO.md`).

---

## Table of contents

- [Projects](#projects)
- [Pipelines](#pipelines)
- [Builds](#builds)
- [Build log entries](#build-log-entries)
- [Build artifacts](#build-artifacts)
- [Node templates](#node-templates)
- [Saved SSH hosts](#saved-ssh-hosts)
- [Triggers & webhooks](#triggers--webhooks)
- [Server config](#server-config)
- [SSE events](#sse-events)
- [Type reference](#type-reference)

---

## Projects

A project is a registered local git repository. Pipelines belong to
projects.

### `GET /api/projects`

List all projects. Returns `ProjectSummary[]` — each entry is a
`Project` plus `watchedBranches`, `lastBuildSha`, `lastBuildAt`.

```bash
curl http://127.0.0.1:51731/api/projects
```

### `GET /api/projects/:id`

Get a single project. Returns `Project` or `404`.

### `POST /api/projects`

Register a local git directory. BuildPilot auto-detects the default
branch (`main`/`master`); pass `name` to override the directory basename.

```bash
curl -X POST http://127.0.0.1:51731/api/projects \
  -H 'content-type: application/json' \
  -d '{"path":"C:/work/my-game","name":"MyGame"}'
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `path` | string | yes | Absolute path to the git repo |
| `name` | string | no | Display name |

Returns the created `Project`. Fires `projectAdded` on SSE.

### `DELETE /api/projects/:id`

Removes the project and cascades to its pipelines. Build history is
kept (the rows just lose their parent). Fires `projectRemoved`.

### `GET /api/projects/:id/branches`

Returns `string[]` — local + remote branches as reported by
`simple-git`.

### `GET /api/projects/:id/commits`

Lists commits on a branch.

| Query param | Type | Notes |
| --- | --- | --- |
| `branch` | string | Branch to read. Defaults to the project's default branch |
| `limit` | int | 0–500. Defaults to 50 |
| `sinceSha` | string | Only commits after this sha |
| `all` | bool | If `true`, returns commits across all branches |

Returns `Commit[]`.

### `POST /api/projects/:id/fetch`

Runs `git fetch --all` in the project. Returns `{ ok: true }`.

### `POST /api/projects/:id/pull`

Runs `git pull` on the current branch.

```json
{ "ok": true, "branch": "main", "result": "Already up to date." }
```

### `GET /api/projects/:id/current-branch`

```json
{ "branch": "main", "sha": "abc1234..." }
```

---

## Pipelines

A pipeline is a DAG of step nodes belonging to a project. Position
fields exist only for the React Flow canvas — you can pass arbitrary
`x`/`y` values when scripting.

### `GET /api/pipelines`

Lists pipelines. Optional query: `?projectId=<id>` to filter.

### `GET /api/pipelines/:id`

Returns a single `Pipeline` or `404`.

### `POST /api/pipelines`

Creates a pipeline.

Request body (zod-validated):

```ts
{
  projectId: string,
  name: string,
  watch: {
    branch: string,
    intervalSec: number,            // positive integer
    autoTrigger: 'off' | 'ask' | 'pull' | 'pullAndBuild',
    telegramApprovals?: boolean
  },
  nodes: Array<{
    id: string,                     // unique within pipeline
    type: StepType,                 // one of 83 types (see PIPELINES.md)
    position: { x: number, y: number },
    data: Record<string, unknown>   // step-type-specific config
  }>,
  edges: Array<{
    id: string,
    source: string,                 // nodeId
    target: string,                 // nodeId
    condition?: 'success' | 'failure' | 'always'  // defaults to 'always'
  }>
}
```

**Full example — Unity dedicated server pipeline:**

```bash
curl -X POST http://127.0.0.1:51731/api/pipelines \
  -H 'content-type: application/json' \
  -d '{
    "projectId": "<project-id>",
    "name": "Linux dedicated server",
    "watch": { "branch": "development", "intervalSec": 60, "autoTrigger": "ask" },
    "nodes": [
      { "id":"n1", "type":"checkout",   "position":{"x":0,  "y":0}, "data":{"branch":"development"} },
      { "id":"n2", "type":"pull",       "position":{"x":240,"y":0}, "data":{"remote":"origin"} },
      { "id":"n3", "type":"shell",      "position":{"x":480,"y":0}, "data":{"command":"pnpm install"} },
      { "id":"n4", "type":"unityBatch", "position":{"x":720,"y":0},
        "data": {
          "unityPath":"C:/Program Files/Unity/Hub/Editor/2022.3.40f1/Editor/Unity.exe",
          "buildTarget":"StandaloneLinux64",
          "executeMethod":"BuildScript.BuildDedicatedServer"
        } }
    ],
    "edges": [
      { "id":"e1", "source":"n1", "target":"n2", "condition":"success" },
      { "id":"e2", "source":"n2", "target":"n3", "condition":"success" },
      { "id":"e3", "source":"n3", "target":"n4", "condition":"success" }
    ]
  }'
```

Returns the created `Pipeline`. Fires `pipelineChanged` (action
`created`). Sensitive fields in any node's `data` (`botToken`,
`password`, `secretAccessKey`, …) are encrypted with AES-256-GCM
before persistence.

### `PATCH /api/pipelines/:id`

Partial update — supply only the keys you want to change.

```bash
curl -X PATCH http://127.0.0.1:51731/api/pipelines/<id> \
  -H 'content-type: application/json' \
  -d '{"watch":{"branch":"main","intervalSec":120,"autoTrigger":"pullAndBuild"}}'
```

Updateable fields: `name`, `watch`, `nodes`, `edges`. (To re-parent a
pipeline to a different project, delete and recreate.)

Fires `pipelineChanged` (action `updated`).

> **Editing a graph programmatically.** Send the full new `nodes` and
> `edges` arrays — the server replaces both atomically. There's no
> "patch one node" endpoint; clone the current pipeline with
> `GET /api/pipelines/:id`, mutate the JS array, and `PATCH` it back.

### `DELETE /api/pipelines/:id`

Returns `{ ok: true }`. Fires `pipelineChanged` (action `deleted`).
Build history for this pipeline is kept.

### `POST /api/pipelines/:id/clone`

Duplicates a pipeline. Body optional:

```json
{ "name": "Copy of original pipeline" }
```

Returns the new `Pipeline`.

---

## Builds

### `GET /api/builds`

Lists builds, newest first.

| Query param | Notes |
| --- | --- |
| `projectId` | Filter to one project |
| `pipelineId` | Filter to one pipeline |
| `limit` | Default 50 |

### `GET /api/builds/:id`

Returns one `Build`. The `log` field is the legacy flat-text log; new
builds also have structured entries via `/entries` below.

### `POST /api/builds`

Triggers a build.

```ts
{
  pipelineId: string,
  fromNodeId?: string  // restart from one node (BFS over outgoing edges)
}
```

`fromNodeId` is what the dashboard's "Retry from failed step" button
uses — earlier nodes are skipped.

Returns the new `Build` immediately (status `pending`); the engine
picks it up asynchronously. Subscribe to `/events` to follow progress.

### `POST /api/builds/:id/cancel`

Cancels a `pending` or `running` build. Returns `{ ok: true }` or
`409` if the build already finished.

```bash
curl -X POST http://127.0.0.1:51731/api/builds/<build-id>/cancel
```

For running builds the engine signals all active child processes (and
SSH sessions) and flips the build to `cancelled`. For queued builds
the API flips the status directly.

---

## Build log entries

The new structured log surface. Each line is a `BuildLogEntry`:

```ts
{
  seq: number,                     // monotonic per build
  ts: number,                      // unix ms
  level: 'system' | 'info' | 'stdout' | 'stderr' | 'success' | 'failure',
  nodeId: string | null,
  stepType: StepType | null,
  message: string
}
```

### `GET /api/builds/:id/entries`

| Query param | Notes |
| --- | --- |
| `sinceSeq` | Return entries with `seq > sinceSeq`. Use for polling |
| `limit` | Cap returned rows |

**Recommended pattern**: hit `/entries` once to seed, then subscribe to
`/events` and append `buildLogEntry` deltas. The dashboard does this
to recover gracefully from SSE disconnects.

```bash
curl http://127.0.0.1:51731/api/builds/<build-id>/entries
curl 'http://127.0.0.1:51731/api/builds/<build-id>/entries?sinceSeq=1234'
```

---

## Build artifacts

Steps like `artifact`, `s3Upload`, `dsymUpload`, etc. record produced
files into a per-build catalog.

### `GET /api/builds/:id/artifacts`

Returns `BuildArtifact[]`:

```ts
{
  id: number,
  buildId: string,
  path: string,    // absolute path on the BuildPilot host
  size: number,
  mtime: number,
  createdAt: number
}
```

### `GET /api/artifacts/:id/download`

Streams the file back as `application/octet-stream` with a
`content-disposition: attachment` header. Returns `410` if the on-disk
file is no longer present (manually deleted, or the build host moved).

```bash
curl -O -J http://127.0.0.1:51731/api/artifacts/42/download
```

---

## Node templates

User-saved "preset nodes" — drag once, get a pre-filled node of
`baseStepType`.

### `GET /api/node-templates`

Returns `NodeTemplate[]`.

### `GET /api/node-templates/:id`

### `POST /api/node-templates`

```ts
{
  name: string,
  description?: string | null,
  baseStepType: StepType,
  data: Record<string, unknown>   // pre-filled values (encrypted at rest)
}
```

### `PATCH /api/node-templates/:id`

Partial update.

### `DELETE /api/node-templates/:id`

Fires `nodeTemplateChanged` on every mutation.

---

## Saved SSH hosts

Saved in `~/.buildpilot/hosts.json`. Mac-only steps (`xcodebuild`,
`keychainUnlock`, `testflightUpload`, …) and `remoteSsh` / `sftpUpload`
can reference a saved host by id instead of duplicating credentials
per step.

### `GET /api/hosts`

Returns `SshHost[]`. Passwords are encrypted on disk; the API returns
them encrypted too — the dashboard never re-displays a saved password.

### `GET /api/hosts/:id`

### `POST /api/hosts`

```ts
{
  name: string,                    // e.g. "Mac Mini — arm64"
  host: string,                    // user@host[:port]
  identityFile?: string | null,    // e.g. "~/.ssh/id_ed25519"
  password?: string | null,        // encrypted at rest
  skipStrictHostKey?: boolean,     // disable known_hosts pinning
  description?: string | null
}
```

### `PATCH /api/hosts/:id`

Partial update with the same fields.

### `DELETE /api/hosts/:id`

### `POST /api/hosts/:id/ping`

SSH-connects to the host and probes its capabilities. Updates
`SshHost.capabilities` (Xcode version, macOS version, architecture).
Returns:

```ts
// On success
{ ok: true, capabilities: HostCapabilities }
// On failure (still HTTP 200 — UI renders the error inline)
{ ok: false, error: string }
```

The dashboard badges each host with its arch + Xcode version so you
can pick the right builder when configuring an iOS pipeline.

Fires `hostChanged` on every mutation.

---

## Triggers & webhooks

Four ways to trigger a build for a pipeline from outside the dashboard
or the poller. The full guide including signature verification examples
is in [WEBHOOKS.md](WEBHOOKS.md).

### Generic API trigger

```
POST /api/triggers/:pipelineId[?token=<secret>]
```

Body (all optional):

```ts
{
  triggerSha?: string,            // defaults to the project's HEAD
  triggerBranch?: string,         // defaults to current branch
  variables?: Record<string, string>  // future: interpolation into steps
}
```

Returns the created `Build`. If the env var
`BUILDPILOT_WEBHOOK_SECRET_<pipelineId>` is set, the request must
include a matching `?token=<value>` query string (timing-safe
comparison). Pipeline-id hyphens become double-underscores in the env
name.

```bash
curl -X POST 'http://127.0.0.1:51731/api/triggers/abcd-1234?token=shhh' \
  -H 'content-type: application/json' \
  -d '{"triggerBranch":"release/2.1"}'
```

### GitHub webhook

```
POST /api/webhooks/github/:pipelineId
```

Accepts GitHub `push` and `pull_request` (opened/synchronize/reopened)
events. `ping` events return `{ ok: true, pong: true }`. If
`BUILDPILOT_WEBHOOK_SECRET_<pipelineId>` is set, the `X-Hub-Signature-256`
header (`sha256=<hex>`) is verified with HMAC-SHA256 over the raw body.

Branch + sha are extracted from `head_commit.id` (push) or
`pull_request.head.{ref,sha}` (PR).

Returns `{ ok: true, buildId }` or `{ ok: true, ignored: "<event>" }`
for events that don't map to a build.

### GitLab webhook

```
POST /api/webhooks/gitlab/:pipelineId
```

Push, tag push, and merge-request events. Auth uses GitLab's
`X-Gitlab-Token` header (literal string match — GitLab doesn't sign
the body). Branch + sha come from `ref` and `checkout_sha`.

### Gitea webhook

```
POST /api/webhooks/gitea/:pipelineId
```

Same payload shape as GitHub. Auth uses `X-Gitea-Signature` (raw hex,
no `sha256=` prefix).

---

## Server config

### `GET /api/config/telegram`

Returns the masked public shape — secrets never leave the server:

```ts
{
  enabled: boolean,
  hasBotToken: boolean,
  botTokenPreview: string,    // "" or "••••<last4>"
  hasChatId: boolean,
  chatIdPreview: string       // "" or "@channel" or "••••<last4>"
}
```

### `PUT /api/config/telegram`

Update bot config. The bot polling loop is restarted in-process on
every save.

```ts
{
  enabled?: boolean,
  botToken?: string,          // "" → keep existing
  defaultChatId?: string,     // "" → keep existing
  clearBotToken?: boolean,    // explicitly wipe stored token
  clearChatId?: boolean
}
```

```bash
# Set / update both fields
curl -X PUT http://127.0.0.1:51731/api/config/telegram \
  -H 'content-type: application/json' \
  -d '{"enabled":true,"botToken":"123:ABC","defaultChatId":"-100123456"}'

# Toggle enabled without re-entering secrets
curl -X PUT http://127.0.0.1:51731/api/config/telegram \
  -H 'content-type: application/json' \
  -d '{"enabled":false}'

# Wipe the stored token
curl -X PUT http://127.0.0.1:51731/api/config/telegram \
  -H 'content-type: application/json' \
  -d '{"clearBotToken":true}'
```

Both fields are stored as `enc:1:<base64>` in
`~/.buildpilot/config.json`.

### `POST /api/config/telegram/test`

Sends a sanity-check message using the stored config, or override
either field for ad-hoc tests:

```bash
curl -X POST http://127.0.0.1:51731/api/config/telegram/test \
  -H 'content-type: application/json' \
  -d '{}'
# → { "ok": true }

curl -X POST http://127.0.0.1:51731/api/config/telegram/test \
  -H 'content-type: application/json' \
  -d '{"chatId":"-100987654"}'
# → { "ok": false, "error": "chat not found" }
```

---

## SSE events

A single stream broadcasts everything that happens on the server.

### `GET /events`

`text/event-stream`. On connection you get a synthetic `hello` event
(`{type:"hello",at:<ms>}`) followed by a heartbeat comment (`: ping`)
every 25 seconds.

```bash
curl -N http://127.0.0.1:51731/events
```

**Event types** (all wrapped as `data: <json>\n\n`):

| Type | Payload |
| --- | --- |
| `hello` | `{ at: number }` — sent once on connect |
| `newCommit` | `{ projectId, pipelineId, branch, commits: Commit[] }` — poller saw new commits on a watched branch |
| `pollerTick` | `{ projectId, branch, head: string }` — every poll cycle |
| `buildStarted` | `{ build: Build }` — build transitioned to `running` |
| `buildStepStarted` | `{ buildId, pipelineId, nodeId, stepType }` |
| `buildStepFinished` | `{ buildId, pipelineId, nodeId, stepType, status: 'success' \| 'failed' \| 'skipped' }` |
| `buildLogEntry` | `{ buildId, entry: BuildLogEntry }` — one structured log line |
| `buildFinished` | `{ build: Build }` — terminal state |
| `projectAdded` | `{ project: Project }` |
| `projectRemoved` | `{ projectId }` |
| `pipelineChanged` | `{ pipelineId, action: 'created' \| 'updated' \| 'deleted' }` |
| `nodeTemplateChanged` | `{ templateId, action: 'created' \| 'updated' \| 'deleted' }` |
| `hostChanged` | `{ hostId, action: 'created' \| 'updated' \| 'deleted' }` |

**Reconnect strategy.** The web app refreshes its core lists
(projects / pipelines / builds / templates / hosts) on every
`hello` event, so an SSE drop self-heals on reconnect. If you're
building a custom client, do the same.

---

## Type reference

The authoritative definitions live in
[`packages/shared-types/src/index.ts`](../packages/shared-types/src/index.ts).
Highlights:

### `Project`

```ts
{
  id: string,
  name: string,
  path: string,
  defaultBranch: string,
  createdAt: number
}
```

### `Pipeline` / `PipelineWatch` / `PipelineNode` / `PipelineEdge`

```ts
Pipeline = {
  id: string,
  projectId: string,
  name: string,
  watch: PipelineWatch,
  nodes: PipelineNode[],
  edges: PipelineEdge[],
  createdAt: number,
  updatedAt: number,
  lastBuiltSha: string | null
}

PipelineWatch = {
  branch: string,
  intervalSec: number,
  autoTrigger: 'off' | 'ask' | 'pull' | 'pullAndBuild',
  telegramApprovals?: boolean
}

PipelineNode = {
  id: string,
  type: StepType,
  position: { x: number, y: number },
  data: Record<string, unknown>     // step-type-specific
}

PipelineEdge = {
  id: string,
  source: string,
  target: string,
  condition?: 'success' | 'failure' | 'always'
}
```

### `Build`

```ts
{
  id: string,
  pipelineId: string,
  projectId: string,
  triggerSha: string,
  triggerBranch: string,
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled',
  startedAt: number,
  finishedAt: number | null,
  log: string                       // legacy flat log
}
```

### `BuildLogEntry`

```ts
{
  seq: number,
  ts: number,
  level: 'system' | 'info' | 'stdout' | 'stderr' | 'success' | 'failure',
  nodeId: string | null,
  stepType: StepType | null,
  message: string
}
```

### `SshHost` / `HostCapabilities`

```ts
SshHost = {
  id: string,
  name: string,
  host: string,                     // user@host[:port]
  identityFile?: string | null,
  password?: string | null,         // encrypted at rest
  skipStrictHostKey?: boolean,
  description?: string | null,
  capabilities?: HostCapabilities,
  createdAt: number,
  updatedAt: number
}

HostCapabilities = {
  xcodeVersion?: string,            // first line of `xcodebuild -version`
  macosVersion?: string,            // `sw_vers -productVersion`
  arch?: string,                    // `uname -m` — "arm64", "x86_64"
  rawSnippet?: string,
  lastCheckedAt: number
}
```

### `Commit`

```ts
{
  sha: string,
  shortSha: string,
  parents: string[],
  author: string,
  email: string,
  date: number,
  subject: string,
  body: string
}
```

For step-specific `data` shapes (e.g. `UnityBatchStepData`,
`TelegramNotifyStepData`, `RemoteSshStepData`), see
[`packages/shared-types/src/index.ts`](../packages/shared-types/src/index.ts)
and the per-step field schemas in
[`packages/step-registry/src/index.ts`](../packages/step-registry/src/index.ts).
The pipeline authoring guide ([PIPELINES.md](PIPELINES.md)) walks through
the common ones.
