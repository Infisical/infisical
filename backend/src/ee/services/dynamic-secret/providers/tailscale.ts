import { isAxiosError } from "axios";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { safeRequest } from "@app/lib/validator";

import { DynamicSecretTailscaleSchema, TailscaleAuthMethod, TailscaleKeyAuthType, TDynamicProviderFns } from "./models";

const TAILSCALE_API_BASE_URL = "https://api.tailscale.com/api/v2";

type TTailscaleProviderInputs = z.infer<typeof DynamicSecretTailscaleSchema>;
type TTailscaleAuth = TTailscaleProviderInputs["auth"];

type TTailscaleKeyResponse = {
  id: string;
  // auth keys and OAuth clients return a secret in `key`; federated identities do not.
  key?: string;
  // federated identities return the audience.
  audience?: string;
};

type TTailscaleOAuthTokenResponse = {
  access_token: string;
};

export const TailscaleProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: object) => {
    const providerInputs = await DynamicSecretTailscaleSchema.parseAsync(inputs);
    return providerInputs;
  };

  const $requestConfig = (token: string) => ({
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    timeout: 30000
  });

  // Secrets to redact from any surfaced error message.
  const $sensitiveTokens = (auth: TTailscaleAuth): string[] =>
    auth.method === TailscaleAuthMethod.ApiKey ? [auth.apiKey] : [auth.clientId, auth.clientSecret];

  // Surfaces the message Tailscale returns in the response body (e.g. "actor cannot set scopes: [devices:core]")
  // rather than the generic Axios "Request failed with status code 4xx". Falls back to the raw error message.
  const $getErrorMessage = (err: unknown): string => {
    if (isAxiosError<{ message?: string } | string>(err) && err.response) {
      const { data } = err.response;
      if (typeof data === "string" && data) return data;
      if (data && typeof data === "object" && data.message) return data.message;
      if (data) return JSON.stringify(data);
    }
    return (err as Error)?.message;
  };

  // Resolves the Bearer token used for the Tailscale API. API-key auth uses the token
  // directly; OAuth auth exchanges the client credentials for a short-lived access token.
  const $getBearerToken = async (auth: TTailscaleAuth): Promise<string> => {
    if (auth.method === TailscaleAuthMethod.ApiKey) {
      return auth.apiKey;
    }

    const tokenResponse = await safeRequest.post<TTailscaleOAuthTokenResponse>(
      `${TAILSCALE_API_BASE_URL}/oauth/token`,
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: auth.clientId,
        client_secret: auth.clientSecret
      }).toString(),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 30000
      }
    );

    return tokenResponse.data.access_token;
  };

  // oauth credentials issued can have the auth-keys or oauth scope, which allow them
  // to modify other credentials. Let's block it so this is not possible
  const $validateScopes = async (scopes: string[]) => {
    if (scopes.includes("auth-keys") || scopes.includes("oauth")) {
      throw new BadRequestError({ message: "OAuth credentials cannot be used to create or modify other credentials" });
    }
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs as object);

    try {
      const token = await $getBearerToken(providerInputs.auth);

      // OAuth auth is fully validated by the client_credentials exchange in $getBearerToken: a
      // successful token proves the credentials are valid without assuming a key-read scope. An OAuth
      // client scoped only to create keys (all a lease needs) would fail a key listing, so we must not
      // probe reads here. API-key auth performs no exchange, so probe a read endpoint to confirm the
      // token; Tailscale API access tokens are owner-scoped, so a valid key always passes.
      if (providerInputs.auth.method === TailscaleAuthMethod.ApiKey) {
        await safeRequest.get(
          `${TAILSCALE_API_BASE_URL}/tailnet/${encodeURIComponent(providerInputs.tailnet)}/keys?all=true`,
          $requestConfig(token)
        );
      }

      return true;
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: $getErrorMessage(err),
        tokens: $sensitiveTokens(providerInputs.auth)
      });
      throw new BadRequestError({ message: `Failed to connect with Tailscale: ${sanitizedErrorMessage}` });
    }
  };

  const create = async (data: { inputs: unknown; expireAt: number }) => {
    const { inputs, expireAt } = data;
    const providerInputs = await validateProviderInputs(inputs as object);

    const url = `${TAILSCALE_API_BASE_URL}/tailnet/${encodeURIComponent(providerInputs.tailnet)}/keys`;

    let body: Record<string, unknown>;
    switch (providerInputs.authType) {
      case TailscaleKeyAuthType.AuthKeys: {
        // Tailscale expires auth keys after expirySeconds; align it with the lease TTL as defense-in-depth.
        const expirySeconds = Math.max(Math.floor(expireAt / 1000) - Math.floor(Date.now() / 1000), 0);
        body = {
          keyType: "auth",
          description: providerInputs.description,
          expirySeconds,
          capabilities: {
            devices: {
              create: {
                reusable: providerInputs.reusable,
                // Force ephemeral so devices provisioned through a lease are removed from the
                // tailnet automatically once offline. Revoking the key alone does not delete its devices.
                ephemeral: true,
                preauthorized: providerInputs.preauthorized,
                tags: providerInputs.tags
              }
            }
          }
        };
        break;
      }
      case TailscaleKeyAuthType.OAuthKeys:
        body = {
          keyType: "client",
          description: providerInputs.description,
          scopes: $validateScopes(providerInputs.scopes),
          tags: providerInputs.tags
        };
        break;
      case TailscaleKeyAuthType.FederatedKeys:
        // Federated identities carry no secret and never expire on their own; the lease revoke deletes them.
        body = {
          keyType: "federated",
          description: providerInputs.description,
          scopes: $validateScopes(providerInputs.scopes),
          tags: providerInputs.tags,
          issuer: providerInputs.issuer,
          subject: providerInputs.subject,
          ...(providerInputs.audience ? { audience: providerInputs.audience } : {})
        };
        break;
      default: {
        const exhaustiveCheck: never = providerInputs;
        throw new Error(`Unhandled Tailscale auth type: ${JSON.stringify(exhaustiveCheck)}`);
      }
    }

    try {
      const token = await $getBearerToken(providerInputs.auth);
      const response = await safeRequest.post<TTailscaleKeyResponse>(url, body, $requestConfig(token));
      const { id, key, audience } = response.data;

      if (providerInputs.authType === TailscaleKeyAuthType.AuthKeys) {
        return { entityId: id, data: { AUTH_KEY: key, KEY_ID: id } };
      }

      if (providerInputs.authType === TailscaleKeyAuthType.OAuthKeys) {
        return { entityId: id, data: { CLIENT_ID: id, CLIENT_SECRET: key } };
      }

      return { entityId: id, data: { FEDERATED_CREDENTIAL_ID: id, AUDIENCE: audience ?? "" } };
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: $getErrorMessage(err),
        tokens: $sensitiveTokens(providerInputs.auth)
      });
      throw new BadRequestError({ message: `Failed to create Tailscale key: ${sanitizedErrorMessage}` });
    }
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs as object);

    const url = `${TAILSCALE_API_BASE_URL}/tailnet/${encodeURIComponent(providerInputs.tailnet)}/keys/${encodeURIComponent(entityId)}`;

    try {
      const token = await $getBearerToken(providerInputs.auth);
      await safeRequest.delete(url, $requestConfig(token));
      return { entityId };
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: $getErrorMessage(err),
        tokens: $sensitiveTokens(providerInputs.auth)
      });
      throw new BadRequestError({ message: `Failed to revoke Tailscale key: ${sanitizedErrorMessage}` });
    }
  };

  const renew = async () => {
    // Tailscale keys are immutable and cannot be extended once created.
    throw new BadRequestError({ message: "Tailscale dynamic secret does not support renewal" });
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
