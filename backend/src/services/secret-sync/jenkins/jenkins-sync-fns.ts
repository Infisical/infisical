/* eslint-disable no-await-in-loop */
import { isAxiosError } from "axios";
import RE2 from "re2";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError, GatewayTransportError } from "@app/lib/errors";
import {
  getJenkinsErrorMessage,
  jenkinsRequest,
  paginateJenkins,
  TJenkinsConnection,
  TJenkinsGatewayDeps
} from "@app/services/app-connection/jenkins";
import { matchesSchema } from "@app/services/secret-sync/secret-sync-fns";

import { SecretSyncError } from "../secret-sync-errors";
import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";
import { TSecretSyncPayload } from "../secret-sync-payload";
import { TSecretMap } from "../secret-sync-types";
import { JenkinsSyncScope } from "./jenkins-sync-enums";
import { TJenkinsCredential, TJenkinsSyncWithCredentials } from "./jenkins-sync-types";

// The listing only exposes the type's display name, which jenkinsRequest pins to English
const JENKINS_SECRET_TEXT_TYPE_NAME = "Secret text";
const JENKINS_CREDENTIAL_DESCRIPTION = "Managed by Infisical";
// The rule Jenkins' own credential form enforces; the REST endpoints accept anything, including
// IDs that later break URLs behind a proxy
const JENKINS_CREDENTIAL_ID_REGEX = new RE2("^[A-Za-z0-9_.-]+$");

const isValidJenkinsCredentialId = (id: string) => JENKINS_CREDENTIAL_ID_REGEX.test(id) && id !== "." && id !== "..";

export const getJenkinsCredentialStorePath = (destinationConfig: TJenkinsSyncWithCredentials["destinationConfig"]) => {
  if (destinationConfig.scope === JenkinsSyncScope.Global) return "/credentials/store/system/domain/_";

  const folderPath = destinationConfig.folderPath
    .split("/")
    .map((segment) => `/job/${encodeURIComponent(segment)}`)
    .join("");

  return `${folderPath}/credentials/store/folder/domain/_`;
};

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    // XML parsers normalize a literal carriage return to a newline, so it is sent as a character reference
    .replaceAll("\r", "&#13;");

// Jenkins replaces the whole credential with this body on update, so every field is always sent
export const buildJenkinsSecretTextCredentialXml = (id: string, secret: string) =>
  [
    "<org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl>",
    // Who can use the credential, not which store holds it: SYSTEM would hide it from builds, and folder
    // stores accept only GLOBAL
    "<scope>GLOBAL</scope>",
    `<id>${escapeXml(id)}</id>`,
    `<description>${JENKINS_CREDENTIAL_DESCRIPTION}</description>`,
    `<secret>${escapeXml(secret)}</secret>`,
    "</org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl>"
  ].join("");

const toSyncError = (error: unknown, message: string, secretKey?: string) => {
  // A gateway that is missing or not allowed is a configuration problem a retry will not fix, while a
  // tunnel that could not be opened never reached Jenkins and is left to the queue's retries
  if (error instanceof BadRequestError && !(error instanceof GatewayTransportError)) {
    return new SecretSyncError({ message: error.message, secretKey, shouldRetry: false });
  }

  const status = isAxiosError(error) ? error.response?.status : undefined;

  // Jenkins answers errors with an HTML page, so the readable message is passed instead of the raw error
  return new SecretSyncError({
    message: `${message}: ${getJenkinsErrorMessage(error, "unknown error")}`,
    secretKey,
    shouldRetry: !(status && [401, 403, 404].includes(status))
  });
};

// Resolved once so every request in a run goes through the same pool member
const resolveGatewayConnection = async (
  connection: TJenkinsConnection,
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
): Promise<TJenkinsConnection> => {
  try {
    const gatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
      gatewayId: connection.gatewayId,
      gatewayPoolId: connection.gatewayPoolId
    });

    return { ...connection, gatewayId, gatewayPoolId: null };
  } catch (error) {
    throw toSyncError(error, "Failed to resolve the Jenkins connection's gateway");
  }
};

const listJenkinsCredentials = async (
  connection: TJenkinsConnection,
  storePath: string,
  deps: TJenkinsGatewayDeps
): Promise<TJenkinsCredential[]> => {
  try {
    const credentials = await paginateJenkins<TJenkinsCredential>(
      connection,
      { path: `${storePath}/api/json`, field: "credentials", tree: "credentials[id,typeName]" },
      deps
    );

    // Infisical only writes IDs that pass this check, and an ID goes into the request path, where one
    // such as `..` would retarget an update or delete at the store's domain instead of a credential
    return credentials.filter((credential) => isValidJenkinsCredentialId(credential.id));
  } catch (error) {
    throw toSyncError(error, "Failed to list Jenkins credentials");
  }
};

