import { SupportedChain } from '../provider/types';
import { BaseCommunicator } from './base-communicator';
import { buildRequestData } from '../provider/utils';
import { AppEvent, ExternalEvent, ExternalListenerConfig } from './communicator';
import { Listener } from 'events';

export class iframeCommunicator extends BaseCommunicator {
  constructor(options: { appUrl: string }) {
    super('iframe', options);
  }

  initialize(): void {
    this.onExternalEvent({
      name: 'chainChanged',
      once: false,
    }, (data: { chainId: string | number }, error) => {
      if (error) {
        console.error(error);
        return;
      }

      this.emit({
        name: 'chainChanged',
      }, { chainId: data.chainId });
    });
  }

  public disconnect() {
    localStorage.removeItem("ethermail_token");

    // TODO iframe remove all listeners
    // this._eventEmitter.emit("disconnect", error);
  }

  emit(event: AppEvent, data?: any) {
    super.emit(event, data);
  }

  async emitExternalEvent(event: ExternalEvent, { data, chainId }: {
    data?: any;
    chainId: SupportedChain
  }): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const requestData = buildRequestData(event.name, data, chainId);

      window.parent.postMessage(
        {
          ...requestData,
          sessionId: Date.now().toString(),
          bridge: 'iframe',
        },
        '*',
      );

      // TODO refactor this before sending the message could lead to unexpected behavior
      if (event.waitForResponse) {
        if (event.requiresSignature) {
          const uuid: string = await this.addIframeSignListener();

          this.onExternalEvent({
            name: event.name,
            requestId: uuid,
            once: true,
          }, (response, error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve(response);
          });
        } else {
          this.onExternalEvent({
            name: event.name,
            requestId: requestData.id,
            once: true,
          }, (response, error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve(response);
          });
        }
        return;
      }

      resolve(requestData);
    });
  }

  addIframeSignListener(): Promise<string> {
    return new Promise((resolve) => {
      // Currently this is done to associate an uuid to an iframe request id
      const iframeSignHandler = ({ origin, data }: MessageEvent) => {
        // TODO add reject timeout?

        if (origin === this.appUrl) {
          if (data.type === 'iframeSign' && data.messageUuid) {
            resolve(data.messageUuid);
            window.removeEventListener('message', iframeSignHandler);
          }
        }
      };

      window.addEventListener('message', iframeSignHandler);
    });
  }

  onExternalEvent(config: ExternalListenerConfig, callback: Listener): void {
    const messageHandler = (event: MessageEvent) => {
      const { data, origin } = event;

      if (origin === this.appUrl) {
        // TODO add reject timeout?

        if (data && data.type === 'iframeSign') {
          return;
        } else if (config.requestId && data.request?.id !== config.requestId) {
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

        if (config.once) {
          window.removeEventListener('message', messageHandler);
        }
      }
    };

    window.addEventListener('message', messageHandler);
  }
}
