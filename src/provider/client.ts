import { http, createPublicClient, Chain } from 'viem';
import { mainnet, polygon, celo, bsc, fantom, avalanche, arbitrum, base, sepolia } from 'viem/chains';
import type { SupportedChain } from './types';

export type HttpTransportConfig = {
    retryCount?: number;
    retryDelay?: number;
    timeout?: number;
}

const supportedChains: Chain[] = [
    mainnet,
    polygon,
    celo as Chain,
    bsc,
    fantom,
    avalanche,
    arbitrum,
    base,
    sepolia,
];

export const getPublicClient = (chainId: SupportedChain, rpcUrl: string, rpcUrlConfig: HttpTransportConfig = {}) => {
  let chain: Chain = mainnet;
  for (const supportedChain of supportedChains) {
    if (chainId === supportedChain.id) {
      chain = supportedChain;
    }
  }

  return createPublicClient({
    chain,
    transport: http(rpcUrl, rpcUrlConfig),
  });
};
