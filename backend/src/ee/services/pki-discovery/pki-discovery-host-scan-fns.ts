import * as x509 from "@peculiar/x509";
import { Knex } from "knex";
import net from "net";
import pLimit from "p-limit";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2DALFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { delay } from "@app/lib/delay";
import { BadRequestError, GatewayTransportError, NotFoundError } from "@app/lib/errors";
import { callCertificateScan, TCertificateScanRequest } from "@app/lib/gateway-v2/certificate-scan-rpc";
import { getMissingGatewayMessage } from "@app/lib/gateway-v2/gateway-errors";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { GatewayProxyProtocol } from "@app/lib/gateway-v2/types";
import { logger } from "@app/lib/logger";
import {
  releaseAppConnectionConcurrency,
  tryAdmitAppConnectionConcurrency
} from "@app/services/app-connection/app-connection-concurrency-fns";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
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
  normalizeHostIdentifier,
  planHostFileImport,
  sshConnectionWithoutGatewayMessage,
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

const derToPem = (der: Buffer) => new x509.X509Certificate(der).toString("pem");

const canScanCertificates = (capabilities: unknown) =>
  (capabilities as Record<string, unknown> | null)?.certificateScan === true;

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

type TAppConnectionRow = Awaited<ReturnType<THostScanDeps["appConnectionDAL"]["findById"]>>;

export const resolveHost = async (connection: TAppConnectionRow | undefined, orgId: string, deps: THostScanDeps) => {
  if (!connection || connection.orgId !== orgId) {
    throw new BadRequestError({ message: "The SSH connection no longer exists" });
  }
  if (!connection.gatewayId && !connection.gatewayPoolId) {
    throw new BadRequestError({ message: sshConnectionWithoutGatewayMessage(connection.name) });
  }

  const credentials = (await decryptAppConnectionCredentials({
    orgId: connection.orgId,
    encryptedCredentials: connection.encryptedCredentials,
    kmsService: deps.kmsService,
    projectId: connection.projectId
  })) as TSshConnectionConfig["credentials"];

  const config = {
    method: connection.method,
    app: connection.app,
    credentials,
    gatewayId: connection.gatewayId,
    gatewayPoolId: connection.gatewayPoolId,
    orgId: connection.orgId
  } as TSshConnectionConfig;

  let gatewayId: string;
  let gatewayName: string;
  if (connection.gatewayPoolId) {
    const selected = await deps.gatewayPoolService.selectGatewayFromPool({
      poolId: connection.gatewayPoolId,
      filter: (gateway) => canScanCertificates(gateway.capabilities),
      unavailableMessage:
        "No healthy gateway in the connection's pool supports certificate scanning. Update the pool's gateways to the latest version."
    });
    gatewayId = selected.id;
    gatewayName = selected.name;
  } else {
    const gateway = await deps.gatewayV2DAL.findById(connection.gatewayId as string);
    if (!gateway) {
      throw new BadRequestError({ message: `The gateway of SSH connection '${connection.name}' no longer exists` });
    }
    if (!canScanCertificates(gateway.capabilities)) {
      throw new BadRequestError({
        message: `Gateway '${gateway.name}' is too old for certificate scanning. Update it to the latest version.`
      });
    }
    gatewayId = gateway.id;
    gatewayName = gateway.name;
  }

  const [targetHost] = await verifyHostInputValidity({
    host: credentials.host,
    isGateway: true,
    isDynamicSecret: false
  });

  return {
    connectionId: connection.id,
    hostIdentifier: normalizeHostIdentifier(credentials.host, credentials.port),
    hostAddress: credentials.host.trim().toLowerCase(),
    targetHost,
    targetPort: credentials.port,
    gatewayId,
    gatewayName,
    fingerprintGatewayKey: connection.gatewayPoolId ?? gatewayId,
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

const runCertificateScan = async (
  host: TResolvedHost,
  request: TCertificateScanRequest,
  deps: THostScanDeps
): Promise<TCertificateScanResponse> => {
  const connectionDetails = await deps.gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId: host.gatewayId,
    targetHost: host.targetHost,
    targetPort: host.targetPort
  });
  if (!connectionDetails) {
    throw new NotFoundError({ message: getMissingGatewayMessage(host.gatewayId) });
  }

  const response = await withGatewayV2Proxy(
    (proxyPort) => callCertificateScan({ port: proxyPort, credentials: host.credentials, request }),
    { protocol: GatewayProxyProtocol.Discovery, longLived: true, ...connectionDetails }
  );

  if (!response.ok) {
    logger.warn(
      `Certificate scan RPC failed [connectionId=${host.connectionId}] [gatewayId=${host.gatewayId}] [status=${response.status}] [kind=${response.kind ?? "none"}] [detail=${response.detail}]`
    );
    throw new BadRequestError({
      message: describeCertificateScanFailure(response, host.gatewayName)
    });
  }
  const parsed = CertificateScanResponseSchema.safeParse(response.result);
  if (!parsed.success) {
    logger.warn(
      { issues: parsed.error.issues },
      `Certificate scan result did not match the expected shape [connectionId=${host.connectionId}] [gatewayId=${host.gatewayId}]`
    );
    throw new BadRequestError({ message: "The gateway returned a scan result that could not be read" });
  }
  return parsed.data;
};

export const scanHost = async (
  host: TResolvedHost,
  request: TCertificateScanRequest,
  deps: THostScanDeps
): Promise<TCertificateScanResponse> => {
  if (!(await admitConnectionScanSlot(host.connectionId, deps))) {
    throw new BadRequestError({ message: "The SSH connection is busy with other jobs. Try again later." });
  }
  try {
    return await runCertificateScan(host, request, deps);
  } finally {
    await releaseAppConnectionConcurrency(deps.keyStore, host.connectionId).catch((error: unknown) =>
      logger.error(error, `Failed to release the connection scan slot [connectionId=${host.connectionId}]`)
    );
  }
};

