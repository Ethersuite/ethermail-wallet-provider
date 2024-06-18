# EtherMail

## _EtherMail SSO + Wallet Provider_

EtherMail SSO enables apps to seamlessly support web2 and web3 login via EtherMail.

## Features

- Enable web2 and web3 login
- Allow users to choose permissions to enable/disable wallet interactions

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
      p.src = 'https://cdn-email.ethermail.io/sdk/v2/staging-ethermail.js';
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

You will get back a JWT token:

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

function signMessage() {
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

function signMessage() {
  const account = await web3.eth.getAccounts();
  const signature = await web3.eth.personal.sign(
    web3.utils.utf8ToHex("Hello from web3"),
    account[0],
    "123456"
  );
  console.log(signature);
}
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
