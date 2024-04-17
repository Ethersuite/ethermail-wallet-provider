export interface JWTPayload {
  exp: number;
  sub: string;
  token: string;
  username: `0x${string}`;
  address: string;
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
