import { gaxios, Impersonated } from "google-auth-library";
import { GetAccessTokenResponse } from "google-auth-library/build/src/auth/oauth2client";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { buildGcpSourceCredential } from "@app/services/app-connection/gcp/gcp-connection-fns";

import { DynamicSecretGcpIamSchema, TDynamicProviderFns } from "./models";

export const GcpIamProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretGcpIamSchema.parseAsync(inputs);
    return providerInputs;
  };

  const $getToken = async (serviceAccountEmail: string, ttl: number, tokenScopes: string[]): Promise<string> => {
    const appCfg = getConfig();
    if (!appCfg.INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL) {
      throw new InternalServerError({
        message: "Environment variable has not been configured: INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL"
      });
    }

    const sourceClient = buildGcpSourceCredential(appCfg.INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL);

    const impersonatedCredentials = new Impersonated({
      sourceClient,
      targetPrincipal: serviceAccountEmail,
      lifetime: ttl,
      delegates: [],
      targetScopes: [...new Set(tokenScopes)]
    });

    let tokenResponse: GetAccessTokenResponse | undefined;
    try {
      tokenResponse = await impersonatedCredentials.getAccessToken();
    } catch (error) {
      logger.error(
        { err: error },
        `Failed to obtain GCP impersonated access token [serviceAccountEmail=${serviceAccountEmail}]`
      );

      throw new BadRequestError({
        message: error instanceof gaxios.GaxiosError ? error.message : "Unable to validate connection"
      });
    }

    if (!tokenResponse || !tokenResponse.token) {
      throw new BadRequestError({
        message: "Unable to validate connection"
      });
    }

    return tokenResponse.token;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    try {
      await $getToken(providerInputs.serviceAccountEmail, 10, providerInputs.tokenScopes);
      return true;
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [providerInputs.serviceAccountEmail]
      });
      throw new BadRequestError({
        message: `Failed to connect with provider: ${sanitizedErrorMessage}`
      });
    }
  };

  const create = async (data: { inputs: unknown; expireAt: number }) => {
    const { inputs, expireAt } = data;

    const providerInputs = await validateProviderInputs(inputs);

    try {
      const now = Math.floor(Date.now() / 1000);
      const ttl = Math.max(Math.floor(expireAt / 1000) - now, 0);

      const token = await $getToken(providerInputs.serviceAccountEmail, ttl, providerInputs.tokenScopes);
      const entityId = alphaNumericNanoId(32);

      return { entityId, data: { SERVICE_ACCOUNT_EMAIL: providerInputs.serviceAccountEmail, TOKEN: token } };
    } catch (err) {
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [providerInputs.serviceAccountEmail]
      });
      throw new BadRequestError({
        message: `Failed to create lease from provider: ${sanitizedErrorMessage}`
      });
    }
  };

  const revoke = async (_inputs: unknown, entityId: string) => {
    // There's no way to revoke GCP IAM access tokens
    return { entityId };
  };

  const renew = async (inputs: unknown, entityId: string, expireAt: number) => {
    try {
      // To renew a token it must be re-created
      const data = await create({ inputs, expireAt });

      return { ...data, entityId };
    } catch (err) {
      const providerInputs = await validateProviderInputs(inputs);
      const sanitizedErrorMessage = sanitizeString({
        unsanitizedString: (err as Error)?.message,
        tokens: [providerInputs.serviceAccountEmail]
      });
      throw new BadRequestError({
        message: `Failed to renew lease from provider: ${sanitizedErrorMessage}`
      });
    }
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
