import * as x509 from "@peculiar/x509";
import { Knex } from "knex";
import net from "net";
import pLimit from "p-limit";
import { z } from "zod";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2DALFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { delay } from "@app/lib/delay";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, GatewayTransportError, NotFoundError } from "@app/lib/errors";
import { hasPostgresErrorCode } from "@app/lib/errors/postgres";
import { asNonSharedBuffer } from "@app/lib/fn";
import { callCertificateScan, TCertificateScanRequest } from "@app/lib/gateway-v2/certificate-scan-rpc";
import { getMissingGatewayMessage } from "@app/lib/gateway-v2/gateway-errors";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { GatewayFailureKind } from "@app/lib/gateway-v2/test-connection-rpc";
import { GatewayProxyProtocol } from "@app/lib/gateway-v2/types";
import { logger } from "@app/lib/logger";
import {
  releaseAppConnectionConcurrency,
  tryAdmitAppConnectionConcurrency
} from "@app/services/app-connection/app-connection-concurrency-fns";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";
import { toSshExecCredentials } from "@app/services/app-connection/ssh/ssh-connection-fns";
import { TSshConnectionConfig } from "@app/services/app-connection/ssh/ssh-connection-types";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { PKI_SYNC_CONNECTION_LOCK_RETRY } from "@app/services/pki-sync/pki-sync-enums";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";

import { TPkiCertificateInstallationCertDALFactory } from "./pki-certificate-installation-cert-dal";
import { TPkiCertificateInstallationDALFactory } from "./pki-certificate-installation-dal";
import { TPkiDiscoveryConfigDALFactory } from "./pki-discovery-config-dal";
import { computeLocationFingerprint, parseCertificateDer } from "./pki-discovery-fns";
import {
  buildHostInstallationName,
  CertificateScanResponseSchema,
  describeCertificateScanFailure,
  hostConnectionWithoutGatewayMessage,
  normalizeHostIdentifier,
  planHostFileImport,
  summarizeHostScanIssues,
  TCertificateScanFile,
  TCertificateScanResponse
} from "./pki-discovery-host-fns";
import { TPkiDiscoveryInstallationDALFactory } from "./pki-discovery-installation-dal";
import { processDiscoveredCertificate, TKmsEncryptor } from "./pki-discovery-scan-fns";
import { TPkiDiscoveryScanHistoryDALFactory } from "./pki-discovery-scan-history-dal";
import {
  discardScanRunIfDeleted,
  failScanRun,
  finishScanRun,
  sendScanCompletedTelemetry,
  startScanRun
} from "./pki-discovery-scan-run-fns";
import { LinuxServerTargetConfigSchema } from "./pki-discovery-schemas";
import {
  HostFileImportAction,
  PkiDiscoveryScanStatus,
  PkiDiscoveryType,
  PkiInstallationLocationType,
  PkiInstallationType,
  PkiKeystoreStatus,
  TLinuxServerTargetConfig,
  TPkiInstallationLocationDetails,
  TPkiInstallationMetadata
} from "./pki-discovery-types";
import { createPkiInstallationCredentialsDecryptor } from "./pki-installation-credentials-fns";

const HOST_CONCURRENCY = 8;
const BYTES_PER_KB = 1024;
const UNEXPECTED_HOST_SCAN_ERROR = "The scan failed unexpectedly. Try again later.";

export type THostScanDeps = {
  pkiDiscoveryConfigDAL: TPkiDiscoveryConfigDALFactory;
  pkiDiscoveryScanHistoryDAL: TPkiDiscoveryScanHistoryDALFactory;
  pkiCertificateInstallationDAL: TPkiCertificateInstallationDALFactory;
  pkiDiscoveryInstallationDAL: TPkiDiscoveryInstallationDALFactory;
  pkiCertificateInstallationCertDAL: TPkiCertificateInstallationCertDALFactory;
  certificateDAL: TCertificateDALFactory;
  certificateBodyDAL: TCertificateBodyDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "findById" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "encryptWithKmsKey" | "generateKmsKey" | "createCipherPairWithDataKey">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "find">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findById">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "selectGatewayFromPool">;
  keyStore: Pick<TKeyStoreFactory, "incrementByAndRefreshExpiryIfUnderLimit" | "decrementByOrDelete">;
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
};

