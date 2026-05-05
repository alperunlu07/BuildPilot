import type { ServerEvent } from '@buildpilot/shared-types';

type Handler = (event: ServerEvent) => void;

let source: EventSource | null = null;
const handlers = new Set<Handler>();

function ensure(): void {
  if (source) return;
  source = new EventSource('/events');
  source.onmessage = (e) => {
    try {
      const parsed = JSON.parse(e.data) as ServerEvent | { type: 'hello' };
      if ((parsed as { type: string }).type === 'hello') return;
      for (const h of handlers) h(parsed as ServerEvent);
    } catch {
      // ignore non-JSON messages (heartbeats are sent as comments and don't fire onmessage)
    }
  };
  source.onerror = () => {
    // EventSource auto-reconnects; nothing to do.
  };
}

export function subscribe(handler: Handler): () => void {
  handlers.add(handler);
  ensure();
  return () => {
    handlers.delete(handler);
  };
}
