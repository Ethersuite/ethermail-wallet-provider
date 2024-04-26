import { http, createPublicClient, Chain } from "viem";
import { mainnet, polygon } from "viem/chains";
import type { SupportedChain } from "./types";

export const getPublicClient = (chainId: SupportedChain) => {
  let chain: Chain = mainnet;

  if (chainId === 137) {
    chain = polygon;
  }

  return createPublicClient({
    chain,
    transport: http(),
  });
};