type TResolvedHost = {
  connectionId: string;
  hostIdentifier: string;
  hostAddress: string;
  targetHost: string;
  targetPort: number;
  gatewayId: string;
  gatewayName: string;
  fingerprintGatewayKey: string;
  credentials: ReturnType<typeof toSshExecCredentials>;
};

type TScannedHost = TResolvedHost & { hostname: string };

type TKeystorePassword = TCertificateScanRequest["keystorePasswords"][number];

const derToPem = (der: Buffer) => new x509.X509Certificate(asNonSharedBuffer(der)).toString("pem");

export enum HostScanCapability {
  CertificateScan = "certificateScan",
  WindowsCertificateScan = "windowsCertificateScan"
}

const hasCapability = (capabilities: unknown, capability: HostScanCapability) =>
  (capabilities as Record<string, unknown> | null)?.[capability] === true;

export const toHostScanErrorMessage = (error: unknown, logContext: string): string => {
  if (error instanceof GatewayTransportError) {
    logger.warn(`${logContext} [error=${error.message}]`);
    return "Could not reach the gateway through its relay. Check that the gateway and its relay are running.";
  }
  if (error instanceof BadRequestError || error instanceof NotFoundError) {
    logger.warn(`${logContext} [error=${error.message}]`);
    return error.message;
  }
  logger.error(error, logContext);
  return UNEXPECTED_HOST_SCAN_ERROR;
};

export type TAppConnectionRow = Awaited<ReturnType<THostScanDeps["appConnectionDAL"]["findById"]>>;

export type TScanGateway = { gatewayId: string; gatewayName: string; fingerprintGatewayKey: string };

export type THostScanType = {
  discoveryType: PkiDiscoveryType;
  label: string;
  app: AppConnection;
  capability: HostScanCapability;
};

const connectionKindOf = (app: AppConnection) => APP_CONNECTION_NAME_MAP[app];

const selectScanGateway = async (
  connection: NonNullable<TAppConnectionRow>,
  type: THostScanType,
  deps: THostScanDeps
): Promise<TScanGateway> => {
  if (connection.gatewayPoolId) {
    const selected = await deps.gatewayPoolService.selectGatewayFromPool({
      poolId: connection.gatewayPoolId,
      filter: (gateway) => hasCapability(gateway.capabilities, type.capability),
      unavailableMessage:
        "No healthy gateway in the connection's pool supports certificate scanning. Update the pool's gateways to the latest version."
    });
    return { gatewayId: selected.id, gatewayName: selected.name, fingerprintGatewayKey: connection.gatewayPoolId };
  }
  const gateway = await deps.gatewayV2DAL.findById(connection.gatewayId as string);
  if (!gateway) {
    throw new BadRequestError({
      message: `The gateway of ${connectionKindOf(type.app)} connection '${connection.name}' no longer exists`
    });
  }
  if (!hasCapability(gateway.capabilities, type.capability)) {
    throw new BadRequestError({
      message: `Gateway '${gateway.name}' is too old for certificate scanning. Update it to the latest version.`
    });
  }
  return { gatewayId: gateway.id, gatewayName: gateway.name, fingerprintGatewayKey: gateway.id };
};

export const resolveHostConnection = async <TCredentials extends { host: string }>(
  connection: TAppConnectionRow | undefined,
  orgId: string,
  type: THostScanType,
  deps: THostScanDeps
) => {
  if (!connection || connection.orgId !== orgId || connection.app !== type.app) {
    throw new BadRequestError({ message: `The ${connectionKindOf(type.app)} connection no longer exists` });
  }
  if (!connection.gatewayId && !connection.gatewayPoolId) {
    throw new BadRequestError({ message: hostConnectionWithoutGatewayMessage(type, connection.name) });
  }

  const credentials = (await decryptAppConnectionCredentials({
    orgId: connection.orgId,
    encryptedCredentials: connection.encryptedCredentials,
    kmsService: deps.kmsService,
    projectId: connection.projectId
  })) as unknown as TCredentials;

  const gateway = await selectScanGateway(connection, type, deps);

  const [targetHost] = await verifyHostInputValidity({
    host: credentials.host,
    isGateway: true,
    isDynamicSecret: false
  });

  return { connection, credentials, gateway, targetHost };
};

const LINUX_SERVER_SCAN_TYPE: THostScanType = {
  discoveryType: PkiDiscoveryType.LinuxServer,
  label: "Linux Server",
  app: AppConnection.SSH,
  capability: HostScanCapability.CertificateScan
};

