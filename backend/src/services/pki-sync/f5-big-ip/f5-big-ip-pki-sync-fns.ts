/* eslint-disable no-await-in-loop */
import { AxiosError, AxiosRequestConfig } from "axios";
import RE2 from "re2";

import { TCertificateSyncs } from "@app/db/schemas";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { logger } from "@app/lib/logger";
import {
  executeF5BigIpOperationWithGateway,
  F5_BIG_IP_DEFAULT_PORT,
  F5_BIG_IP_LOGIN_PROVIDER
} from "@app/services/app-connection/f5-big-ip/f5-big-ip-connection-fns";
import { TF5BigIpConnection } from "@app/services/app-connection/f5-big-ip/f5-big-ip-connection-types";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSyncDALFactory } from "@app/services/certificate-sync/certificate-sync-dal";
import { CertificateSyncStatus } from "@app/services/certificate-sync/certificate-sync-enums";
import { TCertificateMap } from "@app/services/pki-sync/pki-sync-types";

import {
  buildManagedCertificateNameRegexSource,
  certificateNameSchemaHasFreeTextPlaceholder,
  compileCertificateNameSchema,
  SHORT_UUID_NAME_REGEX_FRAGMENT,
  UUID_NAME_REGEX_FRAGMENT
} from "../pki-sync-certificate-name-fns";
import { PkiSync } from "../pki-sync-enums";
import { PkiSyncError } from "../pki-sync-errors";
import { TPkiSyncWithCredentials } from "../pki-sync-types";
import { F5_BIG_IP_DEFAULT_PARTITION, F5BigIpProfileType } from "./f5-big-ip-pki-sync-constants";
import { TF5BigIpPkiSyncConfig } from "./f5-big-ip-pki-sync-types";

type TF5BigIpCredentials = TF5BigIpConnection["credentials"];

type TRequestFn = <R>(requestCfg: AxiosRequestConfig) => Promise<R>;

type TF5BigIpSession = {
  baseUrl: string;
  authToken: string;
  headers: Record<string, string>;
  makeRequest: TRequestFn;
};

