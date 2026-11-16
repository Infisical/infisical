import { isAxiosError } from "axios";

import { TDynamicSecrets } from "@app/db/schemas";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { OPEN_ROUTER_API_BASE_URL } from "@app/services/app-connection/open-router";

import { ActorIdentityAttributes } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import { DynamicSecretOpenRouterSchema, TDynamicProviderFns, TDynamicProviderValidateMetadata } from "./models";
import { generateUsername } from "./templateUtils";

type TOpenRouterCreateKeyResponse = {
  key: string;
  data: { hash: string };
};

type TOpenRouterOrganizationSettingsResponse = {
  data: { id: string };
};

type TOpenRouterCurrentKeyResponse = {
  data: { creator_user_id: string };
};

const OPEN_ROUTER_REQUEST_TIMEOUT_MS = 30_000;
const OPEN_ROUTER_KEY_NAME_MAX_LENGTH = 255;

export const OpenRouterProvider = (): TDynamicProviderFns => {
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

  const $getAccountId = async (managementKey: string) => {
    try {
      const { data } = await request.get<TOpenRouterOrganizationSettingsResponse>(
        `${OPEN_ROUTER_API_BASE_URL}/organization/settings`,
        $requestConfig(managementKey)
      );
      return data.data.id;
    } catch (err) {
      if (!isAxiosError(err) || err.response?.status !== 404) throw err;
    }

    // personal accounts have no organization settings, so the user who created the key identifies the account
    const { data } = await request.get<TOpenRouterCurrentKeyResponse>(
      `${OPEN_ROUTER_API_BASE_URL}/key`,
      $requestConfig(managementKey)
    );
    return data.data.creator_user_id;
  };

  const validateProviderInputs = async (inputs: unknown, metadata?: TDynamicProviderValidateMetadata) => {
    const providerInputs = await DynamicSecretOpenRouterSchema.parseAsync(inputs);

    const previousManagementKey = (metadata?.previousInputs as { managementKey?: unknown } | undefined)?.managementKey;
    if (typeof previousManagementKey !== "string" || previousManagementKey === providerInputs.managementKey) {
      return providerInputs;
    }

    if (metadata?.hasActiveLeases) {
      throw new BadRequestError({
        message:
          "The management key can't be changed while this dynamic secret has active leases, because Infisical deletes their API keys with the current management key. Revoke the active leases first, then change the management key."
      });
    }

    let previousAccountId: string;
    try {
      previousAccountId = await $getAccountId(previousManagementKey);
    } catch (err) {
      // a rejected stored key can no longer revoke anything, so there is no account to stay within
      if (isAxiosError(err) && err.response?.status === 401) return providerInputs;
      throw new BadRequestError({
        message: `Failed to look up the OpenRouter organization of the current management key: ${$getErrorMessage(err, previousManagementKey)}`
      });
    }

    let accountId: string;
    try {
      accountId = await $getAccountId(providerInputs.managementKey);
    } catch (err) {
      throw new BadRequestError({
        message: `Failed to connect with OpenRouter: ${$getErrorMessage(err, providerInputs.managementKey)}`
      });
    }

    if (accountId !== previousAccountId) {
      throw new BadRequestError({
        message:
          "The new management key belongs to a different OpenRouter organization than the current one. Keys issued by this dynamic secret can only be deleted from their own organization, so use a management key from the same organization, or create a new dynamic secret."
      });
    }

    return providerInputs;
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

    if (name.length >= OPEN_ROUTER_KEY_NAME_MAX_LENGTH) {
      throw new BadRequestError({
        message: `OpenRouter API key name must be less than ${OPEN_ROUTER_KEY_NAME_MAX_LENGTH} characters. The generated name is ${name.length} characters. Shorten the dynamic secret name or the key name template.`
      });
    }

    try {
      const { data: response } = await request.post<TOpenRouterCreateKeyResponse>(
        `${OPEN_ROUTER_API_BASE_URL}/keys`,
        {
          name,
          // OpenRouter expires the key on its own at the lease expiry, even if the lease revocation never runs
          expires_at: new Date(expireAt).toISOString(),
          workspace_id: providerInputs.workspaceId || undefined,
          limit: providerInputs.limit ? parseFloat(providerInputs.limit) : undefined,
          limit_reset: providerInputs.limitReset ?? undefined,
          include_byok_in_limit: providerInputs.includeByokInLimit
        },
        // a retried POST can create a second key that no lease tracks
        { ...$requestConfig(providerInputs.managementKey), "axios-retry": { retries: 0 } }
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
