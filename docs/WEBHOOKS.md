# Webhook triggers

Every pipeline gets four trigger endpoints automatically, so you can
fire a build from GitHub / GitLab / Gitea push events, from a CI runner
upstream of BuildPilot, or from any cron / script that can speak HTTP.

The poller stays as a fallback — webhook drops don't strand a build,
they just delay it until the next tick.

This document is the setup guide; for the request/response shapes see
[API.md → Triggers & webhooks](API.md#triggers--webhooks).

---

## Table of contents

- [Endpoint overview](#endpoint-overview)
- [Per-pipeline secrets](#per-pipeline-secrets)
- [GitHub](#github)
- [GitLab](#gitlab)
- [Gitea](#gitea)
- [Generic API trigger](#generic-api-trigger)
- [Exposing BuildPilot to the internet](#exposing-buildpilot-to-the-internet)
- [Troubleshooting](#troubleshooting)

---

## Endpoint overview

| Provider | Endpoint | Auth |
| --- | --- | --- |
| Generic API | `POST /api/triggers/:pipelineId[?token=…]` | Optional token query param |
| GitHub | `POST /api/webhooks/github/:pipelineId` | Optional HMAC-SHA256 in `X-Hub-Signature-256` |
| GitLab | `POST /api/webhooks/gitlab/:pipelineId` | Optional token in `X-Gitlab-Token` |
| Gitea | `POST /api/webhooks/gitea/:pipelineId` | Optional HMAC-SHA256 in `X-Gitea-Signature` |

`:pipelineId` is the UUID returned by `POST /api/pipelines` — same id
that appears in the dashboard URL when you open a pipeline.

---

## Per-pipeline secrets

BuildPilot reads each pipeline's secret from an environment variable
on the server process:

```
BUILDPILOT_WEBHOOK_SECRET_<pipelineId>
```

Hyphens in the pipeline id become **double underscores** in the env
name. So pipeline id `abc-1234-def` becomes
`BUILDPILOT_WEBHOOK_SECRET_abc__1234__def`.

- **Not set** → the endpoint accepts any payload (no signature check).
  Fine for local testing; not safe to expose to the internet.
- **Set** → the request must include a matching signature / token.
  Comparison is timing-safe.

Set the env vars in whatever way you launch BuildPilot — `pnpm dev`
inherits the parent shell's environment, so on PowerShell:

```powershell
$env:BUILDPILOT_WEBHOOK_SECRET_abc__1234__def = "shhh-pick-something-random"
pnpm dev
```

Or in a `systemd` unit / Docker compose `env:` block. There's no
per-pipeline secret field in the DB yet — that's
[TODO.md → Phase 2.6.A](../TODO.md).

> **Pick a long secret.** 32+ random characters is the baseline; if
> you're going to expose BuildPilot to the internet, treat the secret
> like an SSH key — anyone who has it can trigger arbitrary builds on
> your machine.

---

## GitHub

### 1. Configure the webhook in GitHub

Repository → **Settings** → **Webhooks** → **Add webhook**.

| Field | Value |
| --- | --- |
| Payload URL | `https://<your-host>/api/webhooks/github/<pipelineId>` |
| Content type | `application/json` |
| Secret | The same value you put in `BUILDPILOT_WEBHOOK_SECRET_<pipelineId>` |
| Which events? | "Just the push event" (start there; toggle PR events later) |
| Active | ✅ |

GitHub will fire a `ping` event when you save — BuildPilot responds
with `{ "ok": true, "pong": true }` so you'll see ✓ in the GitHub UI.

### 2. Events handled

- **`push`** — build fires with `triggerBranch = ref` (strip
  `refs/heads/`), `triggerSha = head_commit.id`.
- **`pull_request`** — only `opened`, `synchronize`, and `reopened`
  actions trigger. `triggerBranch = pull_request.head.ref`,
  `triggerSha = pull_request.head.sha`. Other actions
  (`closed`, `labeled`, …) return `{ ok: true, ignored: "…" }`.
- **`ping`** — answered with `pong`.

### 3. Signature verification

GitHub signs the raw request body with HMAC-SHA256 and sends the result
as `X-Hub-Signature-256: sha256=<hex>`. BuildPilot computes the same
HMAC using your secret and compares with `timingSafeEqual`. Mismatch →
`401 { error: "signature mismatch" }`.

If you don't set a secret, BuildPilot skips verification — handy for
trying things out locally with `smee.io` / `ngrok`. Never do this
when the endpoint is internet-reachable.

---

## GitLab

### 1. Configure the webhook

Project → **Settings** → **Webhooks**:

| Field | Value |
| --- | --- |
| URL | `https://<your-host>/api/webhooks/gitlab/<pipelineId>` |
| Secret token | The same value you put in `BUILDPILOT_WEBHOOK_SECRET_<pipelineId>` |
| Trigger | Push events, Tag push events, Merge request events |

### 2. Events handled

GitLab's payload uses `object_kind` (or `event_name`) to identify the
event:

- `push` — `triggerBranch = ref` (strip `refs/heads/`),
  `triggerSha = checkout_sha`.
- `tag_push` — `triggerBranch = ref` (strip `refs/tags/`),
  `triggerSha = checkout_sha`.
- `merge_request` — same extraction; uses the MR's source ref + sha.

Anything else returns `{ ok: true, ignored: "unhandled object_kind" }`.

### 3. Auth

GitLab does **not** sign payloads with HMAC — it just echoes the
secret token in the `X-Gitlab-Token` header. BuildPilot compares it
to the env var with `timingSafeEqual`. Treat the secret accordingly
(no HMAC = anyone who reads the header in transit can replay).

> **HTTPS is mandatory for GitLab webhooks** in any non-loopback
> setup. Run BuildPilot behind a TLS-terminating reverse proxy
> (Caddy / Nginx / Traefik / Tailscale Funnel).

---

## Gitea

Gitea's webhook payload mirrors GitHub's, so BuildPilot reuses the
GitHub payload extractor.

### 1. Configure

Repository → **Settings** → **Webhooks** → **Gitea (Default)**.

| Field | Value |
| --- | --- |
| Target URL | `https://<your-host>/api/webhooks/gitea/<pipelineId>` |
| HTTP Method | POST |
| POST Content Type | `application/json` |
| Secret | The same value you put in `BUILDPILOT_WEBHOOK_SECRET_<pipelineId>` |
| Events | Push, Pull request (opened/synchronize/reopened) |

### 2. Signature

Gitea signs with HMAC-SHA256, but unlike GitHub it sends the **raw
hex** in `X-Gitea-Signature` — no `sha256=` prefix. BuildPilot handles
that distinction internally; you don't need to do anything special.

`ping` events return `{ ok: true, pong: true }`.

---

## Generic API trigger

For anything that isn't one of the supported VCS providers — internal
CI runners, cron jobs, downstream pipelines, a "deploy now" button on
your wiki — use the generic trigger:

```
POST /api/triggers/:pipelineId[?token=<value>]
```

Body (all optional):

```json
{
  "triggerBranch": "release/2.1",
  "triggerSha": "abc1234...",
  "variables": { "ENVIRONMENT": "staging", "RELEASE_TAG": "v2.1.0" }
}
```

When neither `triggerBranch` nor `triggerSha` is provided, BuildPilot
uses the project's current branch + HEAD. The `variables` field is
echoed into the build log header (and will feed step-input
interpolation once
[Phase 4 Cluster C](../TODO.md) ships).

If `BUILDPILOT_WEBHOOK_SECRET_<pipelineId>` is set, the request must
include `?token=<the-secret>`. Without the env var, the endpoint is
unauthenticated.

**Cron example (Linux, every weekday morning at 09:00):**

```cron
0 9 * * 1-5  curl -fsS -X POST \
  'https://buildpilot.internal/api/triggers/abc-1234?token=shhh' \
  -H 'content-type: application/json' \
  -d '{"triggerBranch":"main"}' \
  > /dev/null
```

**Bash / curl — kick off a build then poll for its result:**

```bash
BUILD=$(curl -s -X POST 'https://buildpilot.internal/api/triggers/abc-1234?token=shhh' \
  -H 'content-type: application/json' \
  -d '{"triggerBranch":"main"}' | jq -r .id)

while : ; do
  STATUS=$(curl -s "https://buildpilot.internal/api/builds/$BUILD" | jq -r .status)
  echo "$BUILD: $STATUS"
  case "$STATUS" in success|failed|cancelled) break ;; esac
  sleep 10
done

[ "$STATUS" = "success" ] || exit 1
```

---

## Exposing BuildPilot to the internet

The server has **no authentication** today (see
[TODO.md → Phase 2.6.B](../TODO.md)). Reaching the dashboard from the
public internet without putting an auth proxy in front is a recipe for
unwanted activity. For webhook reachability specifically, you have a
few sensible options:

1. **Reverse proxy with auth bypass for `/api/webhooks` only.** Caddy
   / Nginx / Traefik front the server, require basic-auth or mTLS for
   `/api/*` and `/events`, and pass through only the webhook paths
   (relying on HMAC signature for those).
2. **Tailscale / Cloudflare Tunnel + GitHub webhook proxy.** Run
   BuildPilot on a private network; expose just the webhook receivers
   through a tunnel.
3. **Local-only with a poller** — skip webhooks and let the git poller
   do the work. Slower (interval-bounded) but no inbound port needed.

---

## Troubleshooting

### `401 invalid or missing token`

You set `BUILDPILOT_WEBHOOK_SECRET_…` but the request didn't include
the right token / signature. Double-check:

- Env var name — hyphens in the pipeline id become **double
  underscores**.
- Provider-side secret matches the env var value byte-for-byte (no
  trailing newlines / quotes).
- For GitHub: the **Secret** field is set in the webhook config (not
  just the env var on BuildPilot's side).
- For GitLab: the value lives in **Secret token**, not "URL".

### `200 { ok: true, ignored: "<event>" }`

The webhook fired but didn't match an event BuildPilot acts on (e.g.
GitHub `pull_request` action `closed`, or an unhandled GitLab
`object_kind`). Configure your provider to send only the events you
want.

### Webhook didn't reach the server at all

Tail the server logs:

```bash
pnpm dev   # or however you launch the server
```

Every webhook hit logs `incoming request` and the response status.
If there's nothing in the logs:

- Network reachability — is the URL right? Use the provider's
  "Recent Deliveries" UI to inspect the response.
- Reverse-proxy config — strip / rewrite paths can mangle the URL
  before it reaches Fastify.
- BuildPilot is bound to `127.0.0.1` by default — change `host` in
  `~/.buildpilot/config.json` to bind elsewhere.

### Signature passes locally but fails in production

Usually a body-encoding issue. BuildPilot signs over the JSON form of
the parsed body (`JSON.stringify(req.body)`). If a reverse proxy
reformats the JSON (whitespace, key order), HMAC won't match. Make
sure your proxy passes the raw request body through unchanged.

### Re-trigger after a webhook drop

Manual `POST /api/builds { pipelineId }` always works regardless of
webhook config. The poller will also pick the missed commit up on the
next tick (interval-bounded).