export const resolveHost = async (connection: TAppConnectionRow | undefined, orgId: string, deps: THostScanDeps) => {
  const resolved = await resolveHostConnection<TSshConnectionConfig["credentials"]>(
    connection,
    orgId,
    LINUX_SERVER_SCAN_TYPE,
    deps
  );
  const { credentials } = resolved;

  const config = {
    method: resolved.connection.method,
    app: resolved.connection.app,
    credentials,
    gatewayId: resolved.connection.gatewayId,
    gatewayPoolId: resolved.connection.gatewayPoolId,
    orgId: resolved.connection.orgId
  } as TSshConnectionConfig;

  return {
    ...resolved.gateway,
    connectionId: resolved.connection.id,
    hostIdentifier: normalizeHostIdentifier(credentials.host, credentials.port),
    hostAddress: credentials.host.trim().toLowerCase(),
    targetHost: resolved.targetHost,
    targetPort: credentials.port,
    credentials: toSshExecCredentials(config)
  } satisfies TResolvedHost;
};

export const loadKeystorePasswords = async (projectId: string, host: TResolvedHost, deps: THostScanDeps) => {
  const rows = await deps.pkiCertificateInstallationDAL.findKeystoreCredentialsByHost(
    projectId,
    host.hostIdentifier,
    deps.pkiCertificateInstallationDAL.primaryNode()
  );
  const passwords: TKeystorePassword[] = [];
  const installationsOnThisHost = rows.filter(
    (row) =>
      row.locationFingerprint ===
      computeLocationFingerprint(
        PkiInstallationLocationType.Keystore,
        {
          hostIdentifier: host.hostIdentifier,
          filePath: (row.locationDetails as TPkiInstallationLocationDetails).filePath
        },
        host.fingerprintGatewayKey
      )
  );
  if (installationsOnThisHost.length === 0) return passwords;
  const decrypt = await createPkiInstallationCredentialsDecryptor({ projectId, kmsService: deps.kmsService });
  installationsOnThisHost.forEach((row) => {
    const { filePath } = row.locationDetails as TPkiInstallationLocationDetails;
    if (!row.encryptedCredentials || !filePath) return;
    const { keystorePassword } = decrypt(row.encryptedCredentials);
    if (keystorePassword !== undefined) passwords.push({ path: filePath, password: keystorePassword });
  });
  return passwords;
};

const admitConnectionScanSlot = async (connectionId: string, deps: THostScanDeps): Promise<boolean> => {
  const { retryCount, retryDelay, retryJitter } = PKI_SYNC_CONNECTION_LOCK_RETRY;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    if (attempt > 0) await delay(retryDelay + Math.random() * retryJitter);
    // eslint-disable-next-line no-await-in-loop
    if (await tryAdmitAppConnectionConcurrency(deps.keyStore, connectionId)) return true;
  }
  return false;
};

type TGatewayScanTarget = TScanGateway & { connectionId: string; targetHost: string; targetPort: number };

type TGatewayScanFailure = { ok: false; status: number; kind?: GatewayFailureKind | null };

export const runGatewayScan = async <TFailure extends TGatewayScanFailure, TResult>(
  host: TGatewayScanTarget,
  {
    protocol,
    call,
    describeFailure,
    schema,
    logLabel
  }: {
    protocol: GatewayProxyProtocol;
    call: (port: number) => Promise<{ ok: true; result: unknown } | TFailure>;
    describeFailure: (failure: TFailure) => string;
    schema: z.ZodType<TResult, z.ZodTypeDef, unknown>;
    logLabel: string;
  },
  deps: THostScanDeps
): Promise<TResult> => {
  const connectionDetails = await deps.gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId: host.gatewayId,
    targetHost: host.targetHost,
    targetPort: host.targetPort
  });
  if (!connectionDetails) {
    throw new NotFoundError({ message: getMissingGatewayMessage(host.gatewayId) });
  }

  let response: { ok: true; result: unknown } | TFailure;
  try {
    response = await withGatewayV2Proxy(call, { protocol, longLived: true, ...connectionDetails });
  } catch (error) {
    if (error instanceof GatewayTransportError) throw error;
    logger.warn(
      `${logLabel} transport failed [connectionId=${host.connectionId}] [gatewayId=${host.gatewayId}] [error=${error instanceof Error ? error.message : String(error)}]`
    );
    throw new BadRequestError({
      message:
        "The connection to the gateway dropped during the scan. Check that the gateway and its relay are running, then try again."
    });
  }

  if (!response.ok) {
    logger.warn(
      { failure: response },
      `${logLabel} RPC failed [connectionId=${host.connectionId}] [gatewayId=${host.gatewayId}] [status=${response.status}] [kind=${response.kind ?? "none"}]`
    );
    throw new BadRequestError({ message: describeFailure(response) });
  }
  const parsed = schema.safeParse(response.result);
  if (!parsed.success) {
    logger.warn(
      { issues: parsed.error.issues },
      `${logLabel} result did not match the expected shape [connectionId=${host.connectionId}] [gatewayId=${host.gatewayId}]`
    );
    throw new BadRequestError({ message: "The gateway returned a scan result that could not be read" });
  }
  return parsed.data;
};

