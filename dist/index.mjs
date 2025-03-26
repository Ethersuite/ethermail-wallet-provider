var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/provider/utils.ts
import { jwtDecode } from "jwt-decode";
var supportedChains = [1, 137, 11155111];
function getProposerInfo() {
  var _a, _b;
  const url = new URL(window.location.href);
  const header = document.getElementsByTagName("head")[0];
  const iconLink = document.querySelector('link[rel="icon"]');
  const icon = iconLink == null ? void 0 : iconLink.getAttribute("href");
  const proposerURL = url.origin;
  const proposerName = (_b = (_a = header.getElementsByTagName("title")[0]) == null ? void 0 : _a.innerText) != null ? _b : proposerURL;
  const proposerIcon = (icon == null ? void 0 : icon.includes("://")) ? `${icon}` : `${proposerURL}${icon}`;
  return { proposerName, proposerURL, proposerIcon };
}
function decodeToken() {
  const token = localStorage.getItem("ethermail_token");
  if (!token) return null;
  const decoded = jwtDecode(token);
  return decoded;
}
function buildRequestData(method, data, chainId) {
  const { proposerName, proposerURL, proposerIcon } = getProposerInfo();
  return {
    id: Date.now(),
    data,
    type: method,
    proposerName,
    proposerURL,
    proposerIcon,
    chainId,
    version: 1
  };
}
function dispatchErrorEvent(type) {
  const customEvent = new CustomEvent(
    "EtherMailTokenError",
    {
      detail: { type }
    }
  );
  window.dispatchEvent(customEvent);
}

// src/provider/provider.ts
import { hexToString, ProviderRpcError } from "viem";

// src/provider/client.ts
import { http, createPublicClient } from "viem";
import { mainnet, polygon, sepolia } from "viem/chains";
var getPublicClient = (chainId, rpcUrl) => {
  let chain = mainnet;
  if (chainId === 137) {
    chain = polygon;
  }
  if (chainId === 11155111) {
    chain = sepolia;
  }
  return createPublicClient({
    chain,
    transport: http(rpcUrl)
  });
};

// src/provider/provider.ts
import { EventEmitter } from "events";

