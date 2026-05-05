import type { ServerEvent } from '@buildpilot/shared-types';

type Handler = (event: ServerEvent) => void;
type ConnectHandler = () => void;

let source: EventSource | null = null;
const handlers = new Set<Handler>();
const connectHandlers = new Set<ConnectHandler>();

function ensure(): void {
  if (source) return;
  source = new EventSource('/events');
  source.onmessage = (e) => {
    try {
      const parsed = JSON.parse(e.data) as ServerEvent | { type: 'hello' };
      if ((parsed as { type: string }).type === 'hello') {
        for (const h of connectHandlers) h();
        return;
      }
      for (const h of handlers) h(parsed as ServerEvent);
    } catch {
      // ignore non-JSON (server heartbeats are sent as comments)
    }
  };
  source.onerror = () => {
    // EventSource auto-reconnects on its own; nothing to do here.
  };
}

export function subscribe(handler: Handler): () => void {
  handlers.add(handler);
  ensure();
  return () => {
    handlers.delete(handler);
  };
}

export function onConnected(handler: ConnectHandler): () => void {
  connectHandlers.add(handler);
  ensure();
  return () => {
    connectHandlers.delete(handler);
  };
}
