import { isAxiosError } from "axios";

import { TDynamicSecrets } from "@app/db/schemas";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { OPEN_ROUTER_API_BASE_URL } from "@app/services/app-connection/open-router";

import { ActorIdentityAttributes } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import { DynamicSecretOpenRouterSchema, TDynamicProviderFns } from "./models";
import { generateUsername } from "./templateUtils";

type TOpenRouterCreateKeyResponse = {
  key: string;
  data: { hash: string };
};

const OPEN_ROUTER_REQUEST_TIMEOUT_MS = 30_000;

export const OpenRouterProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretOpenRouterSchema.parseAsync(inputs);
    return providerInputs;
  };

  const $requestConfig = (managementKey: string) => ({
    headers: {
      Authorization: `Bearer ${managementKey}`,
      "Content-Type": "application/json"
    },
    timeout: OPEN_ROUTER_REQUEST_TIMEOUT_MS
  });

  const $getErrorMessage = (err: unknown, managementKey: string) => {
    let message = (err as Error)?.message || "Unknown error";
    if (isAxiosError<{ error?: { message?: string } }>(err) && err.response?.data?.error?.message) {
      message = err.response.data.error.message;
    }
    // sanitizeString splits on word boundaries, which never matches a hyphenated sk-or-v1- key
    return message.replaceAll(managementKey, "[REDACTED]");
  };

  const validateConnection = async (inputs: unknown) => {
    const { managementKey } = await validateProviderInputs(inputs);

    try {
      // only management keys can list keys, so this also rejects a regular inference key
      await request.get(`${OPEN_ROUTER_API_BASE_URL}/keys`, $requestConfig(managementKey));
      return true;
    } catch (err) {
      throw new BadRequestError({
        message: `Failed to connect with OpenRouter: ${$getErrorMessage(err, managementKey)}`
      });
    }
  };

  const create = async (data: {
    inputs: unknown;
    expireAt: number;
    usernameTemplate?: string | null;
    identity: ActorIdentityAttributes;
    dynamicSecret: TDynamicSecrets;
  }) => {
    const { inputs, expireAt, usernameTemplate, identity, dynamicSecret } = data;
    const providerInputs = await validateProviderInputs(inputs);

    const name = await generateUsername(usernameTemplate, {
      decryptedDynamicSecretInputs: inputs,
      dynamicSecret,
      identity,
      usernamePrefix: "infisical-",
      usernameLength: 16
    });

    try {
      const { data: response } = await request.post<TOpenRouterCreateKeyResponse>(
        `${OPEN_ROUTER_API_BASE_URL}/keys`,
        {
          name,
          // OpenRouter expires the key on its own at the lease expiry, even if the lease revocation never runs
          expires_at: new Date(expireAt).toISOString(),
          workspace_id: providerInputs.workspaceId || undefined,
          limit: providerInputs.limit,
          limit_reset: providerInputs.limitReset,
          include_byok_in_limit: providerInputs.includeByokInLimit
        },
        $requestConfig(providerInputs.managementKey)
      );

      if (!response.key || !response.data?.hash) {
        throw new Error("OpenRouter returned a response without an API key or key hash");
      }

      return {
        entityId: response.data.hash,
        data: { API_KEY: response.key, KEY_HASH: response.data.hash, KEY_NAME: name }
      };
    } catch (err) {
      throw new BadRequestError({
        message: `Failed to create OpenRouter API key: ${$getErrorMessage(err, providerInputs.managementKey)}`
      });
    }
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const { managementKey } = await validateProviderInputs(inputs);

    try {
      await request.delete(
        `${OPEN_ROUTER_API_BASE_URL}/keys/${encodeURIComponent(entityId)}`,
        $requestConfig(managementKey)
      );
    } catch (err) {
      // already deleted in OpenRouter, so the lease can still be closed
      if (isAxiosError(err) && err.response?.status === 404) return { entityId };

      throw new BadRequestError({
        message: `Failed to delete OpenRouter API key: ${$getErrorMessage(err, managementKey)}`
      });
    }

    return { entityId };
  };

  const renew = async () => {
    // the key's expires_at is fixed at creation and OpenRouter cannot extend it
    throw new BadRequestError({ message: "OpenRouter dynamic secret does not support renewal" });
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