const writeJenkinsCredential = async (
  connection: TJenkinsConnection,
  storePath: string,
  { key, value, exists }: { key: string; value: string; exists: boolean },
  deps: TJenkinsGatewayDeps
) => {
  try {
    await jenkinsRequest(
      connection,
      {
        method: "POST",
        path: exists
          ? `${storePath}/credential/${encodeURIComponent(key)}/config.xml`
          : `${storePath}/createCredentials`,
        data: buildJenkinsSecretTextCredentialXml(key, value)
      },
      deps
    );
  } catch (error) {
    throw toSyncError(error, `Failed to ${exists ? "update" : "create"} Jenkins credential '${key}'`, key);
  }
};

const deleteJenkinsCredential = async (
  connection: TJenkinsConnection,
  storePath: string,
  key: string,
  deps: TJenkinsGatewayDeps
) => {
  try {
    await jenkinsRequest(
      connection,
      { method: "DELETE", path: `${storePath}/credential/${encodeURIComponent(key)}/config.xml` },
      deps
    );
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) return;

    throw toSyncError(error, `Failed to delete Jenkins credential '${key}'`, key);
  }
};

export const JenkinsSyncFns = {
  async getSecrets(secretSync: TJenkinsSyncWithCredentials): Promise<TSecretMap> {
    throw new Error(`${SECRET_SYNC_NAME_MAP[secretSync.destination]} does not support importing secrets.`);
  },

  async syncSecrets(
    secretSync: TJenkinsSyncWithCredentials,
    payload: TSecretSyncPayload,
    gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
    gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
  ) {
    const secretMap = payload.flatten();
    const {
      environment,
      destinationConfig,
      syncOptions: { disableSecretDeletion, keySchema }
    } = secretSync;

    const invalidKey = Object.keys(secretMap).find((key) => !isValidJenkinsCredentialId(key));
    if (invalidKey !== undefined) {
      throw new SecretSyncError({
        message: `'${invalidKey}' is not a valid Jenkins credential ID. Credential IDs can only contain letters, numbers, underscores (_), hyphens (-) and periods (.), so rename the secret or change the key schema.`,
        secretKey: invalidKey,
        shouldRetry: false
      });
    }

    const connection = await resolveGatewayConnection(secretSync.connection, gatewayPoolService);
    const deps = { gatewayV2Service };
    const storePath = getJenkinsCredentialStorePath(destinationConfig);

    const credentials = await listJenkinsCredentials(connection, storePath, deps);
    const credentialTypes = new Map(credentials.map((credential) => [credential.id, credential.typeName]));

    // Updating by ID replaces a credential of any type, so a clash is refused before anything is written
    const conflictingKey = Object.keys(secretMap).find(
      (key) => credentialTypes.has(key) && credentialTypes.get(key) !== JENKINS_SECRET_TEXT_TYPE_NAME
    );
    if (conflictingKey !== undefined) {
      throw new SecretSyncError({
        message: `A Jenkins credential with ID '${conflictingKey}' already exists as '${credentialTypes.get(conflictingKey) ?? "unknown type"}'. Infisical only manages Secret text credentials, so rename the secret or remove the existing credential in Jenkins.`,
        secretKey: conflictingKey,
        shouldRetry: false
      });
    }

    for (const [key, { value }] of Object.entries(secretMap)) {
      await writeJenkinsCredential(
        connection,
        storePath,
        { key, value: value ?? "", exists: credentialTypes.has(key) },
        deps
      );
    }

    if (disableSecretDeletion) return;

    for (const credential of credentials) {
      if (
        credential.typeName === JENKINS_SECRET_TEXT_TYPE_NAME &&
        matchesSchema(credential.id, environment?.slug || "", keySchema) &&
        !Object.hasOwn(secretMap, credential.id)
      ) {
        await deleteJenkinsCredential(connection, storePath, credential.id, deps);
      }
    }
  },

  async removeSecrets(
    secretSync: TJenkinsSyncWithCredentials,
    payload: TSecretSyncPayload,
    gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
    gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
  ) {
    const secretMap = payload.flatten();
    const connection = await resolveGatewayConnection(secretSync.connection, gatewayPoolService);
    const deps = { gatewayV2Service };
    const storePath = getJenkinsCredentialStorePath(secretSync.destinationConfig);

    const credentials = await listJenkinsCredentials(connection, storePath, deps);

    for (const credential of credentials) {
      if (credential.typeName === JENKINS_SECRET_TEXT_TYPE_NAME && Object.hasOwn(secretMap, credential.id)) {
        await deleteJenkinsCredential(connection, storePath, credential.id, deps);
      }
    }
  }
};