const runCertificateScan = (
  host: TResolvedHost,
  request: TCertificateScanRequest,
  deps: THostScanDeps
): Promise<TCertificateScanResponse> =>
  runGatewayScan(
    host,
    {
      protocol: GatewayProxyProtocol.Discovery,
      call: (port) => callCertificateScan({ port, credentials: host.credentials, request }),
      describeFailure: (failure) => describeCertificateScanFailure(failure, host.gatewayName),
      schema: CertificateScanResponseSchema,
      logLabel: "Certificate scan"
    },
    deps
  );

export const withConnectionScanSlot = async <T>(
  connectionId: string,
  app: AppConnection,
  deps: THostScanDeps,
  fn: () => Promise<T>
): Promise<T> => {
  if (!(await admitConnectionScanSlot(connectionId, deps))) {
    throw new BadRequestError({
      message: `The ${connectionKindOf(app)} connection is busy with other jobs. Try again later.`
    });
  }
  try {
    return await fn();
  } finally {
    await releaseAppConnectionConcurrency(deps.keyStore, connectionId).catch((error: unknown) =>
      logger.error(error, `Failed to release the connection scan slot [connectionId=${connectionId}]`)
    );
  }
};

export const scanHost = (
  host: TResolvedHost,
  request: TCertificateScanRequest,
  deps: THostScanDeps
): Promise<TCertificateScanResponse> =>
  withConnectionScanSlot(host.connectionId, AppConnection.SSH, deps, () => runCertificateScan(host, request, deps));

export type TWriteContext = {
  projectId: string;
  discoveryId?: string;
  scanTime: Date;
  importStandaloneCaCertificates: boolean;
  kmsEncryptor: TKmsEncryptor;
  certificateIdsByFingerprint: Map<string, string>;
  targetInstallationId?: string;
};

const findTargetInstallation = (ctx: TWriteContext, fingerprint: string, deps: THostScanDeps, tx: Knex) =>
  ctx.targetInstallationId
    ? deps.pkiCertificateInstallationDAL.findById(ctx.targetInstallationId, tx)
    : deps.pkiCertificateInstallationDAL.findByFingerprint(ctx.projectId, fingerprint, tx);

const buildHostLocationDetails = (host: TScannedHost, file: TCertificateScanFile): TPkiInstallationLocationDetails => ({
  hostIdentifier: host.hostIdentifier,
  filePath: file.realPath,
  connectionId: host.connectionId,
  ...(net.isIP(host.hostAddress) !== 0 && { ipAddress: host.hostAddress }),
  ...(host.hostname && { hostname: host.hostname }),
  ...(file.format && { format: file.format }),
  gatewayName: host.gatewayName
});

export const importCertificateChains = async (
  chains: Buffer[][],
  discoveryMetadata: Record<string, string | undefined>,
  ctx: TWriteContext,
  deps: THostScanDeps
) => {
  const certificateIds: string[] = [];
  for (const chain of chains) {
    const parsed = parseCertificateDer(chain[0]);
    if (!parsed) continue; // eslint-disable-line no-continue
    const knownCertificateId = ctx.certificateIdsByFingerprint.get(parsed.fingerprint);
    if (knownCertificateId) {
      certificateIds.push(knownCertificateId);
      continue; // eslint-disable-line no-continue
    }
    parsed.pemChain = [...parsed.pemChain, ...chain.slice(1).map(derToPem)];
    // eslint-disable-next-line no-await-in-loop
    const certificateId = await processDiscoveredCertificate(
      parsed,
      ctx.projectId,
      {
        certificateDAL: deps.certificateDAL,
        certificateBodyDAL: deps.certificateBodyDAL,
        kmsEncryptor: ctx.kmsEncryptor
      },
      {
        discoveredBy: ctx.discoveryId,
        ...discoveryMetadata,
        discoveredAt: ctx.scanTime.toISOString(),
        issuerCommonName: parsed.issuerCommonName,
        issuerOrganization: parsed.issuerOrganization
      }
    );
    if (certificateId) {
      ctx.certificateIdsByFingerprint.set(parsed.fingerprint, certificateId);
      certificateIds.push(certificateId);
    }
  }
  return certificateIds;
};

