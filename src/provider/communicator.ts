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

export class Communicator {
  private static instance?: Communicator;
  private socket?: SocketIO;
  private strategy: Strategy;
  private appUrl: string;
  private websocketServer: string;
  private clientId?: string;
  protected readonly deviceId;

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
        window.parent.postMessage(
          {
            ...buildRequestData(method, data, chainId),
            sessionId: Date.now().toString(),
            bridge: "iframe",
          },
          "*"
        );

        const messageHandler = ({ origin, data }: MessageEvent) => {
          if (origin === this.appUrl) {
            window.removeEventListener("message", messageHandler);
            if (data.data) {
              resolve(data.data);
            }

            if (data.error) {
              reject(data.error);
            }
          }
        };

        window.addEventListener("message", messageHandler);
      });
    }
  }
}
