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
}

export type Strategy = "iframe" | "ws";

export type SupportedChain = 1 | 137;

export type TokenErrorType = "permissions" | "expired";