export const upsertInstallationWithLinks = async (
  {
    fingerprint,
    locationType,
    locationDetails,
    name,
    keystoreStatus,
    certificateIds,
    refreshOnly
  }: {
    fingerprint: string;
    locationType: PkiInstallationLocationType;
    locationDetails: TPkiInstallationLocationDetails;
    name: string | null;
    keystoreStatus?: PkiKeystoreStatus;
    certificateIds: string[];
    refreshOnly: boolean;
  },
  ctx: TWriteContext,
  deps: THostScanDeps
) =>
  deps.pkiDiscoveryConfigDAL.transaction(async (tx) => {
    let installation = await findTargetInstallation(ctx, fingerprint, deps, tx);
    if (!installation && refreshOnly) return undefined;
    const previousMetadata = (installation?.metadata as TPkiInstallationMetadata | null) ?? {};
    const previousReadAt = previousMetadata.lastReadAt ? new Date(previousMetadata.lastReadAt) : null;
    const supersededByNewerRead = previousReadAt !== null && previousReadAt > ctx.scanTime;
    const metadata: TPkiInstallationMetadata = supersededByNewerRead
      ? { ...previousMetadata, lastCheckedAt: new Date().toISOString() }
      : {
          ...previousMetadata,
          ...(keystoreStatus && { keystoreStatus }),
          ...(keystoreStatus === PkiKeystoreStatus.Readable && { lastReadAt: ctx.scanTime.toISOString() }),
          lastCheckedAt: new Date().toISOString(),
          lastError: undefined
        };

    if (!installation) {
      try {
        installation = await tx.transaction((sp) =>
          deps.pkiCertificateInstallationDAL.create(
            {
              projectId: ctx.projectId,
              locationType,
              locationDetails,
              locationFingerprint: fingerprint,
              name,
              type: PkiInstallationType.Server,
              metadata,
              lastSeenAt: ctx.scanTime
            },
            sp
          )
        );
      } catch (error) {
        if (!hasPostgresErrorCode(error, DatabaseErrorCode.UniqueViolation)) throw error;
        installation = await findTargetInstallation(ctx, fingerprint, deps, tx);
        if (!installation) throw error;
        await deps.pkiCertificateInstallationDAL.updateById(
          installation.id,
          { lastSeenAt: ctx.scanTime, locationDetails, locationType, metadata },
          tx
        );
      }
    } else {
      await deps.pkiCertificateInstallationDAL.updateById(
        installation.id,
        { lastSeenAt: ctx.scanTime, locationDetails, locationType, metadata },
        tx
      );
    }

    if (ctx.discoveryId) {
      const link = await deps.pkiDiscoveryInstallationDAL.upsertLink(
        ctx.discoveryId,
        installation.id,
        ctx.scanTime,
        tx
      );
      if (!link) return undefined;
    }

    for (const certificateId of certificateIds) {
      // eslint-disable-next-line no-await-in-loop
      await deps.pkiCertificateInstallationCertDAL.upsertCertLink(
        installation.id,
        certificateId,
        { lastSeenAt: ctx.scanTime },
        tx
      );
    }
    return installation.id;
  });

