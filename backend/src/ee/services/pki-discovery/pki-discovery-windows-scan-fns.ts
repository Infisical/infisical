import net from "net";
import { z } from "zod";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { BadRequestError, GatewayTransportError, NotFoundError } from "@app/lib/errors";
import { getMissingGatewayMessage } from "@app/lib/gateway-v2/gateway-errors";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { GatewayProxyProtocol } from "@app/lib/gateway-v2/types";
import {
  callWinRmEndpoint,
  WINRM_RPC_RESPONSE_TOO_LARGE_STATUS,
  WinRmRpcEndpoint,
  WinRmRpcResponse
} from "@app/lib/gateway-v2/winrm-rpc";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { TWinRMCredentials } from "@app/services/app-connection/winrm/winrm-connection-fns";

import { computeLocationFingerprint } from "./pki-discovery-fns";
import {
  buildHostInstallationName,
  normalizeHostIdentifier,
  windowsConnectionWithoutGatewayMessage
} from "./pki-discovery-host-fns";
import {
  executeHostScan,
  HostScanCapability,
  importCertificateChains,
  selectScanGateway,
  TAppConnectionRow,
  THostScanDeps,
  THostScanOutcome,
  THostScanRun,
  toHostScanErrorMessage,
  TScanGateway,
  TWriteContext,
  upsertInstallationWithLinks,
  withConnectionScanSlot
} from "./pki-discovery-host-scan-fns";
import {
  HostCertificateChainKind,
  HostCertificateFileStatus,
  HostScanTruncationReason,
  PkiDiscoveryType,
  PkiInstallationLocationType,
  TPkiInstallationLocationDetails,
  TWindowsServerTargetConfig,
  WindowsCertificateStore
} from "./pki-discovery-types";

const WINDOWS_STORE_LOCATION = "LocalMachine";
const WINDOWS_CONNECTION_KIND = "Windows (WinRM)";
const MAX_WINDOWS_SCAN_RESPONSE_BYTES = 24 * 1024 * 1024;
const DEFAULT_WINRM_HTTP_PORT = 5985;
const DEFAULT_WINRM_HTTPS_PORT = 5986;
const MAX_WINDOWS_SCAN_CERTIFICATES = 5000;

const WindowsStoreCertificateSchema = z.object({
  store: z.string().max(64),
  thumbprint: z.string().max(128),
  hasPrivateKey: z.boolean(),
  status: z.nativeEnum(HostCertificateFileStatus).catch(HostCertificateFileStatus.ReadFailed),
  chains: z
    .array(
      z.object({
        kind: z.nativeEnum(HostCertificateChainKind).catch(HostCertificateChainKind.Ca),
        indexes: z.array(z.number().int().nonnegative())
      })
    )
    .nullish()
});

export const WindowsCertificateScanResponseSchema = z.object({
  host: z.object({ hostname: z.string().max(255).optional().default("") }),
  pool: z.array(z.string()).nullish(),
  certificates: z.array(WindowsStoreCertificateSchema).nullish(),
  deniedStores: z.array(z.string()).nullish(),
  unreadableIssuerStores: z.array(z.string()).nullish(),
  truncatedIssuerStores: z.array(z.string()).nullish(),
  truncatedReason: z.string().max(64).optional()
});

export type TWindowsCertificateScanResponse = z.infer<typeof WindowsCertificateScanResponseSchema>;
type TWindowsStoreCertificate = z.infer<typeof WindowsStoreCertificateSchema>;

type TResolvedWindowsHost = TScanGateway & {
  connectionId: string;
  hostIdentifier: string;
  hostAddress: string;
  targetHost: string;
  targetPort: number;
  credentials: TWinRMCredentials;
};

type TScannedWindowsHost = TResolvedWindowsHost & { hostname: string };

