import { decodeToken, supportedChains } from "./utils";
import { Communicator } from "./communicator";
import { hexToString } from "viem";
import { getPublicClient } from "./client";
import type { SupportedChain, EIP1193Provider, Strategy } from "./types";
import { EventEmitter } from "events";

export class EtherMailProvider implements EIP1193Provider {
  private _chainId: SupportedChain;
  private _communicator?: Communicator;
  private _strategy: Strategy;
  private _appUrl: string;
  private _websocketServer: string;
  private _eventEmitter: EventEmitter;

  constructor({
    chainId = 1,
    websocketServer = "wss://api.ethermail.io/events",
    appUrl = "https://ethermail.io",
  }: {
    chainId?: SupportedChain;
    websocketServer?: string;
    appUrl?: string;
  } = {}) {
    this._appUrl = appUrl;
    this._websocketServer = websocketServer;
    this._chainId = chainId;
    this._eventEmitter = new EventEmitter();

    if (window?.parent !== window) {
      this._strategy = "iframe";
    } else {
      this._strategy = "ws";
    }

    this._communicator = Communicator.getInstance(
      this._strategy,
      this._websocketServer,
      this._appUrl
    );

    this._eventEmitter.emit("connect", chainId);
  }

  public get chainId() {
    return this._chainId;
  }

  public set chainId(value) {
    this._chainId = value;
  }

  async disconnect(): Promise<void> {
    localStorage.removeItem("ethermail_token");
    this._communicator?.disconnect();
    this._eventEmitter.emit("disconnect", "Provider Disconnected");
  }

  async request(request: { method: string; params?: any }) {
    console.log(request);

    this._communicator = Communicator.getInstance(
      this._strategy,
      this._websocketServer,
      this._appUrl
    );

    const { method, params = [] } = request;

    const publicClient = getPublicClient(this.chainId);

    switch (method) {
      case "eth_accounts": {
        let account;

        if (this._strategy === "ws") {
          const decodedToken = decodeToken();

          if (!decodedToken) {
            this.disconnect();
            return;
          }

          account = decodedToken.wallet;
        } else {
          account = await this._communicator?.emitAndWaitForResponse({
            method,
            data: null,
            chainId: this.chainId,
          });
        }

        return [account];
      }

      case "net_version":
      case "eth_chainId":
        return `0x${this.chainId.toString(16)}`;

      case "eth_blockNumber":
        return (await publicClient.getBlock({ blockTag: "latest" })).number;

      case "wallet_switchEthereumChain":
        const chainId = parseInt(params[0].chainId) as SupportedChain;

        if (!supportedChains.includes(chainId))
          throw new Error("Invalid chain");

        this.chainId = chainId;
        this._eventEmitter.emit("chainChanged", chainId);
        return this.chainId;

      case "eth_getBalance":
        return await publicClient.getBalance({
          address: params[0],
          blockTag: params[1],
        });

      case "eth_getCode":
        return await publicClient.getBytecode({
          address: params[0],
          blockTag: params[1],
        });

      case "eth_getTransactionCount":
        return await publicClient.getTransactionCount({
          address: params[0],
          blockTag: params[1],
        });

      case "eth_getStorageAt":
        return await publicClient.getStorageAt({
          address: params[0],
          slot: params[1],
          blockTag: params[2],
        });

      case "eth_getBlockByNumber":
        return await publicClient.getBlock({
          blockNumber: params[0],
          blockTag: params[1],
        });

      case "eth_getBlockByHash":
        return await publicClient.getBlock({
          blockHash: params[0],
          blockTag: params[1],
        });

      case "eth_getTransactionByHash":
        return await publicClient.getTransaction({ hash: params[0] });

      case "eth_getTransactionReceipt":
        return await publicClient.getTransactionReceipt({ hash: params[0] });

      case "eth_estimateGas":
        return await publicClient.estimateGas(params[0]);

      case "eth_call":
        return await publicClient.call(params[0]);

      case "eth_getLogs":
        return await publicClient.getLogs(params[0]);

      case "eth_gasPrice":
        return await publicClient.getGasPrice();

      case "eth_sendTransaction":
        return await this._communicator?.emitAndWaitForResponse({
          method,
          data: params[0],
          chainId: this.chainId,
        });

      case "eth_signTypedData_v4":
        return await this._communicator?.emitAndWaitForResponse({
          method,
          data: params[1],
          chainId: this.chainId,
        });

      case "eth_sign": {
        return await this._communicator?.emitAndWaitForResponse({
          method,
          data: hexToString(params[1]),
          chainId: this.chainId,
        });
      }

      case "personal_sign":
      case "eth_signTypedData":
      case "eth_signTransaction":
        return await this._communicator?.emitAndWaitForResponse({
          method,
          data: hexToString(params[0]),
          chainId: this.chainId,
        });

      default: {
        console.error(`"${method}" not implemented`);
        throw new Error(`"${method}" not implemented`);
      }
    }
  }
}
