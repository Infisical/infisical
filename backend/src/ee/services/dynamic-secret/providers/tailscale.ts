import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
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

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs as object);

    try {
      const token = await $getBearerToken(providerInputs.auth);
      await safeRequest.get(
        `${TAILSCALE_API_BASE_URL}/tailnet/${encodeURIComponent(providerInputs.tailnet)}/keys?all=true`,
        $requestConfig(token)
      );
      return true;
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
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
                ephemeral: false,
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
          scopes: providerInputs.scopes,
          tags: providerInputs.tags
        };
        break;
      case TailscaleKeyAuthType.FederatedKeys:
        // Federated identities carry no secret and never expire on their own; the lease revoke deletes them.
        body = {
          keyType: "federated",
          description: providerInputs.description,
          scopes: providerInputs.scopes,
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
      logger.error(err as Error);
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
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
        unsanitizedString: (err as Error)?.message,
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
