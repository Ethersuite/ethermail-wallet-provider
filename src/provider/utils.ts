import { jwtDecode } from "jwt-decode";
import type { SupportedChain, JWTPayload, TokenErrorType } from "./types";

export const supportedChains = [1, 137, 11155111] as const;

export const ethereumMethods = [
  "eth_sendTransaction",
  "eth_signTransaction",
  "eth_sign",
  "personal_sign",
  "eth_signTypedData",
  "eth_signTypedData_v4",
] as const;

export function getProposerInfo() {
  const url = new URL(window.location.href);
  const header = document.getElementsByTagName("head")[0]!;
  const iconLink = document.querySelector('link[rel="icon"]');
  const icon = iconLink?.getAttribute("href");

  const proposerURL = url.origin;
  const proposerName = header.getElementsByTagName("title")[0]?.innerText ?? proposerURL;
  const proposerIcon = icon?.includes("://")
    ? `${icon}`
    : `${proposerURL}${icon}`;

  return { proposerName, proposerURL, proposerIcon };
}

export function decodeToken(): JWTPayload | null {
  const token = localStorage.getItem("ethermail_token");

  if (!token) return null;

  const decoded = jwtDecode<JWTPayload>(token);
  return decoded;
}

export function buildRequestData(
  method: string,
  data: string,
  chainId: SupportedChain
) {
  const { proposerName, proposerURL, proposerIcon } = getProposerInfo();

  return {
    id: Date.now(),
    data,
    type: method,
    proposerName,
    proposerURL,
    proposerIcon,
    chainId,
    version: 1,
  };
}

export function dispatchErrorEvent(type: TokenErrorType) {
  const customEvent = new CustomEvent<{ type: TokenErrorType }>(
    "EtherMailTokenError",
    {
      detail: { type },
    }
  );

  window.dispatchEvent(customEvent);
}
