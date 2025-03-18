interface RequestArguments {
    method: string;
    params?: unknown[] | Record<string, unknown>;
}
interface EIP1193Provider {
    disconnect(): Promise<void>;
    request(args: RequestArguments): Promise<unknown>;
    on(eventName: SupportedEvents, callback: Function): void;
    once(eventName: SupportedEvents, callback: Function): void;
    removeAllListeners(eventName?: SupportedEvents): void;
}
type SupportedChain = 1 | 137 | 11155111;
type SupportedEvents = 'connect' | 'disconnect' | 'chainChanged' | 'accountsChanged' | 'message';
type Listener = (...args: any[]) => void;

/**
 * The responsibility of the EtherMailProvider is to standardize events and information from the Communicator
 * into an EIP1193Provider friendly format
 */
declare class EtherMailProvider implements EIP1193Provider {
    private _chainId;
    private _rpcUrl?;
    private _communicator?;
    private _eventEmitter;
    private EVENTS;
    constructor({ chainId, websocketServer, appUrl, rpcUrl, }?: {
        chainId?: SupportedChain;
        websocketServer?: string;
        appUrl?: string;
        rpcUrl?: string;
    });
    get chainId(): SupportedChain;
    set chainId(value: SupportedChain);
    disconnect(): Promise<void>;
    request(request: {
        method: string;
        params?: any;
    }): Promise<any>;
    on(event: SupportedEvents, callback: Listener): void;
    once(event: SupportedEvents, callback: Listener): void;
    removeAllListeners(event?: SupportedEvents): void;
    private emitMessageEvent;
}

export { EtherMailProvider };