export const resolveWindowsHost = async (
  connection: TAppConnectionRow | undefined,
  orgId: string,
  deps: THostScanDeps
): Promise<TResolvedWindowsHost> => {
  if (!connection || connection.orgId !== orgId || connection.app !== AppConnection.WinRM) {
    throw new BadRequestError({ message: "The Windows (WinRM) connection no longer exists" });
  }
  if (!connection.gatewayId && !connection.gatewayPoolId) {
    throw new BadRequestError({ message: windowsConnectionWithoutGatewayMessage(connection.name) });
  }

  const credentials = (await decryptAppConnectionCredentials({
    orgId: connection.orgId,
    encryptedCredentials: connection.encryptedCredentials,
    kmsService: deps.kmsService,
    projectId: connection.projectId
  })) as TWinRMCredentials;

  const gateway = await selectScanGateway(
    connection,
    HostScanCapability.WindowsCertificateScan,
    WINDOWS_CONNECTION_KIND,
    deps
  );

  const [targetHost] = await verifyHostInputValidity({
    host: credentials.host,
    isGateway: true,
    isDynamicSecret: false
  });

  return {
    ...gateway,
    connectionId: connection.id,
    hostIdentifier: normalizeHostIdentifier(
      credentials.host,
      credentials.port,
      credentials.sslEnabled ? DEFAULT_WINRM_HTTPS_PORT : DEFAULT_WINRM_HTTP_PORT
    ),
    hostAddress: credentials.host.trim().toLowerCase(),
    targetHost,
    targetPort: credentials.port,
    credentials
  };
};

const describeWindowsScanFailure = (
  failure: Extract<WinRmRpcResponse<unknown>, { ok: false }>,
  gatewayName: string
): string => {
  if (failure.status === 404) {
    return `Gateway '${gatewayName}' is too old for certificate scanning. Update it to the latest version.`;
  }
  if (failure.status === WINRM_RPC_RESPONSE_TOO_LARGE_STATUS) {
    return "The scan returned more certificates than one scan can hold. Select fewer certificate stores.";
  }
  if (failure.status === 503) {
    return "The gateway is busy with other certificate scans. Try again later.";
  }
  if (failure.kind === "auth") {
    return "The Windows host rejected the connection's credentials. Check the username and password on the connection.";
  }
  if (failure.kind === "transport") {
    return "The gateway could not reach the Windows host over WinRM. Check the host, port and WinRM listener.";
  }
  return "The gateway could not read the certificate stores on the Windows host. Check the gateway logs for details.";
};

const runWindowsCertificateScan = async (
  host: TResolvedWindowsHost,
  stores: WindowsCertificateStore[],
  deps: THostScanDeps
): Promise<TWindowsCertificateScanResponse> => {
  const connectionDetails = await deps.gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId: host.gatewayId,
    targetHost: host.targetHost,
    targetPort: host.targetPort
  });
  if (!connectionDetails) {
    throw new NotFoundError({ message: getMissingGatewayMessage(host.gatewayId) });
  }

  const { credentials } = host;
  let response: WinRmRpcResponse<unknown>;
  try {
    response = await withGatewayV2Proxy(
      (port) =>
        callWinRmEndpoint<unknown>({
          port,
          endpoint: WinRmRpcEndpoint.ScanCertificates,
          maxResponseBytes: MAX_WINDOWS_SCAN_RESPONSE_BYTES,
          body: {
            username: credentials.username,
            password: credentials.password,
            params: {
              useHttps: credentials.sslEnabled ?? false,
              insecure: credentials.sslEnabled ? credentials.sslRejectUnauthorized === false : false,
              ...(credentials.sslEnabled && credentials.sslCertificate
                ? { caCertificate: credentials.sslCertificate }
                : {}),
              stores,
              maxCertificates: MAX_WINDOWS_SCAN_CERTIFICATES
            }
          }
        }),
      { protocol: GatewayProxyProtocol.WinRm, longLived: true, ...connectionDetails }
    );
  } catch (error) {
    if (error instanceof GatewayTransportError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      `Windows certificate scan transport failed [connectionId=${host.connectionId}] [gatewayId=${host.gatewayId}] [error=${message}]`
    );
    throw new BadRequestError({
      message:
        "The connection to the gateway dropped during the scan. Check that the gateway and its relay are running, then try again."
    });
  }

  if (!response.ok) {
    logger.warn(
      { errorMessage: response.errorMessage },
      `Windows certificate scan RPC failed [connectionId=${host.connectionId}] [gatewayId=${host.gatewayId}] [status=${response.status}] [kind=${response.kind ?? "none"}]`
    );
    throw new BadRequestError({ message: describeWindowsScanFailure(response, host.gatewayName) });
  }

  const parsed = WindowsCertificateScanResponseSchema.safeParse(response.result);
  if (!parsed.success) {
    logger.warn(
      { issues: parsed.error.issues },
      `Windows certificate scan result did not match the expected shape [connectionId=${host.connectionId}]`
    );
    throw new BadRequestError({ message: "The gateway returned a scan result that could not be read" });
  }
  return parsed.data;
};

