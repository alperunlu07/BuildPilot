import type {
  Pipeline,
  ProjectSummary,
  QueueSnapshot,
  ServerEvent,
} from '@buildpilot/shared-types';
import { getAuthHeaders, getBaseUrl } from './config';

export async function fetchProjects(): Promise<ProjectSummary[]> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/projects`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    return (await res.json()) as ProjectSummary[];
  } catch {
    return [];
  }
}

// All pipelines across projects (the tray groups them by projectId). []-on-error
// so a transient failure just yields empty project submenus, not a crash.
export async function fetchPipelines(): Promise<Pipeline[]> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/pipelines`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    return (await res.json()) as Pipeline[];
  } catch {
    return [];
  }
}

// Collapse the lane-grouped queue snapshot into the two counts the tray shows:
// builds currently running and builds waiting to start. Zeroes on error.
export async function fetchQueueCounts(): Promise<{
  running: number;
  queued: number;
}> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/queue`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return { running: 0, queued: 0 };
    const snap = (await res.json()) as QueueSnapshot;
    let running = 0;
    let queued = 0;
    for (const lane of snap.lanes ?? []) {
      running += lane.running?.length ?? 0;
      queued += lane.pending?.length ?? 0;
    }
    return { running, queued };
  } catch {
    return { running: 0, queued: 0 };
  }
}

// Trigger a build for a pipeline (the tray's "run from here"). Returns whether
// the server accepted it so the caller can surface success/failure feedback.
export async function triggerBuild(pipelineId: string): Promise<boolean> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/builds`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ pipelineId }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Backoff window for SSE reconnects. The base matches the previous fixed 2s
// cadence; we add randomized jitter (and never schedule below the base) so a
// permanently-down server doesn't produce a perfectly tight, synchronised
// reconnect loop. RECONNECT_JITTER_MS is the spread added on top of the base.
const RECONNECT_BASE_MS = 2000;
const RECONNECT_JITTER_MS = 1000;

// Subscribe to the server's SSE stream and invoke `onEvent` for every parsed
// ServerEvent. Reconnects with a jittered backoff whenever the stream drops
// (server restart, transient network blip). Returns a disposer that stops
// reconnecting and aborts the in-flight request.
export function subscribeEvents(onEvent: (e: ServerEvent) => void): () => void {
  let stopped = false;
  let controller: AbortController | null = null;

  const connect = async (): Promise<void> => {
    if (stopped) return;
    controller = new AbortController();
    try {
      const res = await fetch(`${getBaseUrl()}/events`, {
        headers: { accept: 'text/event-stream', ...getAuthHeaders() },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`events ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line. Each `data:` line holds
        // one JSON-encoded ServerEvent (see apps/server/src/api/events.ts).
        let sep: number;
        while ((sep = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          for (const line of frame.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            try {
              onEvent(JSON.parse(payload) as ServerEvent);
            } catch {
              /* ignore malformed frame */
            }
          }
        }
      }
    } catch {
      /* fall through to reconnect */
    }

    if (!stopped) {
      const delay = RECONNECT_BASE_MS + Math.random() * RECONNECT_JITTER_MS;
      setTimeout(connect, delay);
    }
  };

  void connect();

  return () => {
    stopped = true;
    controller?.abort();
  };
}
