import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { safeRequest } from "@app/lib/validator";

import { DynamicSecretTailscaleSchema, TailscaleKeyAuthType, TDynamicProviderFns } from "./models";

const TAILSCALE_API_BASE_URL = "https://api.tailscale.com/api/v2";

type TTailscaleKeyResponse = {
  id: string;
  key: string;
};

export const TailscaleProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: object) => {
    const providerInputs = await DynamicSecretTailscaleSchema.parseAsync(inputs);
    return providerInputs;
  };

  const $requestConfig = (apiKey: string) => ({
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    timeout: 30000,
    maxRedirects: 0
  });

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs as object);

    try {
      await safeRequest.get(
        `${TAILSCALE_API_BASE_URL}/tailnet/${encodeURIComponent(providerInputs.tailnet)}/keys?all=true`,
        $requestConfig(providerInputs.apiKey)
      );
      return true;
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [providerInputs.apiKey]
      });
      throw new BadRequestError({ message: `Failed to connect with Tailscale: ${sanitizedErrorMessage}` });
    }
  };

  const create = async (data: { inputs: unknown; expireAt: number }) => {
    const { inputs, expireAt } = data;
    const providerInputs = await validateProviderInputs(inputs as object);

    const url = `${TAILSCALE_API_BASE_URL}/tailnet/${encodeURIComponent(providerInputs.tailnet)}/keys`;

    let body: Record<string, unknown>;
    if (providerInputs.authType === TailscaleKeyAuthType.AuthKeys) {
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
    } else {
      body = {
        keyType: "client",
        description: providerInputs.description,
        scopes: providerInputs.scopes,
        tags: providerInputs.tags
      };
    }

    try {
      const response = await safeRequest.post<TTailscaleKeyResponse>(url, body, $requestConfig(providerInputs.apiKey));
      const { id, key } = response.data;

      if (providerInputs.authType === TailscaleKeyAuthType.AuthKeys) {
        return { entityId: id, data: { AUTH_KEY: key, KEY_ID: id } };
      }

      return { entityId: id, data: { CLIENT_ID: id, CLIENT_SECRET: key } };
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [providerInputs.apiKey]
      });
      throw new BadRequestError({ message: `Failed to create Tailscale key: ${sanitizedErrorMessage}` });
    }
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs as object);

    const url = `${TAILSCALE_API_BASE_URL}/tailnet/${encodeURIComponent(providerInputs.tailnet)}/keys/${encodeURIComponent(entityId)}`;

    try {
      await safeRequest.delete(url, $requestConfig(providerInputs.apiKey));
      return { entityId };
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [providerInputs.apiKey]
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