export const storeCertificatePath = (store: string, thumbprint: string) =>
  `Cert:\\${WINDOWS_STORE_LOCATION}\\${store}\\${thumbprint}`;

const buildStoreLocationDetails = (
  host: TScannedWindowsHost,
  cert: TWindowsStoreCertificate,
  store: WindowsCertificateStore
): TPkiInstallationLocationDetails => ({
  hostIdentifier: host.hostIdentifier,
  connectionId: host.connectionId,
  ...(net.isIP(host.hostAddress) !== 0 && { ipAddress: host.hostAddress }),
  ...(host.hostname && { hostname: host.hostname }),
  storeLocation: WINDOWS_STORE_LOCATION,
  storeName: store,
  thumbprint: cert.thumbprint,
  hasPrivateKey: cert.hasPrivateKey,
  gatewayName: host.gatewayName
});

const isWindowsCertificateStore = (store: string): store is WindowsCertificateStore =>
  (Object.values(WindowsCertificateStore) as string[]).includes(store);

export const resolveStoreChains = (cert: TWindowsStoreCertificate, pool: Buffer[], importStandaloneCa: boolean) =>
  (cert.chains ?? [])
    .filter((chain) => chain.kind === HostCertificateChainKind.Leaf || importStandaloneCa)
    .filter((chain) => chain.indexes.length > 0 && chain.indexes.every((idx) => idx < pool.length))
    .map((chain) => chain.indexes.map((idx) => pool[idx]));

export const writeStoreCertificate = async (
  host: TScannedWindowsHost,
  cert: TWindowsStoreCertificate,
  pool: Buffer[],
  ctx: TWriteContext,
  deps: THostScanDeps
): Promise<{ installationId?: string; certificateIds: string[] }> => {
  if (cert.status !== HostCertificateFileStatus.Ok || !isWindowsCertificateStore(cert.store)) {
    return { certificateIds: [] };
  }
  const chains = resolveStoreChains(cert, pool, ctx.importStandaloneCaCertificates);
  if (chains.length === 0) return { certificateIds: [] };

  const path = storeCertificatePath(cert.store, cert.thumbprint);
  const fingerprint = computeLocationFingerprint(
    PkiInstallationLocationType.OsStore,
    { hostIdentifier: host.hostIdentifier, filePath: path },
    host.fingerprintGatewayKey
  );

  const certificateIds = await importCertificateChains(
    chains,
    {
      hostIdentifier: host.hostIdentifier,
      hostname: host.hostname,
      storeLocation: WINDOWS_STORE_LOCATION,
      storeName: cert.store,
      thumbprint: cert.thumbprint
    },
    ctx,
    deps
  );

  const installationId = await upsertInstallationWithLinks(
    {
      fingerprint,
      locationType: PkiInstallationLocationType.OsStore,
      locationDetails: buildStoreLocationDetails(host, cert, cert.store),
      name: buildHostInstallationName(host.hostIdentifier, host.hostname, path),
      certificateIds,
      refreshOnly: false
    },
    ctx,
    deps
  );
  return { installationId, certificateIds };
};

const MAX_LISTED_UNREADABLE = 5;

const STORE_NAMES: Record<string, string> = {
  [WindowsCertificateStore.Personal]: "Personal",
  [WindowsCertificateStore.WebHosting]: "Web Hosting",
  [WindowsCertificateStore.RemoteDesktop]: "Remote Desktop",
  [WindowsCertificateStore.IntermediateCertificationAuthorities]: "Intermediate Certification Authorities",
  [WindowsCertificateStore.TrustedRootCertificationAuthorities]: "Trusted Root Certification Authorities"
};

