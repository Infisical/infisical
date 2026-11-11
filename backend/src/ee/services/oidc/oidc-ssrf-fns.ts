import http from "node:http";
import https from "node:https";

import { ClientMetadata, custom, Issuer } from "openid-client";

import { ssrfSafeLookup, validateSsrfUrl } from "@app/lib/validator";

// Dedicated agents without keep-alive. A pooled socket is reused without a lookup, and the shared global agent
// pools by host and port, so it could hand openid-client a socket that other code opened to the same host
// after DNS had moved to an internal address.
const httpAgent = new http.Agent({ keepAlive: false });
const httpsAgent = new https.Agent({ keepAlive: false });

// openid-client makes its own HTTP requests and resolves each host again when it connects, so a check made
// before the request cannot stop a DNS answer that changes in between. The lookup it is given checks the
// addresses the socket actually connects to.
export const ssrfSafeHttpOptions = (url: URL) => ({
  agent: url.protocol === "https:" ? httpsAgent : httpAgent,
  lookup: ssrfSafeLookup
});

// Issuer.discover runs its request with the options hook of the class it is called on; a subclass keeps the
// hook off the Issuer class every other caller shares.
export class SsrfSafeIssuer extends Issuer {
  static [custom.http_options] = ssrfSafeHttpOptions;
}

// Checks every endpoint the login flow calls and installs the lookup hook on the issuer (JWKS) and the client
// (token, userinfo). A discovered issuer names its own endpoints, so saving the config never checked them.
// Node skips the lookup for an IP literal host, which the up-front check covers instead.
export const secureOidcIssuer = async (issuer: Issuer) => {
  const { jwks_uri: jwksUri, token_endpoint: tokenEndpoint, userinfo_endpoint: userinfoEndpoint } = issuer.metadata;
  for (const endpoint of [jwksUri, tokenEndpoint, userinfoEndpoint]) {
    // eslint-disable-next-line no-await-in-loop
    if (endpoint) await validateSsrfUrl(endpoint);
  }
  // eslint-disable-next-line no-param-reassign
  issuer[custom.http_options] = ssrfSafeHttpOptions;
};

export const createSsrfSafeOidcClient = (issuer: Issuer, metadata: ClientMetadata) => {
  const client = new issuer.Client(metadata);
  client[custom.http_options] = ssrfSafeHttpOptions;
  return client;
};
