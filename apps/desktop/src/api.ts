import type { ProjectSummary, ServerEvent } from '@buildpilot/shared-types';
import { BASE_URL } from './config';

export async function fetchProjects(): Promise<ProjectSummary[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/projects`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    return (await res.json()) as ProjectSummary[];
  } catch {
    return [];
  }
}

// Subscribe to the server's SSE stream and invoke `onEvent` for every parsed
// ServerEvent. Reconnects with a fixed backoff whenever the stream drops
// (server restart, transient network blip). Returns a disposer that stops
// reconnecting and aborts the in-flight request.
export function subscribeEvents(onEvent: (e: ServerEvent) => void): () => void {
  let stopped = false;
  let controller: AbortController | null = null;

  const connect = async (): Promise<void> => {
    if (stopped) return;
    controller = new AbortController();
    try {
      const res = await fetch(`${BASE_URL}/events`, {
        headers: { accept: 'text/event-stream' },
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

    if (!stopped) setTimeout(connect, 2000);
  };

  void connect();

  return () => {
    stopped = true;
    controller?.abort();
  };
}
