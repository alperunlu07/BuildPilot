import { EventEmitter } from 'node:events';
import type { ServerEvent } from '@buildpilot/shared-types';

class TypedBus {
  private readonly emitter = new EventEmitter();

  subscribe(handler: (e: ServerEvent) => void): () => void {
    this.emitter.on('event', handler);
    return () => {
      this.emitter.off('event', handler);
    };
  }

  publish(event: ServerEvent): void {
    this.emitter.emit('event', event);
  }
}

export const eventBus = new TypedBus();