type TWriteContext = {
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

const importCertificateChains = async (
  host: TScannedHost,
  file: TCertificateScanFile,
  chains: Buffer[][],
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
        hostIdentifier: host.hostIdentifier,
        hostname: host.hostname,
        filePath: file.realPath,
        format: file.format,
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

const upsertInstallationWithLinks = async (
  host: TScannedHost,
  file: TCertificateScanFile,
  {
    fingerprint,
    locationType,
    keystoreStatus,
    certificateIds,
    refreshOnly
  }: {
    fingerprint: string;
    locationType: PkiInstallationLocationType;
    keystoreStatus?: PkiKeystoreStatus;
    certificateIds: string[];
    refreshOnly: boolean;
  },
  ctx: TWriteContext,
  deps: THostScanDeps
) => {
  const locationDetails = buildHostLocationDetails(host, file);

  return deps.pkiDiscoveryConfigDAL.transaction(async (tx) => {
    let installation = await findTargetInstallation(ctx, fingerprint, deps, tx);
    if (!installation && refreshOnly) return undefined;
    const previousMetadata = (installation?.metadata as TPkiInstallationMetadata | null) ?? {};
    const metadata: TPkiInstallationMetadata = {
      ...previousMetadata,
      ...(keystoreStatus && { keystoreStatus }),
      ...(keystoreStatus === PkiKeystoreStatus.Readable && { lastReadAt: ctx.scanTime.toISOString() }),
      lastCheckedAt: new Date().toISOString(),
      lastError: undefined
    };

    if (!installation) {
      installation = await deps.pkiCertificateInstallationDAL.create(
        {
          projectId: ctx.projectId,
          locationType,
          locationDetails,
          locationFingerprint: fingerprint,
          name: buildHostInstallationName(host.hostIdentifier, host.hostname, file.realPath),
          type: PkiInstallationType.Server,
          metadata,
          lastSeenAt: ctx.scanTime
        },
        tx
      );
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
};

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
      : await importCertificateChains(host, file, plan.chainsToImport, ctx, deps);
  const installationId = await upsertInstallationWithLinks(
    host,
    file,
    {
      fingerprint,
      locationType: plan.locationType,
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

type TLinuxServerScanRun = {
  discoveryId: string;
  projectId: string;
  orgId: string;
  targetConfig: TLinuxServerTargetConfig;
  ctx: TWriteContext;
  writeLimit: ReturnType<typeof pLimit>;
  certificateIds: Set<string>;
  installationIds: Set<string>;
};

type THostScanOutcome = { issues: string[]; failure?: { label: string; message: string } };

const scanConnection = async (
  connection: TAppConnectionRow | undefined,
  label: string,
  run: TLinuxServerScanRun,
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
        // eslint-disable-next-line no-await-in-loop
        const result = await writeHostFile({ ...host, hostname: response.host.hostname }, file, run.ctx, deps);
        if (result.installationId) run.installationIds.add(result.installationId);
        result.certificateIds.forEach((id) => run.certificateIds.add(id));
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

export const executeLinuxServerScan = async (discoveryId: string, deps: THostScanDeps): Promise<void> => {
  const { pkiDiscoveryConfigDAL } = deps;
  const startedAt = new Date();
  let scanHistoryId: string | undefined;

  try {
    const discoveryConfig = await pkiDiscoveryConfigDAL.findById(discoveryId);
    if (!discoveryConfig) {
      throw new Error(`Discovery config not found: ${discoveryId}`);
    }
    const project = await deps.projectDAL.findById(discoveryConfig.projectId);
    const targetConfig = discoveryConfig.targetConfig as TLinuxServerTargetConfig;

    logger.info(
      `Linux Server discovery scan starting [discoveryId=${discoveryId}] [projectId=${discoveryConfig.projectId}]`
    );

    const certificateKmsKeyId = await getProjectKmsCertificateKeyId({
      projectId: discoveryConfig.projectId,
      projectDAL: deps.projectDAL,
      kmsService: deps.kmsService
    });
    const kmsEncryptor = await deps.kmsService.encryptWithKmsKey({ kmsId: certificateKmsKeyId });

    scanHistoryId = await startScanRun(discoveryId, startedAt, deps);

    const hostLimit = pLimit(HOST_CONCURRENCY);
    const run: TLinuxServerScanRun = {
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
        return hostLimit(() => scanConnection(connection, connection?.name ?? "Deleted connection", run, deps));
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
    const allIssues = [...failureIssues, ...outcomes.flatMap(({ issues }) => issues)];
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
      discoveryType: PkiDiscoveryType.LinuxServer,
      projectId: run.projectId,
      orgId: run.orgId,
      status: finalStatus,
      certificatesFound: run.certificateIds.size,
      installationsFound: run.installationIds.size,
      durationMs: completedAt.getTime() - startedAt.getTime()
    });

    logger.info(
      `Linux Server discovery scan finished [discoveryId=${discoveryId}] [status=${finalStatus}] [certificates=${run.certificateIds.size}] [installations=${run.installationIds.size}]`
    );
  } catch (error) {
    const message = toHostScanErrorMessage(error, `Linux Server discovery scan failed [discoveryId=${discoveryId}]`);
    await failScanRun(discoveryId, scanHistoryId, new Error(message), deps);
    throw error;
  }
};
