import { mainnet, polygon, celo, bsc, fantom, avalanche, arbitrum, base, sepolia } from 'viem/chains';
import { getPublicClient } from '../provider/client';
import { SupportedChain } from '../provider/types';

const chainToPublicRPCUrls: Record<number, string[]> = {
    [mainnet.id]: [mainnet.rpcUrls.default.http[0]],
    [polygon.id]: [polygon.rpcUrls.default.http[0]],
    [celo.id]: [celo.rpcUrls.default.http[0]],
    [bsc.id]: [bsc.rpcUrls.default.http[0]],
    [fantom.id]: [fantom.rpcUrls.default.http[0]],
    [avalanche.id]: [avalanche.rpcUrls.default.http[0]],
    [arbitrum.id]: [arbitrum.rpcUrls.default.http[0]],
    [base.id]: [base.rpcUrls.default.http[0]],
    [sepolia.id]: [sepolia.rpcUrls.default.http[0]],
};

export class RpcProviderService {
    public currentRPCUrl: string;
    public currentChainID: SupportedChain;

    constructor (
        private readonly defaultRPCUrl: string,
        private readonly defaultChainID: SupportedChain
    ) {
        this.currentRPCUrl = this.defaultRPCUrl;
        this.currentChainID = this.defaultChainID;
    }

    public async isValidRPCUrl(chainId: SupportedChain, rpcUrl: string): Promise<boolean> {
        const rpcClient = getPublicClient(chainId, rpcUrl);
        const rpcResponseBlockNumber = await rpcClient.getChainId();

        return !!rpcResponseBlockNumber && rpcResponseBlockNumber === chainId;
    }

    public async getPublicRpcUrlForChain(chainId: SupportedChain): Promise<string> {
        if (chainId === this.defaultChainID) {
            return this.defaultRPCUrl;
        }

        const chainIDRPCEndpoints = chainToPublicRPCUrls[chainId];
        if (!chainIDRPCEndpoints || !chainIDRPCEndpoints.length) return '';

        for (const rpcUrl of chainIDRPCEndpoints) {
            const isValidRPCUrl = await this.isValidRPCUrl(chainId, rpcUrl);

            if (isValidRPCUrl) {
                return rpcUrl
            }
        }

        return '';
    }
}