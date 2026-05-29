import { AxiosError } from "axios";

import {
  TAuth0ClientSecretRotationGeneratedCredentials,
  TAuth0ClientSecretRotationWithConnection
} from "@app/ee/services/secret-rotation-v2/auth0-client-secret/auth0-client-secret-rotation-types";
import {
  TRotationFactory,
  TRotationFactoryCheckActiveCredentials,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { getAuth0ConnectionAccessToken } from "@app/services/app-connection/auth0/auth0-connection-fns";

import { generatePassword } from "../shared/utils";

export const auth0ClientSecretRotationFactory: TRotationFactory<
  TAuth0ClientSecretRotationWithConnection,
  TAuth0ClientSecretRotationGeneratedCredentials
> = (secretRotation, appConnectionDAL, kmsService) => {
  const {
    connection,
    parameters: { clientId },
    secretsMapping
  } = secretRotation;

  const $rotateClientSecret = async () => {
    const accessToken = await getAuth0ConnectionAccessToken(connection, appConnectionDAL, kmsService);
    const { audience } = connection.credentials;
    await blockLocalAndPrivateIpAddresses(audience);
    const clientSecret = generatePassword();

    await request.request({
      method: "PATCH",
      url: `${audience}clients/${clientId}`,
      headers: { authorization: `Bearer ${accessToken}` },
      data: {
        client_secret: clientSecret
      }
    });

    return { clientId, clientSecret };
  };

  const issueCredentials: TRotationFactoryIssueCredentials<TAuth0ClientSecretRotationGeneratedCredentials> = async (
    callback
  ) => {
    const credentials = await $rotateClientSecret();

    return callback(credentials);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<TAuth0ClientSecretRotationGeneratedCredentials> = async (
    _,
    callback
  ) => {
    const accessToken = await getAuth0ConnectionAccessToken(connection, appConnectionDAL, kmsService);
    const { audience } = connection.credentials;
    await blockLocalAndPrivateIpAddresses(audience);

    // we just trigger an auth0 rotation to negate our credentials
    await request.request({
      method: "POST",
      url: `${audience}clients/${clientId}/rotate-secret`,
      headers: { authorization: `Bearer ${accessToken}` }
    });

    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<TAuth0ClientSecretRotationGeneratedCredentials> = async (
    _,
    callback
  ) => {
    const credentials = await $rotateClientSecret();

    return callback(credentials);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TAuth0ClientSecretRotationGeneratedCredentials> = (
    generatedCredentials
  ) => {
    const secrets = [
      {
        key: secretsMapping.clientId,
        value: generatedCredentials.clientId
      },
      {
        key: secretsMapping.clientSecret,
        value: generatedCredentials.clientSecret
      }
    ];

    return secrets;
  };

  const checkActiveCredentials: TRotationFactoryCheckActiveCredentials<
    TAuth0ClientSecretRotationGeneratedCredentials
  > = async ({ clientId: activeClientId, clientSecret }) => {
    const { domain, audience } = connection.credentials;
    const instanceUrl = domain.startsWith("http") ? domain : `https://${domain}`;
    await blockLocalAndPrivateIpAddresses(instanceUrl);

    try {
      await request.request({
        method: "POST",
        url: `${removeTrailingSlash(instanceUrl)}/oauth/token`,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        data: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: activeClientId,
          client_secret: clientSecret,
          audience
        })
      });
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        const errorData = error.response?.data as { error?: string; error_description?: string } | undefined;
        if (errorData?.error === "invalid_scope" || errorData?.error === "access_denied") return;
        throw new BadRequestError({
          message: `Auth0 client credentials check failed: ${errorData?.error_description ?? errorData?.error ?? error.message}`
        });
      }
      throw error;
    }
  };

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload,
    checkActiveCredentials
  };
};
