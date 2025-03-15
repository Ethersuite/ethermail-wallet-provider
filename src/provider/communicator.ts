import type { Socket as SocketIO } from "socket.io-client";
import io from "socket.io-client";
import { buildRequestData, decodeToken, dispatchErrorEvent } from "./utils";
import type { SupportedChain, Strategy } from "./types";
import { v4 as uuidv4 } from 'uuid';

type QueuedPromise = {
  promise: Promise<any>,
  resolve: Function,
  reject: Function
}

/**
 * The responsibility of this class is to enable bidirectional communication between EtherMail's different services
 */
export class Communicator {
  private static instance?: Communicator;
  private socket?: SocketIO;
  private strategy: Strategy;
  private appUrl: string;
  private websocketServer: string;
  private clientId?: string;

  protected readonly deviceId;
  protected readonly listeners: Map<string, Function[]> = new Map();

  protected readonly iframeSignPromises: Map<string, number> = new Map();

  private walletRequestArray: QueuedPromise[] = [];
  private walletResponseMap: Map<string, QueuedPromise> = new Map<string, QueuedPromise>();

  private constructor(
    strategy: Strategy,
    websocketServer: string,
    appUrl: string
  ) {
    this.strategy = strategy;
    this.websocketServer = websocketServer;
    this.appUrl = appUrl;
    this.deviceId = uuidv4();

    const token = localStorage.getItem("ethermail_token");

    if (!this.socket && strategy === "ws" && token) {
      this.createSocket(token);
    } else if (strategy === "iframe") {
      this.addIframeInboundListener();
    }
  }

  // TODO propagate all messages as long as there's a registered listener to ensure 2 way communication

  // TODO allow for emitting to the server without wait and with wait for response

  // TODO separate with a factory and an interface

  protected addIframeInboundListener() {
    const callbacks = {
      chainChanged: (data: { chainId: string }) => {
        this.emitReceived("chainChanged", data);
      },
    };

    window.addEventListener('message', ({ origin, data }: MessageEvent) => {
      if (origin === this.appUrl) {
        const { type, ...params } = data;

        try {
          // @ts-ignore
          callbacks[type](params);
        } catch (error) {
          // todo only if request id missing
        }
      }
    });
  }

  protected createSocket(token: string): void {
    this.socket = io(this.websocketServer, {
      transports: ["websocket"],
      query: {
        token,
        deviceId: this.deviceId // we send it to ensure reconnections can send to correct socket
      },
    });

    this.socket.on("connect", () => {
      this.clientId = this.socket?.id;
    });

    this.socket.on("connect_error", (error) => {
      console.log("CONNECT ERROR");
    });

    this.socket.on("token-error", () => {
      localStorage.removeItem("ethermail_token");

      dispatchErrorEvent("expired");
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

  // TODO turn communicator into an EventEmitter
  // For adding listeners to broadcasts
  public on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }

    this.listeners.get(event)!.push(callback);
  }

  // To trigger broadcasts
  public emitReceived(event: string, data: any) {
    if (!this.listeners.has(event)) {
      return;
    }

    this.listeners.get(event)!.forEach((listener) => {
      listener(data);
    });
  }

  public static getInstance(
    strategy: Strategy,
    websocketServer: string,
    appUrl: string
  ): Communicator | undefined {
    if (!Communicator.instance) {
      if (strategy === "ws" && localStorage.getItem("ethermail_token")) {
        Communicator.instance = new Communicator(
          strategy,
          websocketServer,
          appUrl
        );
      }

      if (strategy === "iframe") {
        Communicator.instance = new Communicator(
          strategy,
          websocketServer,
          appUrl
        );
      }
    }

    return Communicator.instance;
  }

  public disconnect() {
    this.socket?.disconnect();
    Communicator.instance = undefined;
  }

  private checkPermissions() {
    const decodedToken = decodeToken();
    if (decodedToken?.permissions !== "write") {
      dispatchErrorEvent("permissions");
      return Promise.reject({
        message: "Wrong permissions",
        code: 4100,
      });
    }
  }

  public async emitAndWaitForResponse({
                                        method,
                                        data,
                                        chainId,
                                      }: {
    method: string;
    data: any;
    chainId: SupportedChain;
  }) {
    if (this.strategy === "ws") {
      if (this.clientId) {
        await this.checkPermissions();

        this.socket?.emit("wallet-action", {
          ...buildRequestData(method, data, chainId),
          sessionId: this.deviceId,
          bridge: "ws",
        });
      } else {
        this.socket?.once("connect", async() => {
          this.clientId = this.socket?.id;
          await this.checkPermissions();

          this.socket?.emit("wallet-action", {
            ...buildRequestData(method, data, chainId),
            sessionId: this.deviceId,
            bridge: "ws",
          });
        });
      }

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

    if (this.strategy === "iframe") {
      return new Promise((resolve, reject) => {
        const requestData = buildRequestData(method, data, chainId);

        window.parent.postMessage(
          {
            ...requestData,
            sessionId: Date.now().toString(),
            bridge: "iframe",
          },
          "*"
        );

        const iframeSignHandler = ({origin, data}: MessageEvent) => {
          if (origin === this.appUrl) {
            // if a sign method accept a message with an association
            const signMethods = [
              'eth_signTypedData',
              'personal_sign',
              'eth_sign',
              'eth_signTypedData_v4',
              'eth_sendTransaction',
              'eth_signTransaction',
            ]

            if (signMethods.includes(method)) {
              if (data.type === "iframeSign" && data.messageUuid) {
                this.iframeSignPromises.set(data.messageUuid, requestData.id);
                window.removeEventListener("message", iframeSignHandler);
              }
            }
          }
        }

        const messageHandler = ({ origin, data }: MessageEvent) => {
          if (origin === this.appUrl) {
            if(data && data.type === "iframeSign") {
              return;
            }

            if(data.error) {
              reject(data.error);
              window.removeEventListener("message", messageHandler);
              return;
            } else if(!data.data) {
              reject({ message: 'Unexpected error' });
              window.removeEventListener("message", messageHandler);
              return;
            }

            // if it is a sign method because of attachments it will use the uid of the message
            const requestId = this.iframeSignPromises.get(data.request.id) || data.request.id;

            this.iframeSignPromises.delete(data.request.id);

            if(!data.request || requestId !== requestData.id) {
              return;
            }

            resolve(data.data);
            window.removeEventListener("message", messageHandler);
          }
        };

        window.addEventListener("message", messageHandler);
        window.addEventListener("message", iframeSignHandler);
      });
    }
  }
}
