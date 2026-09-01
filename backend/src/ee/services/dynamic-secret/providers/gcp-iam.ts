import { gaxios, Impersonated } from "google-auth-library";
import { GetAccessTokenResponse } from "google-auth-library/build/src/auth/oauth2client";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { buildGcpSourceCredential } from "@app/services/app-connection/gcp/gcp-connection-fns";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { DynamicSecretGcpIamSchema, TDynamicProviderFns } from "./models";

export class GcpIamServiceAccountSuffixError extends BadRequestError {
  constructor({ message }: { message: string }) {
    super({ message, name: "GcpIamServiceAccountSuffixError" });
  }
}

type TGcpIamProviderDTO = {
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

export const GcpIamProvider = ({ projectDAL }: TGcpIamProviderDTO): TDynamicProviderFns => {
  // used to keep backwards compatibility with existing provider inputs that didn't enforce the org id suffix
  const validateExistingProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretGcpIamSchema.parseAsync(inputs);
    return providerInputs;
  };

  const validateProviderInputs = async (inputs: unknown, metadata: { projectId: string }) => {
    const providerInputs = await DynamicSecretGcpIamSchema.parseAsync(inputs);

    // Check if provided service account email suffix matches organization ID.
    // We do this to mitigate confused deputy attacks in multi-tenant instances
    const project = await requestMemoize(requestMemoKeys.projectFindById(metadata.projectId), () =>
      projectDAL.findById(metadata.projectId)
    );
    if (!project) throw new NotFoundError({ message: `Project with ID '${metadata.projectId}' not found` });

    const expectedAccountIdSuffix = project.orgId.split("-").slice(0, 2).join("-");
    const serviceAccountId = providerInputs.serviceAccountEmail.split("@")[0];

    if (!serviceAccountId.endsWith(expectedAccountIdSuffix)) {
      throw new GcpIamServiceAccountSuffixError({
        message: `GCP service account ID must have a suffix of "${expectedAccountIdSuffix}"`
      });
    }

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

  const validateConnection = async (inputs: unknown, metadata: { projectId: string }) => {
    const providerInputs = await validateProviderInputs(inputs, metadata);
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

  const create = async (data: { inputs: unknown; expireAt: number; metadata: { projectId: string } }) => {
    const { inputs, expireAt } = data;

    const providerInputs = await validateExistingProviderInputs(inputs);

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

  const renew = async (inputs: unknown, entityId: string, expireAt: number, metadata: { projectId: string }) => {
    try {
      // To renew a token it must be re-created
      const data = await create({ inputs, expireAt, metadata });

      return { ...data, entityId };
    } catch (err) {
      const providerInputs = await validateExistingProviderInputs(inputs);
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
