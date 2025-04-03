import { mainnet, polygon, celo, bsc, fantom, avalanche, arbitrum, base, sepolia } from 'viem/chains';
import { getPublicClient } from '../provider/client';
import { SupportedChain } from '../provider/types';

const chainToPublicRPCUrls: Record<number, string[]> = {
    [mainnet.id]: [mainnet.rpcUrls.default.http[0], 'https://eth.llamarpc.com', 'https://eth.drpc.org'],
    [polygon.id]: [polygon.rpcUrls.default.http[0], 'https://polygon-pokt.nodies.app', 'https://polygon-bor-rpc.publicnode.com'],
    [celo.id]: [celo.rpcUrls.default.http[0], 'https://celo.drpc.org'],
    [bsc.id]: [bsc.rpcUrls.default.http[0], 'https://bsc-mainnet.public.blastapi.io', 'https://bsc.drpc.org'],
    [fantom.id]: [fantom.rpcUrls.default.http[0], 'https://fantom-pokt.nodies.app', 'https://rpc.fantom.network'],
    [avalanche.id]: [avalanche.rpcUrls.default.http[0], 'https://avalanche-c-chain-rpc.publicnode.com', 'https://avalanche.drpc.org'],
    [arbitrum.id]: [arbitrum.rpcUrls.default.http[0], 'https://endpoints.omniatech.io/v1/arbitrum/one/public', 'https://arbitrum.drpc.org'],
    [base.id]: [base.rpcUrls.default.http[0], 'https://base-rpc.publicnode.com', 'https://base.llamarpc.com'],
    [sepolia.id]: [sepolia.rpcUrls.default.http[0], 'https://ethereum-sepolia-rpc.publicnode.com', 'https://eth-sepolia.public.blastapi.io'],
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