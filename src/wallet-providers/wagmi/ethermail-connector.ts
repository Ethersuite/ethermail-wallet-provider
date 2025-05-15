import { createConnector } from '@wagmi/core'
import { EtherMailSignInOnSuccessEvent, EtherMailTokenErrorEvent } from '../../provider/utils';
import { EtherMailProvider } from '../../provider';
import { BrowserProvider } from 'ethers';
import { Chain } from 'viem';
import { jwtDecode } from 'jwt-decode';
import { etherMailIcon } from '../../assets/ethermail-icon';

type EnvironmentType = 'dev' | 'staging' | 'production';

export type EthermailConnectorParameters = {
    widget_id: string;
    afid: string;
    community_name: string;
    permissions: string;
    loginType: string;
    connectButtonLabel?: string
    environment?: EnvironmentType;
}

export function ethermailConnector(parameters: EthermailConnectorParameters) {
    let ethermailProvider: EtherMailProvider | null;
    let provider: BrowserProvider | null;

    return createConnector((config: any) => {
        validateParameters(parameters);
        let isConnected: boolean = false;

        return {
            id: 'ethermail',
            name: 'Ethermail',
            type: 'ethermail',
            icon: etherMailIcon,
            loginData: {},
            ETHERMAIL_API_DOMAIN: getEtherMailAPIDomainByEnvironment(parameters.environment ?? 'production'),
            ETHERMAIL_DOMAIN: getEtherMailDomainByEnvironment(parameters.environment ?? 'production'),
            async connect() {
                const chainId = await this.getChainId();
                const accounts = await this.getAccounts();

                return { accounts, chainId }
            },
            async disconnect() {
                isConnected = false;
                provider = null;
                ethermailProvider = null;

                removeEthermailLoginElement();
                removeEthermailSDKScript();
            },
            async getAccounts() {
                if (!provider) throw new Error('Not connected');
                const signer = await provider.getSigner();

                return [signer.address as `0x${string}`];
            },
            async getChainId() {
                if (!provider) await this.getProvider();

                const network = await provider?.getNetwork();
                if (!network) throw new Error('No network found');

                const chainId = network.chainId.toString();
                return +chainId;
            },
            async getProvider() {
                if (!ethermailProvider) {
                    createEthermailLoginElement(
                        parameters.widget_id ?? '',
                        parameters.loginType ?? 'wallet',
                        parameters.permissions ?? 'write',
                        parameters.connectButtonLabel ?? 'Connect Wallet'
                    );

                    await runEthermailSDKScript(
                        parameters.environment ?? 'production',
                        parameters.afid,
                        parameters.community_name,
                    );

                    await new Promise((resolve) => {
                        const check = () => {
                            if (customElements.get('ethermail-login')) resolve(true);
                            else setTimeout(check, 50);
                        };
                        check();
                    });

                    const ethermailLogin = document.querySelector('ethermail-login');
                    if (!ethermailLogin) {
                        throw new Error('Ethermail login element not found');
                    }

                    const shadowRoot = ethermailLogin.shadowRoot;
                    if (!shadowRoot) {
                        throw new Error('Shadow root not found');
                    }

                    const loginButton = shadowRoot.querySelector('.ethermail-login-button');
                    if (!loginButton) {
                        throw new Error('Ethermail login button not found');
                    }
                    (loginButton as HTMLElement).click();

                    addEthermailLoginErrorListener();

                    return await new Promise<EtherMailProvider>((resolve, reject) => {
                        let timeoutId = setTimeout(() => {
                            reject(new Error('Ethermail login timed out after 60 seconds'));
                        }, 60000); // 60-second timeout

                        const handleSignInSuccess = async (event: Event) => {
                            const successEvent = event as EtherMailSignInOnSuccessEvent;

                            const sessionToken = successEvent.detail.token;
                            this.loginData = jwtDecode(sessionToken);

                            ethermailProvider = new EtherMailProvider({
                                websocketServer: `wss://${this.ETHERMAIL_API_DOMAIN}/events`,
                                appUrl: `https://${this.ETHERMAIL_DOMAIN}`,
                            });

                            provider = new BrowserProvider(ethermailProvider);
                            isConnected = true;
                            clearTimeout(timeoutId);

                            resolve(ethermailProvider);
                        };

                        window.addEventListener('EtherMailSignInOnSuccess', handleSignInSuccess, { once: true });
                    });
                }

                return ethermailProvider;
            },
            async switchChain({ addEthereumChainParameter, chainId }) {
                if (!provider) await this.getProvider()
                if (!ethermailProvider) throw new Error('Connect wallet before');

                const chain = config.chains.find((x: Chain) => x.id === chainId)
                await ethermailProvider.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: chainId }],
                });

                provider = getBrowserProvider(ethermailProvider);

                config.emitter.emit('change', { chainId })

                return chain;
            },
            async isAuthorized() {
                return isConnected;
            },
            onAccountsChanged(accounts: `0x${string}`[]) {},
            onChainChanged(chainId: string) {},
            onDisconnect() {},
        };
    });
}

