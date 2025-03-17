import { http, createPublicClient, Chain } from 'viem';
import { mainnet, polygon, sepolia } from 'viem/chains';
import type { SupportedChain } from './types';

export const getPublicClient = (chainId: SupportedChain, rpcUrl?: string) => {
  let chain: Chain = mainnet;

  if (chainId === 137) {
    chain = polygon;
  }

  if (chainId === 11155111) {
    chain = sepolia;
  }

  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
};