type TF5BigIpPkiSyncFactoryDeps = {
  certificateSyncDAL: Pick<
    TCertificateSyncDALFactory,
    | "removeCertificates"
    | "addCertificates"
    | "findByPkiSyncAndCertificate"
    | "updateById"
    | "findByPkiSyncId"
    | "updateSyncStatus"
    | "findExternalIdentifiersInUse"
  >;
  certificateDAL: Pick<TCertificateDALFactory, "findById">;
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

/**
 * A Client SSL profile entry. The fields below are the ones F5 documents on the
 * `cert-key-chain` array of `ltm profile client-ssl`. Note: `crl` is NOT a valid
 * per-entry property; F5's CRL config lives on the profile itself (`crlFile`).
 */
type TCertKeyChainEntry = {
  name?: string;
  cert?: string;
  key?: string;
  chain?: string;
  serverName?: string;
  passphrase?: string;
  ocsp?: string;
};

const PRESERVED_CERT_KEY_CHAIN_FIELDS = ["serverName", "ocsp"] as const;

type TServerSslProfileBinding = {
  cert?: string;
  key?: string;
  chain?: string;
};

const F5_DEFAULT_CLIENT_SSL_PARENT = "/Common/clientssl";
const F5_DEFAULT_SERVER_SSL_PARENT = "/Common/serverssl";

const F5_BIG_IP_DEFAULT_CERT_NAME_PREFIX = "Infisical-";
const F5_BIG_IP_CHAIN_SUFFIX = "-chain";

const certFileName = (name: string) => `${name}.crt`;
const keyFileName = (name: string) => `${name}.key`;

const chainObjectName = (certName: string) => `${certName}${F5_BIG_IP_CHAIN_SUFFIX}`;

const buildPartitionedPath = (partition: string, name: string) => `/${partition}/${name}`;

const buildEncodedObjectId = (partition: string, name: string) => encodeURIComponent(`~${partition}~${name}`);

export const buildManagedCertNamePattern = (certificateNameSchema: string | undefined): RE2 => {
  if (!certificateNameSchema) {
    return new RE2(`^${F5_BIG_IP_DEFAULT_CERT_NAME_PREFIX}[0-9a-f]{32}(-[a-zA-Z0-9]*)?$`);
  }

  // {{certificateId}}, {{profileId}}, and {{applicationId}} resolve to 32-char dash-stripped UUIDs;
  // {{shortCertificateId}} resolves to a 22-char base62 string.
  // {{commonName}} and {{applicationName}} are arbitrary, so match any run of BIG-IP-safe characters.
  const pattern = buildManagedCertificateNameRegexSource(certificateNameSchema, {
    uuid: UUID_NAME_REGEX_FRAGMENT,
    shortUuid: SHORT_UUID_NAME_REGEX_FRAGMENT,
    freeText: "[a-zA-Z0-9._-]*"
  });

  return new RE2(`^${pattern}$`);
};

const resolveParentProfile = (profileType: F5BigIpProfileType, parentProfile?: string): string => {
  if (parentProfile) {
    return parentProfile.startsWith("/") ? parentProfile : `/Common/${parentProfile}`;
  }
  return profileType === F5BigIpProfileType.ServerSsl ? F5_DEFAULT_SERVER_SSL_PARENT : F5_DEFAULT_CLIENT_SSL_PARENT;
};

const getF5BigIpCredentials = (pkiSync: TPkiSyncWithCredentials): TF5BigIpCredentials => {
  const credentials = pkiSync.connection.credentials as TF5BigIpCredentials;
  if (!credentials?.hostname || !credentials?.username || !credentials?.password) {
    throw new PkiSyncError({
      message: "F5 BIG-IP credentials (hostname, username, password) not found in connection credentials"
    });
  }
  return credentials;
};

const F5_BIG_IP_MAX_TOKEN_TIMEOUT_SECONDS = 36000;

const createF5BigIpSession = async (
  credentials: TF5BigIpCredentials,
  makeRequest: TRequestFn
): Promise<TF5BigIpSession> => {
  const { hostname, port, username, password } = credentials;

  const baseUrl = `https://${hostname}:${port ?? F5_BIG_IP_DEFAULT_PORT}`;

  const loginData = await makeRequest<{ token?: { token?: string } }>({
    method: "POST",
    url: `${baseUrl}/mgmt/shared/authn/login`,
    data: {
      username,
      password,
      loginProviderName: F5_BIG_IP_LOGIN_PROVIDER
    },
    headers: { "Content-Type": "application/json" }
  });

  const authToken = loginData?.token?.token;
  if (!authToken) {
    throw new PkiSyncError({
      message: "Failed to login to F5 BIG-IP: no auth token returned",
      shouldRetry: true
    });
  }

  const sessionHeaders = {
    "Content-Type": "application/json",
    "X-F5-Auth-Token": authToken
  };

  try {
    await makeRequest({
      method: "PATCH",
      url: `${baseUrl}/mgmt/shared/authz/tokens/${encodeURIComponent(authToken)}`,
      data: { timeout: F5_BIG_IP_MAX_TOKEN_TIMEOUT_SECONDS },
      headers: sessionHeaders
    });
  } catch (error: unknown) {
    logger.warn(
      { error },
      `F5 BIG-IP session: unable to extend auth token TTL for ${hostname} — falling back to default lifetime`
    );
  }

  return {
    baseUrl,
    authToken,
    headers: sessionHeaders,
    makeRequest
  };
};

const logoutF5BigIpSession = async (session: TF5BigIpSession): Promise<void> => {
  try {
    await session.makeRequest({
      method: "DELETE",
      url: `${session.baseUrl}/mgmt/shared/authz/tokens/${encodeURIComponent(session.authToken)}`,
      headers: session.headers
    });
  } catch {
    // Ignore logout errors
  }
};

const saveF5BigIpConfig = async (session: TF5BigIpSession): Promise<void> => {
  await session.makeRequest({
    method: "POST",
    url: `${session.baseUrl}/mgmt/tm/sys/config`,
    data: { command: "save" },
    headers: session.headers
  });
};

const F5_BIG_IP_UPLOAD_CHUNK_SIZE_BYTES = 512 * 1024;

const F5_BIG_IP_UPLOAD_DIR = "/var/config/rest/downloads";

const cleanupUploadedSourceFile = async (session: TF5BigIpSession, filename: string): Promise<void> => {
  try {
    await session.makeRequest({
      method: "POST",
      url: `${session.baseUrl}/mgmt/tm/util/unix-rm`,
      data: {
        command: "run",
        // `-f` so a missing file is not an error.
        utilCmdArgs: `-f ${F5_BIG_IP_UPLOAD_DIR}/${filename}`
      },
      headers: session.headers
    });
  } catch (error: unknown) {
    logger.warn(
      { error },
      `F5 BIG-IP: best-effort source-file cleanup failed for "${filename}" — likely insufficient role (Certificate Manager doesn't grant unix-rm); safe to ignore`
    );
  }
};

const uploadFileToF5BigIp = async (session: TF5BigIpSession, filename: string, fileContent: string): Promise<void> => {
  const buffer = Buffer.from(fileContent, "utf-8");
  const size = buffer.length;

  if (size === 0) {
    throw new PkiSyncError({
      message: `Failed to upload "${filename}" to F5 BIG-IP: file is empty`
    });
  }

  const uploadUrl = `${session.baseUrl}/mgmt/shared/file-transfer/uploads/${encodeURIComponent(filename)}`;

  let start = 0;
  while (start < size) {
    const end = Math.min(start + F5_BIG_IP_UPLOAD_CHUNK_SIZE_BYTES, size);
    const chunk = buffer.subarray(start, end);

    await session.makeRequest({
      method: "POST",
      url: uploadUrl,
      data: chunk,
      headers: {
        ...session.headers,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(chunk.length),
        "Content-Range": `${start}-${end - 1}/${size}`
      }
    });

    start = end;
  }
};

const installSslCertObject = async (
  session: TF5BigIpSession,
  partition: string,
  name: string,
  uploadedFilename: string
): Promise<void> => {
  const sourcePath = `file:/var/config/rest/downloads/${uploadedFilename}`;
  const objectId = buildEncodedObjectId(partition, name);

  try {
    // Try to update an existing ssl-cert object first
    await session.makeRequest({
      method: "PATCH",
      url: `${session.baseUrl}/mgmt/tm/sys/file/ssl-cert/${objectId}`,
      data: { sourcePath },
      headers: session.headers
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      await session.makeRequest({
        method: "POST",
        url: `${session.baseUrl}/mgmt/tm/sys/file/ssl-cert`,
        data: { name, partition, sourcePath },
        headers: session.headers
      });
      return;
    }
    throw error;
  }
};

const installSslKeyObject = async (
  session: TF5BigIpSession,
  partition: string,
  name: string,
  uploadedFilename: string
): Promise<void> => {
  const sourcePath = `file:/var/config/rest/downloads/${uploadedFilename}`;
  const objectId = buildEncodedObjectId(partition, name);

  try {
    await session.makeRequest({
      method: "PATCH",
      url: `${session.baseUrl}/mgmt/tm/sys/file/ssl-key/${objectId}`,
      data: { sourcePath },
      headers: session.headers
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      await session.makeRequest({
        method: "POST",
        url: `${session.baseUrl}/mgmt/tm/sys/file/ssl-key`,
        data: { name, partition, sourcePath },
        headers: session.headers
      });
      return;
    }
    throw error;
  }
};

const deleteSslCertObject = async (session: TF5BigIpSession, partition: string, name: string): Promise<void> => {
  try {
    await session.makeRequest({
      method: "DELETE",
      url: `${session.baseUrl}/mgmt/tm/sys/file/ssl-cert/${buildEncodedObjectId(partition, name)}`,
      headers: session.headers
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      return;
    }
    throw error;
  }
};

const deleteSslKeyObject = async (session: TF5BigIpSession, partition: string, name: string): Promise<void> => {
  try {
    await session.makeRequest({
      method: "DELETE",
      url: `${session.baseUrl}/mgmt/tm/sys/file/ssl-key/${buildEncodedObjectId(partition, name)}`,
      headers: session.headers
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      return;
    }
    throw error;
  }
};

const listSslCertNamesByPartition = async (session: TF5BigIpSession, partition: string): Promise<Set<string>> => {
  const certNames = new Set<string>();

  try {
    const data = await session.makeRequest<{
      items?: Array<{ name: string; partition: string }>;
    }>({
      method: "GET",
      url: `${session.baseUrl}/mgmt/tm/sys/file/ssl-cert?$select=name,partition`,
      headers: session.headers
    });

    if (data?.items) {
      for (const item of data.items) {
        if (item.partition === partition) {
          certNames.add(item.name);
        }
      }
    }
  } catch (error: unknown) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      return certNames;
    }
    throw error;
  }

  return certNames;
};

const CLIENT_SSL_PROFILE_ENDPOINT = "/mgmt/tm/ltm/profile/client-ssl";
const SERVER_SSL_PROFILE_ENDPOINT = "/mgmt/tm/ltm/profile/server-ssl";

const F5_NONE_REFERENCE = "none";

const bindCertToClientSslProfile = async (
  session: TF5BigIpSession,
  partition: string,
  profileName: string,
  certName: string,
  keyName: string,
  chainName: string | null,
  options: { createIfMissing?: boolean; parentProfile?: string } = {}
): Promise<void> => {
  const profileObjectId = buildEncodedObjectId(partition, profileName);
  const certPath = buildPartitionedPath(partition, certName);
  const keyPath = buildPartitionedPath(partition, keyName);
  const chainPath = chainName ? buildPartitionedPath(partition, chainName) : null;

  let existingChain: TCertKeyChainEntry[] = [];
  let profileExists = true;
  try {
    const profile = await session.makeRequest<{ certKeyChain?: TCertKeyChainEntry[] }>({
      method: "GET",
      url: `${session.baseUrl}${CLIENT_SSL_PROFILE_ENDPOINT}/${profileObjectId}`,
      headers: session.headers
    });
    if (profile?.certKeyChain && Array.isArray(profile.certKeyChain)) {
      existingChain = profile.certKeyChain;
    }
  } catch (error: unknown) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      profileExists = false;
    } else {
      throw error;
    }
  }

  const existingEntry = existingChain.find((entry) => entry.name === certName || entry.cert === certPath);

  const preservedFields: Partial<TCertKeyChainEntry> = {};
  if (existingEntry) {
    for (const field of PRESERVED_CERT_KEY_CHAIN_FIELDS) {
      if (existingEntry[field] !== undefined) {
        preservedFields[field] = existingEntry[field];
      }
    }
  }

  const updatedEntry: TCertKeyChainEntry = {
    ...preservedFields,
    name: certName,
    cert: certPath,
    key: keyPath,
    chain: chainPath ?? undefined
  };

  if (!profileExists) {
    if (!options.createIfMissing) {
      throw new PkiSyncError({
        message: `F5 BIG-IP profile "${profileName}" not found in partition "${partition}". Enable "Create profile if missing" or create the profile before binding a certificate.`,
        shouldRetry: false
      });
    }

    await session.makeRequest({
      method: "POST",
      url: `${session.baseUrl}${CLIENT_SSL_PROFILE_ENDPOINT}`,
      data: {
        name: profileName,
        partition,
        defaultsFrom: resolveParentProfile(F5BigIpProfileType.ClientSsl, options.parentProfile),
        inheritCertkeychain: false,
        certKeyChain: [updatedEntry]
      },
      headers: session.headers
    });
    return;
  }

  const otherEntries = existingChain.filter(
    (entry) => entry !== existingEntry && entry.name !== certName && entry.cert !== certPath
  );
  const certKeyChain = [updatedEntry, ...otherEntries];

  await session.makeRequest({
    method: "PATCH",
    url: `${session.baseUrl}${CLIENT_SSL_PROFILE_ENDPOINT}/${profileObjectId}`,
    data: { certKeyChain },
    headers: session.headers
  });
};

const bindCertToServerSslProfile = async (
  session: TF5BigIpSession,
  partition: string,
  profileName: string,
  certName: string,
  keyName: string,
  chainName: string | null,
  options: { createIfMissing?: boolean; parentProfile?: string } = {}
): Promise<void> => {
  const profileObjectId = buildEncodedObjectId(partition, profileName);
  const certPath = buildPartitionedPath(partition, certName);
  const keyPath = buildPartitionedPath(partition, keyName);
  const chainPath = chainName ? buildPartitionedPath(partition, chainName) : null;

  const bindingFields = {
    cert: certPath,
    key: keyPath,
    chain: chainPath ?? F5_NONE_REFERENCE
  };

  let profileExists = true;
  try {
    await session.makeRequest({
      method: "GET",
      url: `${session.baseUrl}${SERVER_SSL_PROFILE_ENDPOINT}/${profileObjectId}`,
      headers: session.headers
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      profileExists = false;
    } else {
      throw error;
    }
  }

  if (!profileExists) {
    if (!options.createIfMissing) {
      throw new PkiSyncError({
        message: `F5 BIG-IP profile "${profileName}" not found in partition "${partition}". Enable "Create profile if missing" or create the profile before binding a certificate.`,
        shouldRetry: false
      });
    }

    await session.makeRequest({
      method: "POST",
      url: `${session.baseUrl}${SERVER_SSL_PROFILE_ENDPOINT}`,
      data: {
        name: profileName,
        partition,
        defaultsFrom: resolveParentProfile(F5BigIpProfileType.ServerSsl, options.parentProfile),
        ...bindingFields
      },
      headers: session.headers
    });
    return;
  }

  await session.makeRequest({
    method: "PATCH",
    url: `${session.baseUrl}${SERVER_SSL_PROFILE_ENDPOINT}/${profileObjectId}`,
    data: bindingFields,
    headers: session.headers
  });
};

const bindCertToProfile = async (
  session: TF5BigIpSession,
  partition: string,
  profileType: F5BigIpProfileType,
  profileName: string,
  certName: string,
  keyName: string,
  chainName: string | null,
  options: { createIfMissing?: boolean; parentProfile?: string } = {}
): Promise<void> => {
  if (profileType === F5BigIpProfileType.ClientSsl) {
    await bindCertToClientSslProfile(session, partition, profileName, certName, keyName, chainName, options);
    return;
  }
  if (profileType === F5BigIpProfileType.ServerSsl) {
    await bindCertToServerSslProfile(session, partition, profileName, certName, keyName, chainName, options);
  }
};

const unbindFromClientSslProfile = async (
  session: TF5BigIpSession,
  partition: string,
  profileName: string,
  certPaths: string[]
): Promise<void> => {
  const profileObjectId = buildEncodedObjectId(partition, profileName);
  const pathSet = new Set(certPaths);

  let existingChain: TCertKeyChainEntry[] = [];
  try {
    const profile = await session.makeRequest<{ certKeyChain?: TCertKeyChainEntry[] }>({
      method: "GET",
      url: `${session.baseUrl}${CLIENT_SSL_PROFILE_ENDPOINT}/${profileObjectId}`,
      headers: session.headers
    });
    if (profile?.certKeyChain && Array.isArray(profile.certKeyChain)) {
      existingChain = profile.certKeyChain;
    }
  } catch (error: unknown) {
    if (error instanceof AxiosError && error.response?.status === 404) {
      return;
    }
    throw error;
  }

  const remainingEntries = existingChain.filter(
    (entry) =>
      (entry.cert === undefined || !pathSet.has(entry.cert)) && (entry.chain === undefined || !pathSet.has(entry.chain))
  );

  if (remainingEntries.length === existingChain.length) {
    return;
  }

  await session.makeRequest({
    method: "PATCH",
    url: `${session.baseUrl}${CLIENT_SSL_PROFILE_ENDPOINT}/${profileObjectId}`,
    data: { certKeyChain: remainingEntries },
    headers: session.headers
  });
};

const unbindFromServerSslProfile = async (
  session: TF5BigIpSession,
  partition: string,
  profileName: string
): Promise<void> => {
  await session.makeRequest({
    method: "PATCH",
    url: `${session.baseUrl}${SERVER_SSL_PROFILE_ENDPOINT}/${buildEncodedObjectId(partition, profileName)}`,
    data: { cert: F5_NONE_REFERENCE, key: F5_NONE_REFERENCE, chain: F5_NONE_REFERENCE },
    headers: session.headers
  });
};

const unbindCertPathsFromAllProfiles = async (
  session: TF5BigIpSession,
  partition: string,
  certPaths: string[]
): Promise<void> => {
  if (certPaths.length === 0) return;
  const pathSet = new Set(certPaths);

  try {
    const data = await session.makeRequest<{
      items?: Array<{ name: string; partition: string; certKeyChain?: TCertKeyChainEntry[] }>;
    }>({
      method: "GET",
      url: `${session.baseUrl}${CLIENT_SSL_PROFILE_ENDPOINT}?$select=name,partition,certKeyChain`,
      headers: session.headers
    });

    if (data?.items) {
      for (const profile of data.items) {
        if (profile.partition === partition) {
          const refsCert = profile.certKeyChain?.some(
            (entry) =>
              (entry.cert !== undefined && pathSet.has(entry.cert)) ||
              (entry.chain !== undefined && pathSet.has(entry.chain))
          );
          if (refsCert) {
            await unbindFromClientSslProfile(session, partition, profile.name, certPaths);
          }
        }
      }
    }
  } catch (error: unknown) {
    logger.warn(
      { error },
      `F5 BIG-IP PKI sync: unable to enumerate Client SSL profiles in partition "${partition}" while preparing to unbind certificates`
    );
  }

  try {
    const data = await session.makeRequest<{
      items?: Array<{ name: string; partition: string } & TServerSslProfileBinding>;
    }>({
      method: "GET",
      url: `${session.baseUrl}${SERVER_SSL_PROFILE_ENDPOINT}?$select=name,partition,cert,key,chain`,
      headers: session.headers
    });

    if (data?.items) {
      for (const profile of data.items) {
        if (profile.partition === partition) {
          const refsCert =
            (profile.cert !== undefined && pathSet.has(profile.cert)) ||
            (profile.chain !== undefined && pathSet.has(profile.chain));
          if (refsCert) {
            await unbindFromServerSslProfile(session, partition, profile.name);
          }
        }
      }
    }
  } catch (error: unknown) {
    logger.warn(
      { error },
      `F5 BIG-IP PKI sync: unable to enumerate Server SSL profiles in partition "${partition}" while preparing to unbind certificates`
    );
  }
};

const removeF5BigIpCertificate = async (
  session: TF5BigIpSession,
  certKeyName: string,
  config: TF5BigIpPkiSyncConfig,
  options: { hadChain?: boolean } = {}
): Promise<void> => {
  const partition = config.partition ?? F5_BIG_IP_DEFAULT_PARTITION;
  const certPath = buildPartitionedPath(partition, certKeyName);
  const chainName = options.hadChain ? chainObjectName(certKeyName) : null;
  const chainPath = chainName ? buildPartitionedPath(partition, chainName) : null;

  const pathsToUnbind = chainPath ? [certPath, chainPath] : [certPath];
  await unbindCertPathsFromAllProfiles(session, partition, pathsToUnbind);

  await deleteSslKeyObject(session, partition, certKeyName);
  await deleteSslCertObject(session, partition, certKeyName);

  if (chainName) {
    await deleteSslCertObject(session, partition, chainName);
  }
};

export const f5BigIpPkiSyncFactory = ({
  certificateSyncDAL,
  certificateDAL,
  gatewayV2Service,
  gatewayPoolService
}: TF5BigIpPkiSyncFactoryDeps) => {
  const resolveGateway = async (pkiSync: TPkiSyncWithCredentials) => {
    return gatewayPoolService
      ? gatewayPoolService.resolveEffectiveGatewayId({
          gatewayId: pkiSync.connection.gatewayId,
          gatewayPoolId: pkiSync.connection.gatewayPoolId
        })
      : (pkiSync.connection.gatewayId ?? null);
  };

  const syncCertificates = async (
    pkiSync: TPkiSyncWithCredentials,
    certificateMap: TCertificateMap
  ): Promise<{
    uploaded: number;
    removed?: number;
    failedRemovals?: number;
    skipped: number;
    details?: {
      failedUploads?: Array<{ name: string; error: string }>;
      failedRemovals?: Array<{ name: string; error: string }>;
      skippedCertificates?: Array<{ name: string; reason: string }>;
    };
  }> => {
    const credentials = getF5BigIpCredentials(pkiSync);
    const config = pkiSync.destinationConfig as TF5BigIpPkiSyncConfig;
    const partition = config.partition ?? F5_BIG_IP_DEFAULT_PARTITION;
    const profileType = config.profileType ?? F5BigIpProfileType.None;
    const { profileName } = config;
    const syncOptions = pkiSync.syncOptions as
      | { certificateNameSchema?: string; canRemoveCertificates?: boolean; preserveItemOnRenewal?: boolean }
      | undefined;
    const canRemoveCertificates = syncOptions?.canRemoveCertificates ?? true;
    const preserveItemOnRenewal = syncOptions?.preserveItemOnRenewal ?? true;
    const certificateNameSchema = syncOptions?.certificateNameSchema;

    const effectiveGatewayId = await resolveGateway(pkiSync);

    return executeF5BigIpOperationWithGateway(
      { gatewayId: effectiveGatewayId, credentials },
      gatewayV2Service,
      async (makeRequest) => {
        let uploaded = 0;
        let removed = 0;
        const failedUploads: Array<{ name: string; error: string }> = [];
        const failedRemovals: Array<{ name: string; error: string }> = [];
        const skippedCertificates: Array<{ name: string; reason: string }> = [];

        const session = await createF5BigIpSession(credentials, makeRequest);

        try {
          const existingCertNames = await listSslCertNamesByPartition(session, partition);

          const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
          const syncRecordsByCertId = new Map<string, TCertificateSyncs>();
          existingSyncRecords.forEach((record: TCertificateSyncs) => {
            if (record.certificateId) {
              syncRecordsByCertId.set(record.certificateId, record);
            }
          });

          const activeExternalIdentifiers = new Set<string>();

          if (!preserveItemOnRenewal) {
            for (const syncRecord of existingSyncRecords) {
              if (syncRecord.certificateId && syncRecord.externalIdentifier) {
                const cert = await certificateDAL.findById(syncRecord.certificateId);
                if (cert?.renewedByCertificateId && existingCertNames.has(syncRecord.externalIdentifier)) {
                  activeExternalIdentifiers.add(syncRecord.externalIdentifier);
                }
              }
            }
          }

          const certificatesToUpload: Array<{
            targetName: string;
            cert: string;
            privateKey: string;
            certificateChain?: string;
            certificateId?: string;
            isUpdate: boolean;
            oldCertificateIdToRemove?: string;
          }> = [];

          for (const [certName, certData] of Object.entries(certificateMap)) {
            const { cert, privateKey, certificateChain, certificateId } = certData;

            if (!cert || !privateKey) {
              skippedCertificates.push({
                name: certName,
                reason: "Missing certificate or private key data"
              });
              // eslint-disable-next-line no-continue
              continue;
            }

            let certificate: Awaited<ReturnType<typeof certificateDAL.findById>> | undefined;
            if (typeof certificateId === "string") {
              certificate = await certificateDAL.findById(certificateId);
              if (certificate?.renewedByCertificateId) {
                skippedCertificates.push({
                  name: certName,
                  reason: "Certificate has been renewed and replaced by a newer certificate"
                });
                // eslint-disable-next-line no-continue
                continue;
              }
            }

            let targetName = certName;
            let isUpdate = false;
            let oldCertificateIdToRemove: string | undefined;

            if (typeof certificateId === "string") {
              const syncRecordLookupId = certificate?.renewedFromCertificateId || certificateId;
              const existingSyncRecord = syncRecordsByCertId.get(syncRecordLookupId);

              if (
                certificate?.renewedFromCertificateId &&
                preserveItemOnRenewal &&
                existingSyncRecord?.externalIdentifier
              ) {
                targetName = existingSyncRecord.externalIdentifier;
                isUpdate = true;
                oldCertificateIdToRemove = certificate.renewedFromCertificateId;
                activeExternalIdentifiers.add(targetName);
              } else if (certificate?.renewedFromCertificateId && !preserveItemOnRenewal) {
                const certIdClean = certificateId.replace(new RE2("-", "g"), "");
                if (certificateNameSchema) {
                  targetName = compileCertificateNameSchema(
                    certificateNameSchema,
                    {
                      certificateId,
                      profileId: certData.profileId,
                      applicationId: pkiSync.applicationId,
                      applicationName: pkiSync.applicationName,
                      commonName: certData.commonName
                    },
                    PkiSync.F5BigIp
                  );
                } else {
                  targetName = `${F5_BIG_IP_DEFAULT_CERT_NAME_PREFIX}${certIdClean}`;
                }

                if (existingSyncRecord?.externalIdentifier) {
                  activeExternalIdentifiers.add(existingSyncRecord.externalIdentifier);
                }
              } else {
                const directSyncRecord = syncRecordsByCertId.get(certificateId);
                if (
                  directSyncRecord?.externalIdentifier &&
                  existingCertNames.has(directSyncRecord.externalIdentifier)
                ) {
                  targetName = directSyncRecord.externalIdentifier;
                  activeExternalIdentifiers.add(targetName);
                  isUpdate = true;
                }
              }
            }

            certificatesToUpload.push({
              targetName,
              cert,
              privateKey,
              certificateChain,
              certificateId,
              isUpdate,
              oldCertificateIdToRemove
            });
          }

          for (const {
            targetName,
            cert,
            privateKey,
            certificateChain,
            certificateId,
            isUpdate,
            oldCertificateIdToRemove
          } of certificatesToUpload) {
            try {
              const chainName = certificateChain ? chainObjectName(targetName) : null;

              await uploadFileToF5BigIp(session, certFileName(targetName), cert);
              await uploadFileToF5BigIp(session, keyFileName(targetName), privateKey);
              if (certificateChain && chainName) {
                await uploadFileToF5BigIp(session, certFileName(chainName), certificateChain);
              }

              await installSslCertObject(session, partition, targetName, certFileName(targetName));
              await installSslKeyObject(session, partition, targetName, keyFileName(targetName));
              if (certificateChain && chainName) {
                await installSslCertObject(session, partition, chainName, certFileName(chainName));
              }

              await cleanupUploadedSourceFile(session, certFileName(targetName));
              await cleanupUploadedSourceFile(session, keyFileName(targetName));
              if (certificateChain && chainName) {
                await cleanupUploadedSourceFile(session, certFileName(chainName));
              }

              if (profileType !== F5BigIpProfileType.None && profileName) {
                await bindCertToProfile(
                  session,
                  partition,
                  profileType,
                  profileName,
                  targetName,
                  targetName,
                  chainName,
                  {
                    createIfMissing: config.createProfileIfMissing,
                    parentProfile: config.parentProfile
                  }
                );
              }

              activeExternalIdentifiers.add(targetName);

              if (certificateId) {
                const existingCertSync = await certificateSyncDAL.findByPkiSyncAndCertificate(
                  pkiSync.id,
                  certificateId
                );

                if (existingCertSync) {
                  await certificateSyncDAL.updateById(existingCertSync.id, {
                    externalIdentifier: targetName,
                    syncStatus: CertificateSyncStatus.Succeeded,
                    lastSyncMessage: isUpdate
                      ? `Updated certificate on F5 BIG-IP as "${targetName}" in partition "${partition}"`
                      : `Synced certificate to F5 BIG-IP as "${targetName}" in partition "${partition}"`,
                    lastSyncedAt: new Date()
                  });
                } else {
                  await certificateSyncDAL.addCertificates(pkiSync.id, [
                    {
                      certificateId,
                      externalIdentifier: targetName
                    }
                  ]);
                }

                if (oldCertificateIdToRemove) {
                  await certificateSyncDAL.removeCertificates(pkiSync.id, [oldCertificateIdToRemove]);
                }
              }

              uploaded += 1;

              logger.info(
                `F5 BIG-IP PKI sync [syncId=${pkiSync.id}]: ${isUpdate ? "updated" : "uploaded"} certificate "${targetName}" on ${credentials.hostname}`
              );
            } catch (error: unknown) {
              let errorMessage = "Unknown error";
              if (error instanceof AxiosError) {
                errorMessage = String((error.response?.data as { message?: string })?.message || error.message);
              } else if (error instanceof Error) {
                errorMessage = error.message;
              }

              failedUploads.push({ name: targetName, error: errorMessage });

              if (certificateId) {
                const syncRecord = await certificateSyncDAL.findByPkiSyncAndCertificate(pkiSync.id, certificateId);

                if (syncRecord) {
                  await certificateSyncDAL.updateById(syncRecord.id, {
                    syncStatus: CertificateSyncStatus.Failed,
                    lastSyncMessage: `Failed to sync to F5 BIG-IP: ${String(errorMessage)}`.slice(0, 4096)
                  });
                }
              }

              logger.error(
                { error },
                `F5 BIG-IP PKI sync [syncId=${pkiSync.id}]: failed to upload certificate "${targetName}"`
              );
            }
          }

          if (canRemoveCertificates) {
            const certNamesToRemove = new Set<string>();

            for (const syncRecord of existingSyncRecords) {
              if (
                syncRecord.externalIdentifier &&
                !activeExternalIdentifiers.has(syncRecord.externalIdentifier) &&
                existingCertNames.has(syncRecord.externalIdentifier)
              ) {
                certNamesToRemove.add(syncRecord.externalIdentifier);
              }
            }

            const partitionCandidates: string[] = [];
            if (!certificateNameSchemaHasFreeTextPlaceholder(certificateNameSchema)) {
              const managedCertNamePattern = buildManagedCertNamePattern(certificateNameSchema);
              for (const certName of existingCertNames) {
                if (
                  managedCertNamePattern.test(certName) &&
                  !activeExternalIdentifiers.has(certName) &&
                  !certNamesToRemove.has(certName) &&
                  !certName.endsWith(F5_BIG_IP_CHAIN_SUFFIX)
                ) {
                  partitionCandidates.push(certName);
                }
              }
            }

            if (partitionCandidates.length > 0) {
              const ownedByOtherSync = await certificateSyncDAL.findExternalIdentifiersInUse(
                partitionCandidates,
                pkiSync.id
              );
              for (const certName of partitionCandidates) {
                if (!ownedByOtherSync.has(certName)) {
                  certNamesToRemove.add(certName);
                }
              }
            }

            for (const certName of certNamesToRemove) {
              try {
                const hadChain = existingCertNames.has(chainObjectName(certName));
                await removeF5BigIpCertificate(session, certName, config, { hadChain });

                removed += 1;

                logger.info(
                  `F5 BIG-IP PKI sync [syncId=${pkiSync.id}]: removed orphaned certificate "${certName}" from ${credentials.hostname}`
                );
              } catch (error: unknown) {
                let errorMessage = "Unknown error";
                if (error instanceof AxiosError) {
                  errorMessage = String((error.response?.data as { message?: string })?.message || error.message);
                } else if (error instanceof Error) {
                  errorMessage = error.message;
                }
                failedRemovals.push({ name: certName, error: errorMessage });

                logger.error(
                  { error },
                  `F5 BIG-IP PKI sync [syncId=${pkiSync.id}]: failed to remove certificate "${certName}" — ${errorMessage}`
                );
              }
            }
          }

          await saveF5BigIpConfig(session);
        } finally {
          await logoutF5BigIpSession(session);
        }

        return {
          uploaded,
          removed: removed > 0 ? removed : undefined,
          failedRemovals: failedRemovals.length > 0 ? failedRemovals.length : undefined,
          skipped: skippedCertificates.length,
          details: {
            failedUploads: failedUploads.length > 0 ? failedUploads : undefined,
            failedRemovals: failedRemovals.length > 0 ? failedRemovals : undefined,
            skippedCertificates: skippedCertificates.length > 0 ? skippedCertificates : undefined
          }
        };
      }
    );
  };

  const removeCertificates = async (
    pkiSync: TPkiSyncWithCredentials,
    certificateNames: string[],
    deps?: {
      certificateSyncDAL?: Pick<TCertificateSyncDALFactory, "findByPkiSyncId">;
      certificateMap?: TCertificateMap;
    }
  ): Promise<void> => {
    if (certificateNames.length === 0) return;

    const credentials = getF5BigIpCredentials(pkiSync);
    const config = pkiSync.destinationConfig as TF5BigIpPkiSyncConfig;
    const partition = config.partition ?? F5_BIG_IP_DEFAULT_PARTITION;

    const existingSyncRecords = await certificateSyncDAL.findByPkiSyncId(pkiSync.id);
    const certNamesToRemove: string[] = [];
    const certificateIdsToClean: string[] = [];

    for (const certName of certificateNames) {
      if (deps?.certificateMap?.[certName]?.certificateId) {
        const { certificateId } = deps.certificateMap[certName];

        const syncRecord = existingSyncRecords.find((record) => record.certificateId === certificateId);

        if (syncRecord?.externalIdentifier && typeof certificateId === "string") {
          certNamesToRemove.push(syncRecord.externalIdentifier);
          certificateIdsToClean.push(certificateId);
        }
      }
    }

    if (certNamesToRemove.length === 0) {
      return;
    }

    const effectiveGatewayId = await resolveGateway(pkiSync);

    await executeF5BigIpOperationWithGateway(
      { gatewayId: effectiveGatewayId, credentials },
      gatewayV2Service,
      async (makeRequest) => {
        const session = await createF5BigIpSession(credentials, makeRequest);

        try {
          const existingCertNames = await listSslCertNamesByPartition(session, partition);

          for (const certName of certNamesToRemove) {
            try {
              const hadChain = existingCertNames.has(chainObjectName(certName));
              await removeF5BigIpCertificate(session, certName, config, { hadChain });

              logger.info(
                `F5 BIG-IP PKI sync [syncId=${pkiSync.id}]: removed certificate "${certName}" from ${credentials.hostname}`
              );
            } catch (error: unknown) {
              if (error instanceof AxiosError && error.response?.status === 404) {
                logger.info(
                  `F5 BIG-IP PKI sync [syncId=${pkiSync.id}]: certificate "${certName}" already removed from ${credentials.hostname}`
                );
                // eslint-disable-next-line no-continue
                continue;
              }

              let errorMessage = "Unknown error";
              if (error instanceof AxiosError) {
                errorMessage = String((error.response?.data as { message?: string })?.message || error.message);
              } else if (error instanceof Error) {
                errorMessage = error.message;
              }

              logger.error(
                { error },
                `F5 BIG-IP PKI sync [syncId=${pkiSync.id}]: failed to remove certificate "${certName}" — ${errorMessage}`
              );
              throw new PkiSyncError({
                message: `Failed to remove certificate "${certName}" from F5 BIG-IP: ${errorMessage}`,
                shouldRetry: true
              });
            }
          }

          await saveF5BigIpConfig(session);
        } finally {
          await logoutF5BigIpSession(session);
        }
      }
    );

    if (certificateIdsToClean.length > 0) {
      await certificateSyncDAL.removeCertificates(pkiSync.id, certificateIdsToClean);
    }
  };

  return {
    syncCertificates,
    removeCertificates
  };
};