const getEtherMailAPIDomainByEnvironment = (environment: EnvironmentType) => {
    const baseEthermailAPIDomain = 'api.ethermail.io';

    return getDomainByEnvironment(baseEthermailAPIDomain, environment);
}

const getEtherMailDomainByEnvironment = (environment: EnvironmentType) => {
    const baseEthermailDomain = 'ethermail.io';

    return getDomainByEnvironment(baseEthermailDomain, environment, '.');
}

const getDomainByEnvironment = (baseDomain: string, environment: EnvironmentType, separation = '-') => {
    if (environment !== 'production') {

        return `${environment.toLowerCase()}${separation}${baseDomain}`;
    }

    return baseDomain;
}

const getEtherMailSDKScriptUrl = (environment: EnvironmentType) => {
    const baseScriptUrl = 'https://cdn-email.ethermail.io/sdk/v2/ethermail.js';

    if (environment !== 'production') {
        const urlParts = baseScriptUrl.split('ethermail.js');
        return `${urlParts[0]}${environment}-ethermail.js`;
    }

    return baseScriptUrl;
}

const getBrowserProvider = (ethermailProvider: EtherMailProvider) => {
    return new BrowserProvider(ethermailProvider);
}

const createEthermailLoginElement = (widgetId: string, loginType: string, ssoPermission: string, label: string) => {
    if (!document.getElementById('ethermail-login')) {
        const ethermailLogin = document.createElement('ethermail-login');

        // Set attributes (widget, type, permissions, label)
        ethermailLogin.setAttribute('widget', widgetId);
        ethermailLogin.setAttribute('type', loginType);
        ethermailLogin.setAttribute('permissions', ssoPermission);
        ethermailLogin.setAttribute('label', label);

        ethermailLogin.style.position = 'absolute'; // Option 2: Move off-screen
        ethermailLogin.style.left = '-9999px';

        // Append to the document body
        document.body.appendChild(ethermailLogin);
    }
}

const runEthermailSDKScript = async (environment: EnvironmentType, afid: string, communityAlias: string,) => {
    const scriptUrl = getEtherMailSDKScriptUrl(environment);

    (function({ ...args }) {
        const ethermailSDKScript = Array.from(document.getElementsByTagName('script')).find(
            (script) => script.src === scriptUrl || script.src === 'https://cdn-email.ethermail.io/sdk/v2/ethermail.js'
        );
        if (!ethermailSDKScript) {
            var p = document.createElement('script');
            p.id = 'ethermail-sdk-script';
            p.src = scriptUrl ?? 'https://cdn-email.ethermail.io/sdk/v2/ethermail.js';
            document.body.appendChild(p);
            p.setAttribute('a', args.afid);
            p.setAttribute('b', args.communityAlias);
            // @ts-ignore
            p.setAttribute('c', args.features);
        }
    })({
        afid,
        communityAlias,
        features: ['login'],
    });
}

const removeEthermailLoginElement = () => {
    const ethermailLogin = document.querySelector('ethermail-login');
    if (ethermailLogin) {
        ethermailLogin.remove();
    }
};

const removeEthermailSDKScript = () => {
    const sdkScript = document.getElementById('ethermail-sdk-script');
    if (sdkScript) {
        sdkScript.remove();
    }
};

const addEthermailLoginErrorListener = () => {
    window.addEventListener('EtherMailTokenError', (event: Event) => {
        console.log(event);
        const errorEvent = event as EtherMailTokenErrorEvent;
        if (errorEvent.detail.type === 'expired') {
            console.error('Expired Session!')
        } else if (errorEvent.detail.type === 'permissions') {
            console.error('Permissions Error!');
        }
    });
}

function validateParameters(parameters: EthermailConnectorParameters) {
    // Check if parameters is an object and not null/undefined
    if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
        throw new Error('Parameters must be a valid object');
    }

    // 1. Validate widget_id (Mongo ID: 24 characters, exists, is string)
    if (!parameters.widget_id || typeof parameters.widget_id !== 'string' || parameters.widget_id.length !== 24) {
        throw new Error('widget_id must be a 24-character string');
    }

    // 2. Validate afid (Mongo ID: 24 characters, exists, is string)
    if (!parameters.afid || typeof parameters.afid !== 'string' || parameters.afid.length !== 24) {
        throw new Error('afid must be a 24-character string');
    }

    // 3. Validate community_name (exists and not empty)
    if (!parameters.community_name || parameters.community_name === '') {
        throw new Error('community_name must be a non-empty string');
    }

    // 4. Validate permissions (must be "read" or "write")
    if (!parameters.permissions || (parameters.permissions !== 'read' && parameters.permissions !== 'write')) {
        throw new Error('permissions must be either "read" or "write"');
    }

    // 5. Validate loginType (must be "wallet")
    if (!parameters.loginType || parameters.loginType !== 'wallet') {
        throw new Error('loginType must be "wallet"');
    }

    // 6. Validate environment (must be "dev", "staging", or "production")
    if (!parameters.environment || !['dev', 'staging', 'production'].includes(parameters.environment)) {
        throw new Error('environment must be "dev", "staging", or "production"');
    }
}