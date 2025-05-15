import { SupportedChain } from '../provider/types';
import { BaseCommunicator } from './base-communicator';
import { buildRequestData, decodeToken, dispatchErrorEvent } from '../provider/utils';
import { AppEvent, ExternalEvent, ExternalListenerConfig } from './communicator';
// @ts-ignore/
import { Listener } from 'events';
import io, { Socket as SocketIO } from 'socket.io-client';

type QueuedPromise = {
  promise: Promise<any>,
  resolve: Function,
  reject: Function
}

export class SocketCommunicator extends BaseCommunicator {
  private clientId?: string;
  private socket?: SocketIO;
  private websocketServer: string;

  private walletRequestArray: QueuedPromise[] = [];
  private walletResponseMap: Map<string, QueuedPromise> = new Map<string, QueuedPromise>();

  constructor(options: { appUrl: string, websocketServer: string }) {
    super('ws', options);

    this.websocketServer = options.websocketServer;

    const token = localStorage.getItem('ethermail_token');

    if (!token) {
      throw 'Invalid token';
    }

    this.createSocket(token);
  }

  initialize(): void {
    this.onExternalEvent({
      name: 'chainChanged',
      once: false,
    }, (data: { chainId: string | number }, error: any) => {
      if (error) {
        console.error(error);
        return;
      }

      this.emit({
        name: 'chainChanged',
      }, { chainId: data.chainId });
    });
  }

  protected createSocket(token: string): void {
    this.socket = io(this.websocketServer, {
      transports: ['websocket'],
      query: {
        token,
        deviceId: this.deviceId, // we send it to ensure reconnections can send to correct socket
      },
    });

    this.socket.on('connect', () => {
      this.clientId = this.socket?.id;
    });

    this.socket.on('connect_error', (error) => {
      console.log('socket connect error');
    });

    this.socket.on('token-error', () => {
      localStorage.removeItem('ethermail_token');

      dispatchErrorEvent('expired');
    });

    this.socket.on('wallet-action', (data) => {
      const walletRequest = this.walletRequestArray.pop() as QueuedPromise;

      this.walletResponseMap.set(data.messageId, walletRequest);
    });

    this.socket.on('wallet-action-response', (data) => {
      const queuedPromise = this.walletResponseMap.get(data.messageId);

      if (!queuedPromise) {
        return;
      }

      this.walletResponseMap.delete(data.messageId);


      if (data.data) {
        queuedPromise.resolve(data.data);
      }

      if (data.error) {
        queuedPromise.reject(data.error);
      }
    });
  }

  connectSocketToEtherMail() {
    this.socket?.once('connect', async () => {
      this.clientId = this.socket?.id;
      await this.checkPermissions();
    });
  }

  public disconnect() {
    this.socket?.disconnect();
    this.socket?.removeAllListeners();
    this.socket = undefined;
    super.disconnect();
  }

  private checkPermissions() {
    const decodedToken = decodeToken();
    if (decodedToken?.permissions !== 'write') {
      dispatchErrorEvent('permissions');
      return Promise.reject({
        message: 'Wrong permissions',
        code: 4100,
      });
    }
  }

  protected async sendMessage(eventName: string, requestData: any, waitForResponse: boolean = false) {
    return new Promise((resolve, reject) => {
      this.socket?.emit(eventName, {
        ...requestData,
        sessionId: this.deviceId,
        bridge: 'ws',
      });

      if (waitForResponse) {
        const listener = (event: string, message: any) => {
          if (message.id === requestData.id) {
            resolve(message);
            this.socket?.offAny(listener);
          }

          // TODO timeout reject?
        };

        this.socket?.onAny(listener);
      }
    });


  }

  protected async sendWalletAction(requestData: any) {
    await this.checkPermissions();

    this.socket?.emit('wallet-action', {
      ...requestData,
      sessionId: this.deviceId,
      bridge: 'ws',
    });

    let res: Function, rej: Function;

    const response = new Promise((resolve, reject) => {
      res = resolve;
      rej = reject;
    });

    this.walletRequestArray.push({
      promise: response,
      resolve: res!,
      reject: rej!,
    });

    return response;
  }

  async emitExternalEvent(event: ExternalEvent, { data, chainId }: {
    data?: any;
    chainId: SupportedChain
  }): Promise<any> {
    if(event.name === 'eth_accounts') {
      const decodedToken = decodeToken();

      if (!decodedToken) {
        this.disconnect();
        return;
      }

      return decodedToken.wallet;
    }


    const requestData = buildRequestData(event.name, data, chainId);

    if (this.clientId) {
      // TODO function
      if (event.waitForResponse && event.requiresSignature) {
        return await this.sendWalletAction(requestData);
      } else if (event.waitForResponse) {
        // TODO how to deal with waitForResponse with sendMessage
        return await this.sendMessage(event.name, requestData, event.waitForResponse);
      }
    } else {
      // TODO what is this scenario? reconnect?
      this.socket?.once('connect', async () => {
        this.clientId = this.socket?.id;

        // TODO function
        if (event.waitForResponse && event.requiresSignature) {
          return await this.sendWalletAction(requestData);
        } else if (event.waitForResponse) {
          // TODO how to deal with waitForResponse with sendMessage
          return await this.sendMessage(event.name, requestData, event.waitForResponse);
        }
      });
    }
  }

  onExternalEvent(config: ExternalListenerConfig, callback: Listener): void {
    const messageHandler = (data: any) => {
      // TODO add reject timeout?

      if (config.requestId && data.request?.id !== config.requestId) {
        return;
      } else if (!config.requestId && data.request?.id) {
        return;
      } else if (data.type && data.type !== config.name) {
        return;
      }

      if (data.error) {
        callback(undefined, data.error);
      } else if (!data.data) {
        callback(undefined, { message: 'Unexpected error' });
      } else {
        callback(data.data);
      }
    };

    if (config.once) {
      this.socket!.once(config.name, messageHandler);
    } else {
      this.socket!.on(config.name, messageHandler);
    }
  }
}
