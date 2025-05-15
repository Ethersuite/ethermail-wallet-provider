// @ts-ignore
import { Listener } from 'events';
import { SupportedEvents } from '../provider/types';

export type AppEvent = {
  name: SupportedEvents;
}

export type ExternalListenerConfig = {
  name: string;
  once?: boolean;
  requestId?: string | number;
}

export type ExternalEvent = {
  name: string;
  waitForResponse?: boolean;
  requiresSignature?: boolean;
};

export interface Communicator {
  // is emitted internally on itself (EventEmitter)
  on(event: SupportedEvents, callback: Listener): void;

  emit(event: AppEvent, data?: any): void;

  // comes from the server you're communicated to
  onExternalEvent(config: ExternalListenerConfig, callback: Listener): void;

  emitExternalEvent(event: ExternalEvent, data?: any): Promise<any>;

  disconnect(): void;

  initialize(): void;
}