export const summarizeWindowsScanIssues = (
  hostIdentifier: string,
  response: TWindowsCertificateScanResponse
): string[] => {
  const issues: string[] = [];
  const denied = response.deniedStores ?? [];
  if (denied.length > 0) {
    issues.push(
      `${hostIdentifier}: The connection's user can't open these certificate stores: ${denied
        .map((store) => STORE_NAMES[store] ?? store)
        .join(", ")}`
    );
  }
  const unreadable = (response.certificates ?? []).filter((cert) => cert.status !== HostCertificateFileStatus.Ok);
  if (unreadable.length > 0) {
    const listed = unreadable
      .slice(0, MAX_LISTED_UNREADABLE)
      .map((cert) => `${STORE_NAMES[cert.store] ?? cert.store} (${cert.thumbprint})`);
    const more = unreadable.length - listed.length;
    issues.push(
      `${hostIdentifier}: These certificates could not be read: ${listed.join(", ")}${more > 0 ? ` and ${more} more` : ""}`
    );
  }
  const unreadableIssuers = response.unreadableIssuerStores ?? [];
  if (unreadableIssuers.length > 0) {
    issues.push(
      `${hostIdentifier}: The connection's user can't open ${unreadableIssuers
        .map((store) => STORE_NAMES[store] ?? store)
        .join(", ")}, so some certificate chains may be incomplete`
    );
  }
  const truncatedIssuers = response.truncatedIssuerStores ?? [];
  if (truncatedIssuers.length > 0) {
    issues.push(
      `${hostIdentifier}: ${truncatedIssuers
        .map((store) => STORE_NAMES[store] ?? store)
        .join(
          ", "
        )} holds more certificates than the scan reads for chains, so some certificate chains may be incomplete`
    );
  }
  if (response.truncatedReason === HostScanTruncationReason.MaxFiles) {
    issues.push(
      `${hostIdentifier}: The scan stopped after ${MAX_WINDOWS_SCAN_CERTIFICATES.toLocaleString("en-US")} certificates`
    );
  } else if (response.truncatedReason === HostScanTruncationReason.TimeLimit) {
    issues.push(
      `${hostIdentifier}: The scan ran out of time, so some certificates were not checked. Select fewer certificate stores.`
    );
  } else if (response.truncatedReason === HostScanTruncationReason.ResponseSize) {
    issues.push(
      `${hostIdentifier}: The scan found more certificates than one scan can return. Select fewer certificate stores.`
    );
  } else if (response.truncatedReason) {
    issues.push(`${hostIdentifier}: The scan stopped early, so some certificates were not checked`);
  }
  return issues;
};

const scanWindowsConnection = async (
  connection: TAppConnectionRow | undefined,
  label: string,
  run: THostScanRun<TWindowsServerTargetConfig>,
  deps: THostScanDeps
): Promise<THostScanOutcome> => {
  let hostLabel = label;
  const issues: string[] = [];
  try {
    const host = await resolveWindowsHost(connection, run.orgId, deps);
    hostLabel = host.hostIdentifier;
    const response = await withConnectionScanSlot(host.connectionId, WINDOWS_CONNECTION_KIND, deps, () =>
      runWindowsCertificateScan(host, run.targetConfig.certificateStores, deps)
    );
    issues.push(...summarizeWindowsScanIssues(host.hostIdentifier, response));

    const scannedHost = { ...host, hostname: response.host.hostname };
    const pool = (response.pool ?? []).map((der) => Buffer.from(der, "base64"));
    await run.writeLimit(async () => {
      for (const cert of response.certificates ?? []) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const result = await writeStoreCertificate(scannedHost, cert, pool, run.ctx, deps);
          if (result.installationId) run.installationIds.add(result.installationId);
          result.certificateIds.forEach((id) => run.certificateIds.add(id));
        } catch (error) {
          const message = toHostScanErrorMessage(
            error,
            `Windows Server discovery certificate import failed [discoveryId=${run.discoveryId}] [host=${host.hostIdentifier}] [store=${cert.store}] [thumbprint=${cert.thumbprint}]`
          );
          issues.push(
            `${host.hostIdentifier} (${STORE_NAMES[cert.store] ?? cert.store} ${cert.thumbprint}): ${message}`
          );
        }
      }
    });
    return { issues };
  } catch (error) {
    const message = toHostScanErrorMessage(
      error,
      `Windows Server discovery host failed [discoveryId=${run.discoveryId}] [connection=${label}]`
    );
    return { issues, failure: { label: hostLabel, message } };
  }
};

export const executeWindowsServerScan = (discoveryId: string, deps: THostScanDeps): Promise<void> =>
  executeHostScan<TWindowsServerTargetConfig>(
    discoveryId,
    { discoveryType: PkiDiscoveryType.WindowsServer, label: "Windows Server", scanConnection: scanWindowsConnection },
    deps
  );
