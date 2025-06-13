import { gaxios, Impersonated, JWT } from "google-auth-library";
import { GetAccessTokenResponse } from "google-auth-library/build/src/auth/oauth2client";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { DynamicSecretGcpIamSchema, TDynamicProviderFns } from "./models";

export const GcpIamProvider = (): TDynamicProviderFns => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretGcpIamSchema.parseAsync(inputs);
    return providerInputs;
  };

  const $getToken = async (serviceAccountEmail: string, ttl: number): Promise<string> => {
    const appCfg = getConfig();
    if (!appCfg.INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL) {
      throw new InternalServerError({
        message: "Environment variable has not been configured: INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL"
      });
    }

    const credJson = JSON.parse(appCfg.INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL) as {
      client_email: string;
      private_key: string;
    };

    const sourceClient = new JWT({
      email: credJson.client_email,
      key: credJson.private_key,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"]
    });

    const impersonatedCredentials = new Impersonated({
      sourceClient,
      targetPrincipal: serviceAccountEmail,
      lifetime: ttl,
      delegates: [],
      targetScopes: ["https://www.googleapis.com/auth/iam", "https://www.googleapis.com/auth/cloud-platform"]
    });

    let tokenResponse: GetAccessTokenResponse | undefined;
    try {
      tokenResponse = await impersonatedCredentials.getAccessToken();
    } catch (error) {
      let message = "Unable to validate connection";
      if (error instanceof gaxios.GaxiosError) {
        message = error.message;
      }

      throw new BadRequestError({
        message
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
    await $getToken(providerInputs.serviceAccountEmail, 10);
    return true;
  };

  const create = async (data: { inputs: unknown; expireAt: number }) => {
    const { inputs, expireAt } = data;

    const providerInputs = await validateProviderInputs(inputs);

    const now = Math.floor(Date.now() / 1000);
    const ttl = Math.max(Math.floor(expireAt / 1000) - now, 0);

    const token = await $getToken(providerInputs.serviceAccountEmail, ttl);
    const entityId = alphaNumericNanoId(32);

    return { entityId, data: { SERVICE_ACCOUNT_EMAIL: providerInputs.serviceAccountEmail, TOKEN: token } };
  };

  const revoke = async (_inputs: unknown, entityId: string) => {
    // There's no way to revoke GCP IAM access tokens
    return { entityId };
  };

  const renew = async (inputs: unknown, entityId: string, expireAt: number) => {
    // To renew a token it must be re-created
    const data = await create({ inputs, expireAt });

    return { ...data, entityId };
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew
  };
};
