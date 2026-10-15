import RE2 from "re2";

import { logger } from "@app/lib/logger";

import { describeServer } from "./agent-vault-oauth-discovery-fns";
import { TOauthHttpClient } from "./agent-vault-oauth-http-fns";
import {
  MAX_ERROR_CODE_LENGTH,
  MAX_ERROR_DESCRIPTION_LENGTH,
  normalizeProviderText
} from "./agent-vault-oauth-token-fns";
import { AgentVaultOauthClientAuthMethod, AgentVaultOauthCompatibility } from "./agent-vault-oauth-types";

export const AGENT_VAULT_OAUTH_CLIENT_NAME = "Infisical Agent Vault";

export type TOauthClient = {
  clientId: string;
  clientSecret?: string;
  tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod;
};

export class OauthRegistrationError extends Error {
  status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "OauthRegistrationError";
    this.status = status;
  }
}

const SUPPORTED_AUTH_METHODS = Object.values(AgentVaultOauthClientAuthMethod) as string[];

// RFC 6749 appendix A.1 and A.2: both are VSCHAR. The ID is stored in jsonb and sent in the authorize URL, and the
// secret is form-encoded into the token request, which throws on a lone surrogate.
export const OAUTH_CLIENT_CREDENTIAL_PATTERN = new RE2(/^[\x20-\x7e]+$/);
const MAX_CLIENT_ID_LENGTH = 512;
const MAX_CLIENT_SECRET_LENGTH = 4096;

const parseRegistration = (body: string): TOauthClient | null => {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed.client_id !== "string" ||
    parsed.client_id.length > MAX_CLIENT_ID_LENGTH ||
    !OAUTH_CLIENT_CREDENTIAL_PATTERN.test(parsed.client_id)
  ) {
    return null;
  }
  let clientSecret: string | undefined;
  if (typeof parsed.client_secret === "string" && parsed.client_secret) {
    if (
      parsed.client_secret.length > MAX_CLIENT_SECRET_LENGTH ||
      !OAUTH_CLIENT_CREDENTIAL_PATTERN.test(parsed.client_secret)
    ) {
      return null;
    }
    clientSecret = parsed.client_secret;
  }
  // The server may assign a method other than the one asked for; what it returns is what the client holds.
  let method = typeof parsed.token_endpoint_auth_method === "string" ? parsed.token_endpoint_auth_method : null;
  if (!method || !SUPPORTED_AUTH_METHODS.includes(method)) {
    method = clientSecret ? AgentVaultOauthClientAuthMethod.ClientSecretBasic : AgentVaultOauthClientAuthMethod.None;
  }
  return {
    clientId: parsed.client_id,
    clientSecret,
    tokenEndpointAuthMethod: method as AgentVaultOauthClientAuthMethod
  };
};

// RFC 7591. Some servers reject metadata fields they don't know, so a refusal is retried once with only the
// fields every server has to accept.
export const registerOauthClient = async ({
  http,
  serverUrl,
  registrationEndpoint,
  redirectUri
}: {
  http: TOauthHttpClient;
  serverUrl: string;
  registrationEndpoint: string;
  redirectUri: string;
}): Promise<{ client: TOauthClient; compatibility: AgentVaultOauthCompatibility[] }> => {
  const minimal = {
    client_name: AGENT_VAULT_OAUTH_CLIENT_NAME,
    redirect_uris: [redirectUri],
    token_endpoint_auth_method: AgentVaultOauthClientAuthMethod.None
  };
  const full = {
    ...minimal,
    application_type: "web",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"]
  };

  let lastStatus: number | null = null;
  let lastReason = "";
  // eslint-disable-next-line no-restricted-syntax
  for (const [attempt, body] of [full, minimal].entries()) {
    let response;
    try {
      // eslint-disable-next-line no-await-in-loop
      response = await http.postJson(registrationEndpoint, body);
    } catch {
      logger.info(`agentVaultOauth: client registration unreachable [server=${describeServer(serverUrl)}]`);
      throw new OauthRegistrationError("its registration endpoint couldn't be reached.", null);
    }
    lastStatus = response.status;
    try {
      const refusal = JSON.parse(response.body) as { error?: unknown; error_description?: unknown };
      lastReason =
        normalizeProviderText(refusal.error_description, MAX_ERROR_DESCRIPTION_LENGTH) ||
        normalizeProviderText(refusal.error, MAX_ERROR_CODE_LENGTH);
    } catch {
      lastReason = "";
    }
    if (response.status === 200 || response.status === 201) {
      const client = parseRegistration(response.body);
      if (!client) {
        throw new OauthRegistrationError("its registration endpoint returned no usable client ID.", response.status);
      }
      return {
        client,
        compatibility: attempt === 0 ? [] : [AgentVaultOauthCompatibility.RegistrationMinimal]
      };
    }
    logger.info(
      `agentVaultOauth: client registration refused [server=${describeServer(serverUrl)}] [status=${response.status}] [attempt=${attempt + 1}]`
    );
    if (response.status >= 500) break;
  }

  throw new OauthRegistrationError(
    `its registration endpoint refused to register Infisical as a client (${lastReason || `HTTP ${lastStatus}`}).`,
    lastStatus
  );
};

// An admin-entered client. RFC 8414 makes client_secret_basic the default when the server lists no methods.
export const manualOauthClient = ({
  clientId,
  clientSecret,
  tokenEndpointAuthMethodsSupported
}: {
  clientId: string;
  clientSecret?: string;
  tokenEndpointAuthMethodsSupported: string[] | null;
}): TOauthClient => {
  if (!clientSecret) return { clientId, tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.None };
  const supported = tokenEndpointAuthMethodsSupported;
  const method =
    supported &&
    !supported.includes(AgentVaultOauthClientAuthMethod.ClientSecretBasic) &&
    supported.includes(AgentVaultOauthClientAuthMethod.ClientSecretPost)
      ? AgentVaultOauthClientAuthMethod.ClientSecretPost
      : AgentVaultOauthClientAuthMethod.ClientSecretBasic;
  return { clientId, clientSecret, tokenEndpointAuthMethod: method };
};
