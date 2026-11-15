import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

import { ClientMetadata, custom, Issuer } from "openid-client";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { isPrivateIp } from "@app/lib/ip/ipRange";
import { buildOidcDiscoveryDocumentUrl } from "@app/lib/oauth";
import { stripIpv6Brackets } from "@app/lib/tls";
import { PRIVATE_ADDRESS_REFUSED_MESSAGE, ssrfSafeLookup, validateAndPinUrl } from "@app/lib/validator";

// Dedicated agents without keep-alive. A pooled socket is reused without a lookup, and the shared global agent
// pools by host and port, so it could hand openid-client a socket that other code opened to the same host
// after DNS had moved to an internal address.
const httpAgent = new http.Agent({ keepAlive: false });
const httpsAgent = new https.Agent({ keepAlive: false });

// openid-client makes its own HTTP requests and resolves each host again when it connects, so a check made
// before the request cannot stop a DNS answer that changes in between. The lookup it is given checks the
// addresses the socket actually connects to. Node skips the lookup for an IP literal host, so an internal one
// is refused here, on the URL actually requested, whatever produced it.
export const ssrfSafeHttpOptions = (url: URL) => {
  const appCfg = getConfig();
  const host = stripIpv6Brackets(url.hostname);
  if (!appCfg.isDevelopmentMode && !appCfg.ALLOW_INTERNAL_IP_CONNECTIONS && isIP(host) && isPrivateIp(host)) {
    throw new BadRequestError({ message: PRIVATE_ADDRESS_REFUSED_MESSAGE });
  }
  return {
    agent: url.protocol === "https:" ? httpsAgent : httpAgent,
    lookup: ssrfSafeLookup
  };
};

// Issuer.discover runs its request with the options hook of the class it is called on; a subclass keeps the
// hook off the Issuer class every other caller shares.
export class SsrfSafeIssuer extends Issuer {
  static [custom.http_options] = ssrfSafeHttpOptions;
}

// Issuer.discover builds the well-known URL with the legacy url.parse, which can read a host differently from
// the WHATWG parser the checks use (http://127.0.0.1%61.example is 127.0.0.1a.example to one and 127.0.0.1 to the
// other). Given a URL that already names /.well-known/, it requests that URL unchanged, through the WHATWG
// parser, so build it here and check exactly what will be requested.
export const discoverOidcIssuer = async (discoveryURL: string) => {
  const discoveryDocumentUrl = buildOidcDiscoveryDocumentUrl(discoveryURL);

  await validateAndPinUrl(discoveryDocumentUrl);
  return SsrfSafeIssuer.discover(discoveryDocumentUrl);
};

// Checks every endpoint the login flow calls and installs the lookup hook on the issuer (JWKS) and the client
// (token, userinfo). A discovered issuer names its own endpoints, so saving the config never checked them.
export const secureOidcIssuer = async (issuer: Issuer) => {
  const { jwks_uri: jwksUri, token_endpoint: tokenEndpoint, userinfo_endpoint: userinfoEndpoint } = issuer.metadata;
  for (const endpoint of [jwksUri, tokenEndpoint, userinfoEndpoint]) {
    // eslint-disable-next-line no-await-in-loop
    if (endpoint) await validateAndPinUrl(endpoint);
  }
  // eslint-disable-next-line no-param-reassign
  issuer[custom.http_options] = ssrfSafeHttpOptions;
};

export const createSsrfSafeOidcClient = (issuer: Issuer, metadata: ClientMetadata) => {
  const client = new issuer.Client(metadata);
  client[custom.http_options] = ssrfSafeHttpOptions;
  return client;
};
