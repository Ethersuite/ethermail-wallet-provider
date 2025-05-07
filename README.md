# EtherMail

## _EtherMail SSO + Wallet Provider_

EtherMail SSO enables apps to seamlessly support web2 and web3 login via EtherMail.  
Now, EtherMail's token is **OAuth 2.0 compatible**, making it even easier to integrate with existing authentication systems.

## Features

- Enable web2 and web3 login
- Allow users to choose permissions to enable/disable wallet interactions
- **OAuth 2.0 Compatibility** for easier integration with third-party services

## Installation

Get the login widget from the [Marketing Hub](https://hub.ethermail.io/login) and follow the steps to embed it into your site.

Install the dependencies. If you don't need to support wallet actions, you can skip this step.

```sh
npm i @ethermail/ethermail-wallet-provider
```

## Usage

After embedding the login widget, add event listeners for custom events. You will receive the `EtherMailSignInOnSuccess` custom event on a successful login, and you can use that event to connect to our provider with web3.js/ethers.js, etc.

Embedded script:

```html
<script defer>
  (function ({ ...args }) {
      var p = document.createElement('script');
      p.src = 'https://cdn-email.ethermail.io/sdk/v2/ethermail.js';
      document.body.appendChild(p);
      p.setAttribute('a', args.afid);
      p.setAttribute('b', args.communityAlias);
      p.setAttribute('c', args.features);
    })({
      afid: <AFID>,
      communityAlias: <COMMUNITY_NAME>,
      features: ['login']
    });
</script>

<ethermail-login
  widget="<ID>"
  type="wallet"
  permissions="write"
></ethermail-login>
```

You will get back an **OAuth 2.0 compatible JWT** token:

```ts
{
  exp: number;
  iat: number;
  iss: string;
  sub: string;
  permissions: "none" | "read" | "write";
  type: "sso" | "wallet";
  origin: string;
  address: string;
  wallet: `0x${string}`;
  ethermail_verified: boolean;
}
```

Example with ethers.js version 6:

```ts
import { EtherMailProvider } from "@ethermail/ethermail-wallet-provider";
import { BrowserProvider } from "ethers";

let provider;

window.addEventListener("EtherMailSignInOnSuccess", async (event) => {
  console.log("token", event.detail.token);
  // If you want to support wallet actions, connect to our provider
  provider = new BrowserProvider(new EtherMailProvider());
});

async function signMessage() {
  const signer = await provider.getSigner();
  const signature = await signer.signMessage("Hello world");
  console.log(signature);
}
```

Example with web3.js:

```ts
import { EtherMailProvider } from "@ethermail/ethermail-wallet-provider";
import Web3 from "web3";

let web3;

window.addEventListener("EtherMailSignInOnSuccess", async (event) => {
  console.log("token", event.detail.token);
  // If you want to support wallet actions, connect to our provider
  web3 = new Web3(new EtherMailProvider());
});

async function signMessage() {
  const account = await web3.eth.getAccounts();
  const signature = await web3.eth.personal.sign(
    web3.utils.utf8ToHex("Hello from web3"),
    account[0],
    "123456"
  );
  console.log(signature);
}
```

For sendTransactions due to the way web3.js handles promises, errors and polling, we recommend using the following approach

```ts
const tx = await web3Provider.eth.sendTransaction({
  from: accounts[0],
  to: recipient,
  gas: gasEstimation,
  value,
  gasPrice
})
.on('transactionHash', function(hash){
  // ...
})
.on('receipt', function(receipt){
  // ...
}).on('error', console.error);
```

Another custom event is `EtherMailTokenError`, which will be used in case of token expiration or permissions error:

```ts
window.addEventListener("EtherMailTokenError", (event) => {
  if (event.detail.type === "expired") {
    // Show login modal or redirect to login page
  }

  if (event.detail.type === "permissions") {
    // Show permissions error message, or redirect to login page
  }
});
```

### Token Validation

#### API Call
To validate a token, send a request to our API as demonstrated below. We recommend that you make this request on the server.
```javascript
const validateToken = async (token) => {
  try {
    const response = await fetch(
      "https://api.ethermail.io/sso/validate-token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: token,
        }),
      }
    );

    const result = await response.json();

    if (result.success) {
      console.log("Token is valid");
    } else {
      console.log("Token is invalid");
    }
  } catch (error) {
    console.error("Error validating token:", error);
  }
};
```

### OAuth 2.0 Compatibility
EtherMail's JWT is fully **OAuth 2.0 compatible**, allowing it to be easily integrated with third-party OAuth clients. This enables seamless authentication across different platforms, with full support for OpenID Connect (OIDC).

### Endpoints:
- **OpenID Configuration:**  
  [https://api.ethermail.io/.well-known/openid-configuration](https://api.ethermail.io/.well-known/openid-configuration)

- **JWK URI:**  
  [https://api.ethermail.io/.well-known/jwks.json](https://api.ethermail.io/.well-known/jwks.json)

```javascript
import axios from 'axios';
import { createPublicKey } from 'crypto';
import jwt from 'jsonwebtoken';

async function validateTokenByOpenIDConfig(token: string) {
    // 🔹 Fetch OpenID Configuration
    const { data: { jwks_uri } } = await axios.get(`https://api.ethermail.io/.well-known/openid-configuration`);

    // 🔹 Fetch JWKS
    const { data: jwkKeys } = await axios.get(jwks_uri);

    // 🔹 Extract key from the JWKS
    const jwk = jwkKeys.keys[0];

    // 🔹 Convert JWK to PEM format
    const publicKeyPem = jwkToPem(jwk);

    // 🔹 Verify the Token
    const decodedToken = jwt.verify(token, publicKeyPem, {
        algorithms: ['RS256'],
    });

    return { message: 'Token is valid', decodedToken };
}

function jwkToPem(jwk: any): string {
    const keyObject = createPublicKey({
        key: jwk,
        format: 'jwk',
    });

    return keyObject.export({ type: 'spki', format: 'pem' }).toString();
}
```