import { AppEvent, Communicator, ExternalEvent, ExternalListenerConfig } from './communicator';
import { v4 as uuidv4 } from 'uuid';
import { Strategy, SupportedChain, SupportedEvents } from '../provider/types';
// @ts-ignore
import { Listener } from 'events';

// TODO EventEmitter?
export abstract class BaseCommunicator implements Communicator {
  protected readonly strategy: Strategy;
  protected readonly appUrl: string;
  protected readonly deviceId;

  protected readonly listeners: Map<string, Listener[]> = new Map();

  protected constructor(strategy: Strategy, options: { appUrl: string }) {
    this.strategy = strategy;
    this.appUrl = options.appUrl;
    this.deviceId = uuidv4();
  }

  abstract initialize(): void;

  disconnect(): void {
    localStorage.removeItem('ethermail_token');

    this.listeners.clear();

    this.emit({ name: "disconnect" });
  }

  emit(event: AppEvent, data?: any): void {
    if (!this.listeners.get(event.name)) {
      this.listeners.set(event.name, []);
    }

    this.listeners.get(event.name)!.forEach((listener) => {
      listener(data);
    });
  }

  on(event: SupportedEvents, callback: Listener): void {
    if (!this.listeners.get(event)) {
      this.listeners.set(event, []);
    }

    this.listeners.get(event)!.push(callback);
  }

  abstract emitExternalEvent(event: ExternalEvent, { data, chainId }: {
    data?: any;
    chainId: SupportedChain
  }): Promise<any>;

  abstract onExternalEvent(config: ExternalListenerConfig, callback: Listener): void;
}