// src/communicators/base-communicator.ts
import { v4 as uuidv4 } from "uuid";
var BaseCommunicator = class {
  constructor(strategy, options) {
    this.listeners = /* @__PURE__ */ new Map();
    this.strategy = strategy;
    this.appUrl = options.appUrl;
    this.deviceId = uuidv4();
  }
  disconnect() {
    localStorage.removeItem("ethermail_token");
    this.listeners.clear();
    this.emit({ name: "disconnect" });
  }
  emit(event, data) {
    if (!this.listeners.get(event.name)) {
      this.listeners.set(event.name, []);
    }
    this.listeners.get(event.name).forEach((listener) => {
      listener(data);
    });
  }
  on(event, callback) {
    if (!this.listeners.get(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }
};

// src/communicators/iframe-communicator.ts
var iframeCommunicator = class extends BaseCommunicator {
  constructor(options) {
    super("iframe", options);
    this.eventListeners = /* @__PURE__ */ new Map();
  }
  initialize() {
    this.onExternalEvent({
      name: "chainChanged",
      once: false
    }, (data, error) => {
      if (error) {
        console.error(error);
        return;
      }
      this.emit({
        name: "chainChanged"
      }, { chainId: data.chainId });
    });
  }
  disconnect() {
    this.eventListeners.forEach((listeners, eventName) => {
      listeners.forEach((listener) => {
        window.removeEventListener(eventName, listener);
      });
    });
    this.eventListeners.clear();
    super.disconnect();
  }
  emitExternalEvent(_0, _1) {
    return __async(this, arguments, function* (event, { data, chainId }) {
      return new Promise((resolve, reject) => __async(this, null, function* () {
        const requestData = buildRequestData(event.name, data, chainId);
        window.parent.postMessage(
          __spreadProps(__spreadValues({}, requestData), {
            sessionId: Date.now().toString(),
            bridge: "iframe"
          }),
          "*"
        );
        if (event.waitForResponse) {
          if (event.requiresSignature) {
            const uuid = yield this.addIframeSignListener();
            this.onExternalEvent({
              name: event.name,
              requestId: uuid,
              once: true
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
              once: true
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
      }));
    });
  }
  addIframeSignListener() {
    return new Promise((resolve) => {
      const iframeSignHandler = ({ origin, data }) => {
        if (origin === this.appUrl) {
          if (data.type === "iframeSign" && data.messageUuid) {
            resolve(data.messageUuid);
            window.removeEventListener("message", iframeSignHandler);
          }
        }
      };
      window.addEventListener("message", iframeSignHandler);
      this.addListener("message", iframeSignHandler);
    });
  }
  onExternalEvent(config, callback) {
    const messageHandler = (event) => {
      var _a, _b, _c;
      const { data, origin } = event;
      if (origin === this.appUrl || ((_a = window == null ? void 0 : window.ethereum) == null ? void 0 : _a.isEtherMail)) {
        if (data && data.type === "iframeSign") {
          return;
        } else if (config.requestId && ((_b = data.request) == null ? void 0 : _b.id) !== config.requestId) {
          return;
        } else if (!config.requestId && ((_c = data.request) == null ? void 0 : _c.id)) {
          return;
        } else if (data.type && data.type !== config.name) {
          return;
        }
        if (data.error) {
          callback(void 0, data.error);
        } else if (!data.data) {
          callback(void 0, { message: "Unexpected error" });
        } else {
          callback(data.data);
        }
        if (config.once) {
          window.removeEventListener("message", messageHandler);
          this.removeListener("message", messageHandler);
        }
      }
    };
    window.addEventListener("message", messageHandler);
    this.addListener("message", messageHandler);
  }
  addListener(event, listener) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(listener);
  }
  removeListener(event, listener) {
    if (this.eventListeners.has(event)) {
      const listeners = this.eventListeners.get(event);
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
      if (listeners.length === 0) {
        this.eventListeners.delete(event);
      }
    }
  }
};

// src/communicators/socket-communicator.ts
import io from "socket.io-client";
var SocketCommunicator = class extends BaseCommunicator {
  constructor(options) {
    super("ws", options);
    this.walletRequestArray = [];
    this.walletResponseMap = /* @__PURE__ */ new Map();
    this.websocketServer = options.websocketServer;
    const token = localStorage.getItem("ethermail_token");
    if (!token) {
      throw "Invalid token";
    }
    this.createSocket(token);
  }
  initialize() {
    this.onExternalEvent({
      name: "chainChanged",
      once: false
    }, (data, error) => {
      if (error) {
        console.error(error);
        return;
      }
      this.emit({
        name: "chainChanged"
      }, { chainId: data.chainId });
    });
  }
  createSocket(token) {
    this.socket = io(this.websocketServer, {
      transports: ["websocket"],
      query: {
        token,
        deviceId: this.deviceId
        // we send it to ensure reconnections can send to correct socket
      }
    });
    this.socket.on("connect", () => {
      var _a;
      this.clientId = (_a = this.socket) == null ? void 0 : _a.id;
    });
    this.socket.on("connect_error", (error) => {
      console.log("socket connect error");
    });
    this.socket.on("token-error", () => {
      localStorage.removeItem("ethermail_token");
      dispatchErrorEvent("expired");
    });
    this.socket.on("wallet-action", (data) => {
      const walletRequest = this.walletRequestArray.pop();
      this.walletResponseMap.set(data.messageId, walletRequest);
    });
    this.socket.on("wallet-action-response", (data) => {
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
    var _a;
    (_a = this.socket) == null ? void 0 : _a.once("connect", () => __async(this, null, function* () {
      var _a2;
      this.clientId = (_a2 = this.socket) == null ? void 0 : _a2.id;
      yield this.checkPermissions();
    }));
  }
  disconnect() {
    var _a, _b;
    (_a = this.socket) == null ? void 0 : _a.disconnect();
    (_b = this.socket) == null ? void 0 : _b.removeAllListeners();
    this.socket = void 0;
    super.disconnect();
  }
  checkPermissions() {
    const decodedToken = decodeToken();
    if ((decodedToken == null ? void 0 : decodedToken.permissions) !== "write") {
      dispatchErrorEvent("permissions");
      return Promise.reject({
        message: "Wrong permissions",
        code: 4100
      });
    }
  }
  sendMessage(eventName, requestData, waitForResponse = false) {
    return __async(this, null, function* () {
      return new Promise((resolve, reject) => {
        var _a, _b;
        (_a = this.socket) == null ? void 0 : _a.emit(eventName, __spreadProps(__spreadValues({}, requestData), {
          sessionId: this.deviceId,
          bridge: "ws"
        }));
        if (waitForResponse) {
          const listener = (event, message) => {
            var _a2;
            if (message.id === requestData.id) {
              resolve(message);
              (_a2 = this.socket) == null ? void 0 : _a2.offAny(listener);
            }
          };
          (_b = this.socket) == null ? void 0 : _b.onAny(listener);
        }
      });
    });
  }
  sendWalletAction(requestData) {
    return __async(this, null, function* () {
      var _a;
      yield this.checkPermissions();
      (_a = this.socket) == null ? void 0 : _a.emit("wallet-action", __spreadProps(__spreadValues({}, requestData), {
        sessionId: this.deviceId,
        bridge: "ws"
      }));
      let res, rej;
      const response = new Promise((resolve, reject) => {
        res = resolve;
        rej = reject;
      });
      this.walletRequestArray.push({
        promise: response,
        resolve: res,
        reject: rej
      });
      return response;
    });
  }
  emitExternalEvent(_0, _1) {
    return __async(this, arguments, function* (event, { data, chainId }) {
      var _a;
      if (event.name === "eth_accounts") {
        const decodedToken = decodeToken();
        if (!decodedToken) {
          this.disconnect();
          return;
        }
        return decodedToken.wallet;
      }
      const requestData = buildRequestData(event.name, data, chainId);
      if (this.clientId) {
        if (event.waitForResponse && event.requiresSignature) {
          return yield this.sendWalletAction(requestData);
        } else if (event.waitForResponse) {
          return yield this.sendMessage(event.name, requestData, event.waitForResponse);
        }
      } else {
        (_a = this.socket) == null ? void 0 : _a.once("connect", () => __async(this, null, function* () {
          var _a2;
          this.clientId = (_a2 = this.socket) == null ? void 0 : _a2.id;
          if (event.waitForResponse && event.requiresSignature) {
            return yield this.sendWalletAction(requestData);
          } else if (event.waitForResponse) {
            return yield this.sendMessage(event.name, requestData, event.waitForResponse);
          }
        }));
      }
    });
  }
  onExternalEvent(config, callback) {
    const messageHandler = (data) => {
      var _a, _b;
      if (config.requestId && ((_a = data.request) == null ? void 0 : _a.id) !== config.requestId) {
        return;
      } else if (!config.requestId && ((_b = data.request) == null ? void 0 : _b.id)) {
        return;
      } else if (data.type && data.type !== config.name) {
        return;
      }
      if (data.error) {
        callback(void 0, data.error);
      } else if (!data.data) {
        callback(void 0, { message: "Unexpected error" });
      } else {
        callback(data.data);
      }
    };
    if (config.once) {
      this.socket.once(config.name, messageHandler);
    } else {
      this.socket.on(config.name, messageHandler);
    }
  }
};

// src/communicators/communicator-factory.ts
var CommunicatorFactory = class {
  static create(options) {
    if ((window == null ? void 0 : window.parent) !== window) {
      return new iframeCommunicator(options);
    } else {
      return new SocketCommunicator(options);
    }
  }
};

// src/provider/provider.ts
var EtherMailProvider = class {
  constructor({
    chainId = 1,
    websocketServer = "wss://api.ethermail.io/events",
    appUrl = "https://ethermail.io",
    rpcUrl = void 0
  } = {}) {
    this.EVENTS = ["connect", "disconnect", "chainChanged", "accountsChanged", "message"];
    var _a;
    this._chainId = chainId;
    this._eventEmitter = new EventEmitter();
    this._rpcUrl = rpcUrl;
    this._communicator = CommunicatorFactory.create({
      appUrl,
      websocketServer
    });
    this._communicator.initialize();
    (_a = this._communicator) == null ? void 0 : _a.on("chainChanged", (data) => {
      this.chainId = data.chainId;
      this._eventEmitter.emit("chainChanged", { chainId: this.chainId });
    });
    this._eventEmitter.emit("connect", { chainId: chainId.toString() });
  }
  get chainId() {
    return this._chainId;
  }
  set chainId(value) {
    this._chainId = value;
  }
  disconnect() {
    return __async(this, null, function* () {
      var _a;
      localStorage.removeItem("ethermail_token");
      (_a = this._communicator) == null ? void 0 : _a.disconnect();
      const error = new ProviderRpcError(
        new Error("Provider Disconnected"),
        {
          shortMessage: "All chains disconnected",
          code: 4900
        }
      );
      this._eventEmitter.emit("disconnect", error);
    });
  }
  request(request) {
    return __async(this, null, function* () {
      var _a, _b, _c, _d, _e, _f;
      const { method, params = [] } = request;
      const publicClient = getPublicClient(this.chainId, this._rpcUrl);
      switch (method) {
        case "eth_accounts": {
          let account = yield (_a = this._communicator) == null ? void 0 : _a.emitExternalEvent({
            name: method,
            waitForResponse: true
          }, {
            data: null,
            chainId: this.chainId
          });
          return [account];
        }
        case "net_version":
        case "eth_chainId": {
          return `0x${this.chainId.toString(16)}`;
        }
        case "eth_blockNumber":
          return (yield publicClient.getBlock({ blockTag: "latest" })).number;
        case "wallet_switchEthereumChain": {
          const newChainId = parseInt(params[0].chainId);
          if (!supportedChains.includes(newChainId)) {
            throw new Error("Invalid chain");
          }
          yield (_b = this._communicator) == null ? void 0 : _b.emitExternalEvent(
            {
              name: method,
              waitForResponse: true
            },
            {
              data: [],
              chainId: newChainId
            }
          );
          this.chainId = newChainId;
          return null;
        }
        case "eth_getBalance":
          return yield publicClient.getBalance({
            address: params[0],
            blockTag: params[1]
          });
        case "eth_getCode":
          return yield publicClient.getBytecode({
            address: params[0],
            blockTag: params[1]
          });
        case "eth_getTransactionCount":
          return yield publicClient.getTransactionCount({
            address: params[0],
            blockTag: params[1]
          });
        case "eth_getStorageAt":
          return yield publicClient.getStorageAt({
            address: params[0],
            slot: params[1],
            blockTag: params[2]
          });
        case "eth_getBlockByNumber":
          return yield publicClient.getBlock({
            blockTag: params[0],
            blockNumber: params[1]
          });
        case "eth_getBlockByHash":
          return yield publicClient.getBlock({
            blockHash: params[0]
          });
        case "eth_getTransactionByHash":
          const response = yield publicClient.getTransaction({ hash: params[0] });
          response.type = response.typeHex;
          return response;
        case "eth_getTransactionReceipt":
          return yield publicClient.getTransactionReceipt({ hash: params[0] });
        case "eth_estimateGas":
          return yield publicClient.estimateGas(params[0]);
        case "eth_call":
          const callData = params[0];
          this.emitMessageEvent(method, callData);
          return yield publicClient.call(callData);
        case "eth_getLogs":
          return yield publicClient.getLogs(params[0]);
        case "eth_gasPrice":
          return yield publicClient.getGasPrice();
        case "eth_sendTransaction":
          const txData = params[0];
          this.emitMessageEvent(method, txData);
          return (_c = this._communicator) == null ? void 0 : _c.emitExternalEvent({
            name: method,
            waitForResponse: true,
            requiresSignature: true
          }, {
            data: txData,
            chainId: this.chainId
          });
        case "eth_signTypedData_v4":
          const signV4Data = params[1];
          this.emitMessageEvent(method, signV4Data);
          return (_d = this._communicator) == null ? void 0 : _d.emitExternalEvent({
            name: method,
            waitForResponse: true,
            requiresSignature: true
          }, {
            data: signV4Data,
            chainId: this.chainId
          });
        case "eth_sign": {
          return (_e = this._communicator) == null ? void 0 : _e.emitExternalEvent({
            name: method,
            waitForResponse: true,
            requiresSignature: true
          }, {
            data: hexToString(params[1]),
            chainId: this.chainId
          });
        }
        case "personal_sign":
        case "eth_signTypedData":
        case "eth_signTransaction":
          const dataToSign = hexToString(params[0]);
          this.emitMessageEvent(method, dataToSign);
          return (_f = this._communicator) == null ? void 0 : _f.emitExternalEvent(
            {
              name: method,
              waitForResponse: true,
              requiresSignature: true
            },
            {
              data: dataToSign,
              chainId: this.chainId
            }
          );
        default: {
          console.error(`"${method}" not implemented`);
          throw new Error(`"${method}" not implemented`);
        }
      }
    });
  }
  /*//////////////////////////////////////////////////////////////
                         EVENT EMITTER METHODS
  //////////////////////////////////////////////////////////////*/
  on(event, callback) {
    if (!this.EVENTS.includes(event)) throw new Error("Event not supported: " + event);
    this._eventEmitter.on(event, callback);
  }
  once(event, callback) {
    if (!this.EVENTS.includes(event)) throw new Error("Event not supported: " + event);
    this._eventEmitter.once(event, callback);
  }
  removeAllListeners(event) {
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
  emitMessageEvent(type, data) {
    this._eventEmitter.emit("message", { type, data });
  }
};
export {
  EtherMailProvider
};
