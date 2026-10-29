import { logger } from "@app/lib/logger";
import { OauthGrantType } from "@app/services/oauth-client/oauth-client-types";

import { describeServer } from "./agent-vault-oauth-discovery-fns";
import { TOauthHttpClient, withTimeout } from "./agent-vault-oauth-http-fns";
import {
  MAX_ERROR_CODE_LENGTH,
  MAX_ERROR_DESCRIPTION_LENGTH,
  normalizeProviderText,
  OAUTH_VSCHAR_PATTERN
} from "./agent-vault-oauth-token-fns";
import { AgentVaultOauthClientAuthMethod, AgentVaultOauthCompatibility } from "./agent-vault-oauth-types";

const AGENT_VAULT_OAUTH_CLIENT_NAME = "Infisical Agent Vault";

// Shared by both registration attempts, so authorization creation answers well inside the gateway timeout.
const REGISTRATION_BUDGET_MS = 15_000;

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

export const MAX_CLIENT_ID_LENGTH = 2048;
export const MAX_CLIENT_SECRET_LENGTH = 4096;

const parseRegistration = (body: string, requestedMethod: AgentVaultOauthClientAuthMethod): TOauthClient | null => {
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
    !OAUTH_VSCHAR_PATTERN.test(parsed.client_id)
  ) {
    return null;
  }
  let clientSecret: string | undefined;
  if (typeof parsed.client_secret === "string" && parsed.client_secret) {
    if (parsed.client_secret.length > MAX_CLIENT_SECRET_LENGTH || !OAUTH_VSCHAR_PATTERN.test(parsed.client_secret)) {
      return null;
    }
    clientSecret = parsed.client_secret;
  }
  // The server may assign a method other than the one asked for; what it returns is what the client holds.
  let method = typeof parsed.token_endpoint_auth_method === "string" ? parsed.token_endpoint_auth_method : null;
  if (!method || !SUPPORTED_AUTH_METHODS.includes(method)) {
    if (!clientSecret) method = AgentVaultOauthClientAuthMethod.None;
    else if (requestedMethod !== AgentVaultOauthClientAuthMethod.None) method = requestedMethod;
    else method = AgentVaultOauthClientAuthMethod.ClientSecretBasic;
  }
  return {
    clientId: parsed.client_id,
    clientSecret,
    tokenEndpointAuthMethod: method as AgentVaultOauthClientAuthMethod
  };
};

// RFC 8414 makes client_secret_basic the default when the server lists no methods.
const secretAuthMethod = (supported: string[] | null) =>
  supported &&
  !supported.includes(AgentVaultOauthClientAuthMethod.ClientSecretBasic) &&
  supported.includes(AgentVaultOauthClientAuthMethod.ClientSecretPost)
    ? AgentVaultOauthClientAuthMethod.ClientSecretPost
    : AgentVaultOauthClientAuthMethod.ClientSecretBasic;

// RFC 7591. Servers must ignore metadata fields they don't understand, so the only one a strict server can refuse
// is `application_type` (an OIDC registration value); a refusal is retried once without it. `grant_types` stays,
// or a strict server registers authorization_code only and every refresh fails with unauthorized_client. It drops
// refresh_token only when the server's metadata lists its grants without it, since a strict one refuses the request.
// It asks for a public client unless the server lists its auth methods without `none`, for the same reason.
export const registerOauthClient = async ({
  http,
  serverUrl,
  registrationEndpoint,
  redirectUri,
  grantTypesSupported,
  tokenEndpointAuthMethodsSupported
}: {
  http: TOauthHttpClient;
  serverUrl: string;
  registrationEndpoint: string;
  redirectUri: string;
  grantTypesSupported: string[] | null;
  tokenEndpointAuthMethodsSupported: string[] | null;
}): Promise<{ client: TOauthClient; compatibility: AgentVaultOauthCompatibility[] }> => {
  const refreshSupported = !grantTypesSupported || grantTypesSupported.includes(OauthGrantType.RefreshToken);
  const publicClientSupported =
    !tokenEndpointAuthMethodsSupported ||
    tokenEndpointAuthMethodsSupported.includes(AgentVaultOauthClientAuthMethod.None);
  const minimal = {
    client_name: AGENT_VAULT_OAUTH_CLIENT_NAME,
    redirect_uris: [redirectUri],
    token_endpoint_auth_method: publicClientSupported
      ? AgentVaultOauthClientAuthMethod.None
      : secretAuthMethod(tokenEndpointAuthMethodsSupported),
    grant_types: refreshSupported
      ? [OauthGrantType.AuthorizationCode, OauthGrantType.RefreshToken]
      : [OauthGrantType.AuthorizationCode],
    response_types: ["code"]
  };
  const full = { ...minimal, application_type: "web" };

  const deadline = Date.now() + REGISTRATION_BUDGET_MS;
  let lastStatus: number | null = null;
  let lastReason = "";
  // eslint-disable-next-line no-restricted-syntax
  for (const [attempt, body] of [full, minimal].entries()) {
    let response;
    try {
      // eslint-disable-next-line no-await-in-loop
      response = await withTimeout(http.postJson(registrationEndpoint, body), Math.max(1, deadline - Date.now()));
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
      const client = parseRegistration(response.body, minimal.token_endpoint_auth_method);
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

// An admin-entered client.
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
  return { clientId, clientSecret, tokenEndpointAuthMethod: secretAuthMethod(tokenEndpointAuthMethodsSupported) };
};