export const writeHostFile = async (
  host: TScannedHost,
  file: TCertificateScanFile,
  ctx: TWriteContext,
  deps: THostScanDeps
): Promise<{ installationId?: string; certificateIds: string[] }> => {
  const plan = planHostFileImport(file, { importStandaloneCaCertificates: ctx.importStandaloneCaCertificates });
  if (plan.action === HostFileImportAction.Skip) return { certificateIds: [] };

  const fingerprint = computeLocationFingerprint(
    plan.locationType,
    { hostIdentifier: host.hostIdentifier, filePath: file.realPath },
    host.fingerprintGatewayKey
  );

  const certificateIds =
    plan.action === HostFileImportAction.Refresh
      ? []
      : await importCertificateChains(
          plan.chainsToImport,
          {
            hostIdentifier: host.hostIdentifier,
            hostname: host.hostname,
            filePath: file.realPath,
            format: file.format
          },
          ctx,
          deps
        );
  const installationId = await upsertInstallationWithLinks(
    {
      fingerprint,
      locationType: plan.locationType,
      locationDetails: buildHostLocationDetails(host, file),
      name: buildHostInstallationName(host.hostIdentifier, host.hostname, file.realPath),
      keystoreStatus: plan.keystoreStatus,
      certificateIds,
      refreshOnly: plan.action === HostFileImportAction.Refresh
    },
    ctx,
    deps
  );

  return { installationId, certificateIds };
};

export const buildScanRequest = (
  targetConfig: TLinuxServerTargetConfig,
  keystorePasswords: TKeystorePassword[],
  filePaths: string[] = []
): TCertificateScanRequest => ({
  searchFolderPaths: targetConfig.searchFolderPaths,
  skipFolderPaths: targetConfig.skipFolderPaths,
  maxFolderDepth: targetConfig.maxFolderDepth,
  maxFileSizeBytes: targetConfig.maxFileSizeKb * BYTES_PER_KB,
  filePaths,
  keystorePasswords
});

export type THostScanRun<TConfig> = {
  discoveryId: string;
  projectId: string;
  orgId: string;
  targetConfig: TConfig;
  ctx: TWriteContext;
  writeLimit: ReturnType<typeof pLimit>;
  certificateIds: Set<string>;
  installationIds: Set<string>;
};

export type THostScanOutcome = { issues: string[]; failure?: { label: string; message: string } };

type THostScanTargetConfig = { connectionIds: string[]; importStandaloneCaCertificates: boolean };

export type THostScanDefinition<TConfig extends THostScanTargetConfig = THostScanTargetConfig> = THostScanType & {
  schema: z.ZodTypeAny;
  hostConcurrency?: number;
  scanConnection: (
    connection: TAppConnectionRow | undefined,
    label: string,
    run: THostScanRun<TConfig>,
    deps: THostScanDeps
  ) => Promise<THostScanOutcome>;
};

const scanLinuxConnection = async (
  connection: TAppConnectionRow | undefined,
  label: string,
  run: THostScanRun<TLinuxServerTargetConfig>,
  deps: THostScanDeps
): Promise<THostScanOutcome> => {
  let hostLabel = label;
  const issues: string[] = [];
  try {
    const host = await resolveHost(connection, run.orgId, deps);
    hostLabel = host.hostIdentifier;
    const keystorePasswords = await loadKeystorePasswords(run.projectId, host, deps);
    const response = await scanHost(host, buildScanRequest(run.targetConfig, keystorePasswords), deps);

    issues.push(...summarizeHostScanIssues(host.hostIdentifier, response));

    await run.writeLimit(async () => {
      for (const file of response.files) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const result = await writeHostFile({ ...host, hostname: response.host.hostname }, file, run.ctx, deps);
          if (result.installationId) run.installationIds.add(result.installationId);
          result.certificateIds.forEach((id) => run.certificateIds.add(id));
        } catch (error) {
          const message = toHostScanErrorMessage(
            error,
            `Linux Server discovery file import failed [discoveryId=${run.discoveryId}] [host=${host.hostIdentifier}] [file=${file.realPath}]`
          );
          issues.push(`${host.hostIdentifier} (${file.realPath}): ${message}`);
        }
      }
    });
    return { issues };
  } catch (error) {
    const message = toHostScanErrorMessage(
      error,
      `Linux Server discovery host failed [discoveryId=${run.discoveryId}] [connection=${label}]`
    );
    return { issues, failure: { label: hostLabel, message } };
  }
};

