import { isAxiosError } from "axios";

import { TDynamicSecrets } from "@app/db/schemas";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { ActorIdentityAttributes } from "../../dynamic-secret-lease/dynamic-secret-lease-types";
import { DynamicSecretCloudflareAccessSchema, TDynamicProviderFns } from "./models";
import { generateUsername } from "./templateUtils";

type TCloudflareResponse<T> = {
  success: boolean;
  result: T;
};

type TCloudflareServiceToken = {
  id: string;
  client_id: string;
  client_secret?: string;
};

type TCloudflareErrorResponse = {
  errors?: { code?: number; message?: string }[];
};

const CLOUDFLARE_REQUEST_TIMEOUT_MS = 30_000;

export const CloudflareAccessProvider = (): TDynamicProviderFns => {
  const $serviceTokensUrl = (accountId: string) =>
    `${IntegrationUrls.CLOUDFLARE_API_URL}/client/v4/accounts/${accountId}/access/service_tokens`;

  const $requestConfig = (apiToken: string) => ({
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json"
    },
    timeout: CLOUDFLARE_REQUEST_TIMEOUT_MS
  });

  const $getErrorMessage = (err: unknown, apiToken: string) => {
    let message = (err as Error)?.message || "Unknown error";
    if (isAxiosError<TCloudflareErrorResponse>(err)) {
      const errors = err.response?.data?.errors?.filter((e) => e.message);
      if (errors?.length) message = errors.map((e) => (e.code ? `${e.message} (${e.code})` : e.message)).join("; ");
    }
    return message.replaceAll(apiToken, "[REDACTED]");
  };

  const validateProviderInputs = async (inputs: unknown) => DynamicSecretCloudflareAccessSchema.parseAsync(inputs);

  const validateConnection = async (inputs: unknown) => {
    const { apiToken, accountId } = await validateProviderInputs(inputs);

    try {
      await request.get(`${$serviceTokensUrl(accountId)}?per_page=1`, $requestConfig(apiToken));
      return true;
    } catch (err) {
      throw new BadRequestError({
        message: `Failed to connect with Cloudflare: ${$getErrorMessage(err, apiToken)}`
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

    // Cloudflare expires the token on its own at the lease expiry, even if the lease revocation never runs
    const durationSeconds = Math.max(Math.ceil((expireAt - Date.now()) / 1000), 1);

    try {
      const { data: response } = await request.post<TCloudflareResponse<TCloudflareServiceToken>>(
        $serviceTokensUrl(providerInputs.accountId),
        {
          name,
          duration: `${durationSeconds}s`,
          tags: Object.fromEntries(providerInputs.tags.map(({ key, value }) => [key, value]))
        },
        // a retried POST can create a second token that no lease tracks
        { ...$requestConfig(providerInputs.apiToken), "axios-retry": { retries: 0 } }
      );

      const token = response.result;
      if (!token?.id || !token.client_id || !token.client_secret) {
        throw new Error("Cloudflare returned a response without a service token ID, client ID or client secret");
      }

      return {
        // the account is kept with the token, so revoke still finds it after the account ID changes
        entityId: `${providerInputs.accountId}/${token.id}`,
        data: {
          CLIENT_ID: token.client_id,
          CLIENT_SECRET: token.client_secret,
          TOKEN_ID: token.id,
          TOKEN_NAME: name
        }
      };
    } catch (err) {
      throw new BadRequestError({
        message: `Failed to create Cloudflare Access service token: ${$getErrorMessage(err, providerInputs.apiToken)}`
      });
    }
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const { apiToken } = await validateProviderInputs(inputs);

    const separatorIndex = entityId.indexOf("/");
    if (separatorIndex === -1) {
      throw new BadRequestError({
        message: `Cannot revoke Cloudflare Access service token: lease entity ID "${entityId}" is not in the format <accountId>/<tokenId>`
      });
    }
    const accountId = entityId.slice(0, separatorIndex);
    const tokenId = entityId.slice(separatorIndex + 1);

    try {
      await request.delete(
        `${$serviceTokensUrl(encodeURIComponent(accountId))}/${encodeURIComponent(tokenId)}`,
        $requestConfig(apiToken)
      );
    } catch (err) {
      // already deleted in Cloudflare, so the lease can still be closed
      if (isAxiosError(err) && err.response?.status === 404) return { entityId };

      throw new BadRequestError({
        message: `Failed to delete Cloudflare Access service token: ${$getErrorMessage(err, apiToken)}`
      });
    }

    return { entityId };
  };

  const renew = async () => {
    // Cloudflare's refresh extends a token by its full duration from now, which can't be aligned with a lease
    throw new BadRequestError({ message: "Cloudflare Access dynamic secret does not support renewal" });
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
