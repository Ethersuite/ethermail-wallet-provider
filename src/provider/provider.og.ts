import { decodeToken, supportedChains } from "./utils";
import { Communicator } from "./communicator";
import {hexToString, ProviderRpcError} from "viem";
import { getPublicClient } from "./client";
import type {SupportedChain, EIP1193Provider, Strategy, SupportedEvents} from "./types";
import { EventEmitter } from "events";
import {Listener} from "./types";

/**
 * The responsibility of the EtherMailProvider is to standardize events and information from the Communicator
 * into an EIP1193Provider friendly format
 */
export class EtherMailProvider implements EIP1193Provider {
  private _chainId: SupportedChain;
  private _communicator?: Communicator;
  private _strategy: Strategy;
  private _appUrl: string;
  private _websocketServer: string;
  private _eventEmitter: EventEmitter;
  private EVENTS: SupportedEvents[]  = ["connect", "disconnect", "chainChanged", "accountsChanged","message"]

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

    // TODO handle incoming events function / socket etc
    this._communicator?.on('chainChanged', (data : { chainId: any }) => {
      this.chainId = data.chainId;
      this._eventEmitter.emit("chainChanged", { chainId: this.chainId });
    });

    this._eventEmitter.emit("connect", { chainId: chainId.toString() });
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

    const error = new ProviderRpcError(
        new Error("Provider Disconnected"),
        {
          shortMessage: "All chains disconnected",
          code: 4900,
        }
    );
    this._eventEmitter.emit("disconnect", error);
  }

  async request(request: { method: string; params?: any }) {
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
      case "eth_chainId": {
        // console.log("CURRENT CHAIN ID IN PROVIDER", this.chainId);
        return `0x${this.chainId.toString(16)}`;
      }
      case "eth_blockNumber":
        return (await publicClient.getBlock({ blockTag: "latest" })).number;

      case "wallet_switchEthereumChain": {
        const chainId = parseInt(params[0].chainId) as SupportedChain;

        if (!supportedChains.includes(chainId))
          throw new Error("Invalid chain");

        this.chainId = chainId;

        await this._communicator?.emitAndWaitForResponse({
          method,
          data: {
            chainId,
          },
          chainId,
        });

        // TODO understand why we need this if we're sending it on reactivity it doesn't feel like we should

        return this._eventEmitter.emit("chainChanged", { chainId: chainId.toString() });
      }

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
          blockTag: params[0],
          blockNumber: params[1],
        });

      case "eth_getBlockByHash":
        return await publicClient.getBlock({
          blockHash: params[0]
        });

      case "eth_getTransactionByHash":
        const response = await publicClient.getTransaction({ hash: params[0] });
        // @ts-ignore
        response.type = response.typeHex; // we do this because ethers has a bug
        return response;

      case "eth_getTransactionReceipt":
        return await publicClient.getTransactionReceipt({ hash: params[0] });

      case "eth_estimateGas":
        return await publicClient.estimateGas(params[0]);

      case "eth_call":
        const callData = params[0];
        this.emitMessageEvent(method, callData);
        return await publicClient.call(callData);

      case "eth_getLogs":
        return await publicClient.getLogs(params[0]);

      case "eth_gasPrice":
        return await publicClient.getGasPrice();

      case "eth_sendTransaction":
        const txData = params[0];
        this.emitMessageEvent(method, txData);

        return await this._communicator?.emitAndWaitForResponse({
          method,
          data: txData,
          chainId: this.chainId,
        });

      case "eth_signTypedData_v4":
        const signV4Data = params[1] as any;
        this.emitMessageEvent(method, signV4Data);

        return await this._communicator?.emitAndWaitForResponse({
          method,
          data: signV4Data,
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
        const dataToSign = hexToString(params[0]);
        this.emitMessageEvent(method, dataToSign);

        return await this._communicator?.emitAndWaitForResponse({
          method,
          data: dataToSign,
          chainId: this.chainId,
        });

      default: {
        console.error(`"${method}" not implemented`);
        throw new Error(`"${method}" not implemented`);
      }
    }
  }

  /*//////////////////////////////////////////////////////////////
                         EVENT EMITTER METHODS
  //////////////////////////////////////////////////////////////*/

  public on(event: SupportedEvents, callback: Listener): void {
    if (!this.EVENTS.includes(event)) throw new Error("Event not supported: " + event);

    this._eventEmitter.on(event, callback);
  }

  public once(event: SupportedEvents, callback: Listener): void {
    if (!this.EVENTS.includes(event)) throw new Error("Event not supported: " + event);

    this._eventEmitter.once(event, callback);
  }

  public removeAllListeners(event?: SupportedEvents): void {
    if (event && !this.EVENTS.includes(event)) {
      throw new Error("Event not supported: " + event);
    }
    if (event) {
      this._eventEmitter.removeAllListeners(event);
    } else {
      this._eventEmitter.removeAllListeners();
    }
  }

  // TODO understand why we do this (maybe readme?)
  private emitMessageEvent(type: string, data: string) {
    this._eventEmitter.emit("message", { type, data})
  }
}