export const executeHostScan = async <TConfig extends THostScanTargetConfig>(
  discoveryId: string,
  definition: THostScanDefinition<TConfig>,
  deps: THostScanDeps
): Promise<void> => {
  const { pkiDiscoveryConfigDAL } = deps;
  const startedAt = new Date();
  let scanHistoryId: string | undefined;

  try {
    const discoveryConfig = await pkiDiscoveryConfigDAL.findById(discoveryId);
    if (!discoveryConfig) {
      throw new Error(`Discovery config not found: ${discoveryId}`);
    }
    const project = await deps.projectDAL.findById(discoveryConfig.projectId);
    const targetConfig = discoveryConfig.targetConfig as TConfig;

    logger.info(
      `${definition.label} discovery scan starting [discoveryId=${discoveryId}] [projectId=${discoveryConfig.projectId}]`
    );

    const certificateKmsKeyId = await getProjectKmsCertificateKeyId({
      projectId: discoveryConfig.projectId,
      projectDAL: deps.projectDAL,
      kmsService: deps.kmsService
    });
    const kmsEncryptor = await deps.kmsService.encryptWithKmsKey({ kmsId: certificateKmsKeyId });

    scanHistoryId = await startScanRun(discoveryId, startedAt, deps);

    const hostLimit = pLimit(definition.hostConcurrency ?? HOST_CONCURRENCY);
    const run: THostScanRun<TConfig> = {
      discoveryId,
      projectId: discoveryConfig.projectId,
      orgId: project.orgId,
      targetConfig,
      ctx: {
        projectId: discoveryConfig.projectId,
        discoveryId,
        scanTime: startedAt,
        importStandaloneCaCertificates: targetConfig.importStandaloneCaCertificates,
        kmsEncryptor,
        certificateIdsByFingerprint: new Map()
      },
      writeLimit: pLimit(1),
      certificateIds: new Set(),
      installationIds: new Set()
    };

    const connectionsById = new Map(
      (await deps.appConnectionDAL.find({ $in: { id: targetConfig.connectionIds } })).map((connection) => [
        connection.id,
        connection
      ])
    );

    const outcomes = await Promise.all(
      targetConfig.connectionIds.map((connectionId) => {
        const connection = connectionsById.get(connectionId);
        return hostLimit(() =>
          definition.scanConnection(connection, connection?.name ?? "Deleted connection", run, deps)
        );
      })
    );

    if (await discardScanRunIfDeleted(discoveryId, scanHistoryId, deps)) return;

    const completedAt = new Date();
    const hostFailures = new Map<string, string[]>();
    outcomes.forEach(({ failure }) => {
      if (failure) hostFailures.set(failure.message, [...(hostFailures.get(failure.message) ?? []), failure.label]);
    });
    const failedHosts = outcomes.filter(({ failure }) => failure).length;
    const allHostsFailed = failedHosts > 0 && failedHosts === targetConfig.connectionIds.length;
    const finalStatus = allHostsFailed ? PkiDiscoveryScanStatus.Failed : PkiDiscoveryScanStatus.Completed;
    const failureIssues = [...hostFailures.entries()].map(([message, labels]) => `${labels.join(", ")}: ${message}`);
    const allIssues = [...new Set([...failureIssues, ...outcomes.flatMap(({ issues }) => issues)])];
    const errorMessage = allIssues.length > 0 ? allIssues.join("; ") : null;

    await finishScanRun(
      {
        discoveryId,
        scanHistoryId,
        status: finalStatus,
        completedAt,
        targetsScannedCount: targetConfig.connectionIds.length,
        certificatesFoundCount: run.certificateIds.size,
        installationsFoundCount: run.installationIds.size,
        errorMessage
      },
      deps
    );

    await sendScanCompletedTelemetry(deps.telemetryService, {
      discoveryId,
      discoveryType: definition.discoveryType,
      projectId: run.projectId,
      orgId: run.orgId,
      status: finalStatus,
      certificatesFound: run.certificateIds.size,
      installationsFound: run.installationIds.size,
      durationMs: completedAt.getTime() - startedAt.getTime()
    });

    logger.info(
      `${definition.label} discovery scan finished [discoveryId=${discoveryId}] [status=${finalStatus}] [certificates=${run.certificateIds.size}] [installations=${run.installationIds.size}]`
    );
  } catch (error) {
    const message = toHostScanErrorMessage(
      error,
      `${definition.label} discovery scan failed [discoveryId=${discoveryId}]`
    );
    await failScanRun(discoveryId, scanHistoryId, new Error(message), deps);
    throw error;
  }
};

export const LINUX_SERVER_SCAN: THostScanDefinition<TLinuxServerTargetConfig> = {
  ...LINUX_SERVER_SCAN_TYPE,
  schema: LinuxServerTargetConfigSchema,
  scanConnection: scanLinuxConnection
};
