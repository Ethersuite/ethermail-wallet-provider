export interface JWTPayload {
  exp: number;
  iat: number;
  iss: string;
  sub: string;
  permissions: 'none' | 'read' | 'write';
  type: 'sso' | 'wallet';
  origin: string;
  address: string;
  wallet: `0x${string}`;
  ethermail_verified: boolean;
}

export interface RequestArguments {
  method: string;
  params?: unknown[] | Record<string, unknown>;
}

export interface EIP1193Provider {
  disconnect(): Promise<void>;
  request(args: RequestArguments): Promise<unknown>;
  on(eventName: SupportedEvents, callback: Function): void;
  once(eventName: SupportedEvents, callback: Function): void;
  once(eventName: SupportedEvents, callback: Function): void;
  removeAllListeners(eventName?: SupportedEvents): void;
}

export type Strategy = "iframe" | "ws";

export type SupportedChain = 1 | 137;

export type TokenErrorType = "permissions" | "expired";

export type SupportedEvents = 'connect' | 'disconnect' | 'chainChanged' | 'accountsChanged' | 'message';

export type Listener = (...args: any[]) => void;
