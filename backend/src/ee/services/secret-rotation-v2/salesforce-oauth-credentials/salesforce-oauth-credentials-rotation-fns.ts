import { AxiosError } from "axios";
import { Connection as JsforceConnection } from "jsforce";

import {
  TRotationFactory,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import {
  getSalesforceConnectionAccessToken,
  SALESFORCE_API_VERSION
} from "@app/services/app-connection/salesforce/salesforce-connection-fns";

import {
  TSalesforceConsumersResponse,
  TSalesforceOauthCredentialsRotationGeneratedCredentials,
  TSalesforceOauthCredentialsRotationWithConnection,
  TSalesforceStagedCredentialsResponse
} from "./salesforce-oauth-credentials-rotation-types";

export const salesforceOauthCredentialsRotationFactory: TRotationFactory<
  TSalesforceOauthCredentialsRotationWithConnection,
  TSalesforceOauthCredentialsRotationGeneratedCredentials
> = (secretRotation) => {
  const {
    connection,
    parameters: { appId, appName },
    secretsMapping
  } = secretRotation;

  const $authedRequest = async () => {
    const { accessToken, instanceUrl } = await getSalesforceConnectionAccessToken(connection.credentials);
    return {
      instanceUrl,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      } as const
    };
  };

  const $deleteStagedCredential = async (stagedCredentialUrl: string) => {
    const { instanceUrl, headers } = await $authedRequest();
    try {
      await request.request({
        method: "DELETE",
        url: `${instanceUrl}${stagedCredentialUrl}`,
        headers
      });
    } catch (error) {
      // 404 means the credential was already gone (manually deleted, or auto-expired past Salesforce's grace window)
      if (error instanceof AxiosError && error.response?.status === 404) return;
      throw error;
    }
  };

  const $issueConsumerSecret = async (): Promise<TSalesforceOauthCredentialsRotationGeneratedCredentials[number]> => {
    const { instanceUrl, headers } = await $authedRequest();

    const { data: consumersData } = await request.request<TSalesforceConsumersResponse>({
      method: "GET",
      url: `${instanceUrl}/services/data/${SALESFORCE_API_VERSION}/apps/oauth/credentials/${appId}`,
      headers
    });

    const consumer = consumersData.consumers?.[0];
    if (!consumer?.stagedCredentialsUrl) {
      throw new Error(`Salesforce app "${appId}" has no consumers configured for rotation`);
    }
    // rotating the External Client App that the connection itself authenticates with would
    // immediately invalidate the connection's own credentials, breaking this rotation and any
    // subsequent ones. Refuse rather than self-revoke.
    if (consumer.key === connection.credentials.consumerKey) {
      throw new BadRequestError({
        message:
          "Cannot rotate the consumer secret of the External Client App that this Salesforce connection authenticates with. Choose a different app or use a separate Salesforce connection."
      });
    }
    if (consumersData.consumers.length > 1) {
      logger.warn(
        `Salesforce app [appId=${appId}] has ${consumersData.consumers.length} consumers; rotating the first one only — assign each consumer to its own External Client App if all need rotation`
      );
    }

    const { data: stagedData } = await request.request<TSalesforceStagedCredentialsResponse>({
      method: "POST",
      url: `${instanceUrl}${consumer.stagedCredentialsUrl}`,
      headers
    });

    const staged = stagedData.stagedCredentials?.[0];
    if (!staged?.url || !staged.key || !staged.secret) {
      throw new Error("Salesforce did not return a staged credential after POST");
    }

    try {
      await request.request({
        method: "PATCH",
        url: `${instanceUrl}${staged.url}`,
        headers,
        data: { command: "rotate" }
      });
    } catch (error) {
      // best-effort cleanup of the staged credential we just created
      await request
        .request({ method: "DELETE", url: `${instanceUrl}${staged.url}`, headers })
        .catch((cleanupError: Error) => {
          logger.warn(
            { err: cleanupError },
            `Failed to clean up Salesforce staged credential after PATCH rotate failure [stagedUrl=${staged.url}]`
          );
        });
      throw error;
    }

    return {
      consumerKey: staged.key,
      consumerSecret: staged.secret,
      stagedCredentialUrl: staged.url
    };
  };

  const issueCredentials: TRotationFactoryIssueCredentials<
    TSalesforceOauthCredentialsRotationGeneratedCredentials
  > = async (callback) => {
    const credentials = await $issueConsumerSecret();
    return callback(credentials);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<
    TSalesforceOauthCredentialsRotationGeneratedCredentials
  > = async (credentialsToRevoke, callback) => {
    logger.info({ credentialsToRevoke }, "Revoking Salesforce OAuth credentials");

    // Disable OAuth on the External Client App via the SOAP Metadata API. This invalidates
    // every consumer key/secret pair on the app — including ones Infisical was managing —
    // without leaving stale credentials behind, which DELETE on the staged-credentials URL
    // does not reliably guarantee for the currently-active credential.
    const { accessToken, instanceUrl } = await getSalesforceConnectionAccessToken(connection.credentials);

    const conn = new JsforceConnection({
      instanceUrl,
      accessToken,
      version: SALESFORCE_API_VERSION.replace(/^v/, "")
    });

    // policy name is the app name with _plcy suffix
    const fullName = `${appName}_plcy`;

    logger.info({ appName }, "Disabling OAuth on Salesforce External Client App");
    const result = await conn.metadata.update("ExtlClntAppConfigurablePolicies", [
      {
        fullName,
        externalClientApplication: appName,
        isOauthPluginEnabled: false
      }
    ]);

    if (result.length === 0 || result[0].success === false) {
      throw new BadRequestError({
        message: `Failed to disable OAuth on Salesforce External Client App "${appName}": unknown error`
      });
    }
    await conn.logout();

    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<
    TSalesforceOauthCredentialsRotationGeneratedCredentials
  > = async (credentialToRevoke, callback) => {
    const credentials = await $issueConsumerSecret();
    // Salesforce keeps the previously-active credential valid for a grace period after PATCH rotate,
    // which is why this rotation is dual-credentials. Once a credential ages out of the array (one
    // generation past "previous"), DELETE it from Salesforce to prevent stale credentials from
    // remaining authentic-able beyond their Infisical lifespan.
    if (credentialToRevoke?.stagedCredentialUrl) {
      await $deleteStagedCredential(credentialToRevoke.stagedCredentialUrl);
    }
    return callback(credentials);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<
    TSalesforceOauthCredentialsRotationGeneratedCredentials
  > = (generatedCredentials) => [
    { key: secretsMapping.consumerKey, value: generatedCredentials.consumerKey },
    { key: secretsMapping.consumerSecret, value: generatedCredentials.consumerSecret }
  ];

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload
  };
};
