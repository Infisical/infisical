import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { CertStatus } from "@app/hooks/api/certificates/enums";
import type { TCertificate } from "@app/hooks/api/certificates/types";
import {
  CertificateSyncStatus,
  PkiSync,
  PkiSyncExportFormat,
  PkiSyncStatus
} from "@app/hooks/api/pkiSyncs/enums";
import type {
  TPkiSync,
  TPkiSyncCertificate,
  TPkiSyncFilters,
  TPkiSyncOption,
  TPkiSyncPreviewCertificate
} from "@app/hooks/api/pkiSyncs/types";
import { F5BigIpProfileType } from "@app/hooks/api/pkiSyncs/types/f5-big-ip-sync";
import { GcpCertificateManagerScope } from "@app/hooks/api/pkiSyncs/types/gcp-certificate-manager-sync";

import { demoCertificates } from "../certificates/demo";
import { createFixtureStore, fixtureMutation } from "../fixture-store";
import { DEMO_PROJECT_ID, demoApplications } from "../pki-applications/demo-store";
import type { PkiSyncsAdapter, TPkiSyncConnectionOption } from "./contract";

const ready = <T>(data: T) => ({ data, isPending: false, error: null });
const idle = <T>(enabled: boolean | undefined, data: T) =>
  enabled === false ? { data: undefined, isPending: true, error: null } : ready(data);
const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const now = () => new Date().toISOString();

const appId = (name: string) =>
  demoApplications.get().find((application) => application.name === name)?.id ?? name;
const PAYMENTS = appId("payments-api");
const PLATFORM = appId("platform-core");
const DASHBOARD = appId("web-dashboard");

const option = (
  destination: PkiSync,
  name: string,
  extra: Partial<TPkiSyncOption> = {}
): TPkiSyncOption => ({
  name,
  destination,
  canImportCertificates: false,
  canRemoveCertificates: true,
  canRunPostSyncCommand: false,
  canRunHealthCheckCommand: false,
  defaultCertificateNameSchema: "Infisical-{{certificateId}}",
  ...extra
});

const syncOptions = createFixtureStore<TPkiSyncOption[]>([
  option(PkiSync.AwsCertificateManager, "AWS Certificate Manager"),
  option(PkiSync.AwsElasticLoadBalancer, "AWS Elastic Load Balancer", {
    defaultCertificateNameSchema: undefined
  }),
  option(PkiSync.AwsSecretsManager, "AWS Secrets Manager", {
    defaultCertificateNameSchema: "infisical-{{certificateId}}"
  }),
  option(PkiSync.AzureKeyVault, "Azure Key Vault", {
    defaultCertificateNameSchema: "Infisical-PKI-Sync-{{certificateId}}"
  }),
  option(PkiSync.Chef, "Chef", { defaultCertificateNameSchema: undefined }),
  option(PkiSync.CloudflareCustomCertificate, "Cloudflare Custom SSL Certificate"),
  option(PkiSync.F5BigIp, "F5 BIG-IP"),
  option(PkiSync.GcpCertificateManager, "GCP Certificate Manager", {
    defaultCertificateNameSchema: "infisical-{{certificateId}}"
  }),
  option(PkiSync.Imperva, "Imperva", {
    defaultCertificateNameSchema: undefined,
    maxCertificates: 1
  }),
  option(PkiSync.KempLoadMaster, "Kemp LoadMaster"),
  option(PkiSync.LinuxServer, "Linux Server", {
    canRunPostSyncCommand: true,
    canRunHealthCheckCommand: true,
    defaultCertificateNameSchema: "{{commonName}}"
  }),
  option(PkiSync.NetScaler, "NetScaler"),
  option(PkiSync.NutanixPrismCentral, "Nutanix Prism Central", {
    canRemoveCertificates: false,
    defaultCertificateNameSchema: undefined,
    maxCertificates: 1
  }),
  option(PkiSync.PaloAltoNetworks, "Palo Alto Networks", {
    forbiddenCharacters: " ",
    maxCertificateNameLength: 31,
    minCertificateNameLength: 1
  }),
  option(PkiSync.PaloAltoNetworksSslTlsProfile, "Palo Alto Networks SSL/TLS Profile", {
    forbiddenCharacters: " ",
    maxCertificateNameLength: 31,
    minCertificateNameLength: 1,
    maxCertificates: 1
  }),
  option(PkiSync.WindowsServer, "Windows Server", {
    canRunPostSyncCommand: true,
    canRunHealthCheckCommand: true,
    defaultCertificateNameSchema: "{{commonName}}",
    unsupportedExportFormats: [PkiSyncExportFormat.Jks]
  })
]);

const connections: TPkiSyncConnectionOption[] = [
  {
    id: "4d2e9a71-3b6c-4f08-9e15-a7c3d1b8f201",
    name: "aws-prod",
    projectId: DEMO_PROJECT_ID,
    app: AppConnection.AWS
  },
  {
    id: "4d2e9a71-3b6c-4f08-9e15-a7c3d1b8f202",
    name: "aws-staging",
    projectId: DEMO_PROJECT_ID,
    app: AppConnection.AWS
  },
  {
    id: "4d2e9a71-3b6c-4f08-9e15-a7c3d1b8f203",
    name: "azure-payments",
    projectId: DEMO_PROJECT_ID,
    app: AppConnection.AzureKeyVault
  },
  {
    id: "4d2e9a71-3b6c-4f08-9e15-a7c3d1b8f204",
    name: "cloudflare-acme",
    projectId: DEMO_PROJECT_ID,
    app: AppConnection.Cloudflare
  },
  {
    id: "4d2e9a71-3b6c-4f08-9e15-a7c3d1b8f205",
    name: "gcp-edge",
    projectId: DEMO_PROJECT_ID,
    app: AppConnection.GCP
  },
  {
    id: "4d2e9a71-3b6c-4f08-9e15-a7c3d1b8f206",
    name: "f5-dc1",
    projectId: DEMO_PROJECT_ID,
    app: AppConnection.F5BigIp
  },
  {
    id: "4d2e9a71-3b6c-4f08-9e15-a7c3d1b8f207",
    name: "web-tier-ssh",
    projectId: DEMO_PROJECT_ID,
    app: AppConnection.SSH
  },
  {
    id: "4d2e9a71-3b6c-4f08-9e15-a7c3d1b8f208",
    name: "corp-directory",
    projectId: DEMO_PROJECT_ID,
    app: AppConnection.LDAP
  },
  {
    id: "4d2e9a71-3b6c-4f08-9e15-a7c3d1b8f209",
    name: "iis-winrm",
    projectId: DEMO_PROJECT_ID,
    app: AppConnection.WinRM
  },
  {
    id: "4d2e9a71-3b6c-4f08-9e15-a7c3d1b8f20a",
    name: "panorama-hq",
    projectId: DEMO_PROJECT_ID,
    app: AppConnection.PaloAltoNetworks
  },
  {
    id: "4d2e9a71-3b6c-4f08-9e15-a7c3d1b8f20b",
    name: "chef-infra",
    projectId: DEMO_PROJECT_ID,
    app: AppConnection.Chef
  },
  {
    id: "4d2e9a71-3b6c-4f08-9e15-a7c3d1b8f20c",
    name: "kemp-lb01",
    projectId: DEMO_PROJECT_ID,
    app: AppConnection.KempLoadMaster
  },
  {
    id: "4d2e9a71-3b6c-4f08-9e15-a7c3d1b8f20d",
    name: "imperva-waf",
    projectId: DEMO_PROJECT_ID,
    app: AppConnection.Imperva
  },
  {
    id: "4d2e9a71-3b6c-4f08-9e15-a7c3d1b8f20e",
    name: "netscaler-adc",
    projectId: DEMO_PROJECT_ID,
    app: AppConnection.NetScaler
  },
  {
    id: "4d2e9a71-3b6c-4f08-9e15-a7c3d1b8f20f",
    name: "prism-central",
    projectId: DEMO_PROJECT_ID,
    app: AppConnection.NutanixPrismCentral
  }
];

const connectionNamed = (name: string) => connections.find((entry) => entry.name === name)!;

const sync = (
  id: string,
  applicationId: string | null,
  name: string,
  destination: PkiSync,
  connectionName: string,
  destinationConfig: Record<string, unknown>,
  status: PkiSyncStatus | null,
  syncedHoursAgo: number | null,
  extra: Partial<TPkiSync> = {}
) => {
  const connection = connectionNamed(connectionName);
  return {
    id,
    name,
    description: null,
    destination,
    destinationConfig,
    connectionId: connection.id,
    createdAt: ago(24 * 60),
    updatedAt: ago(24 * 2),
    isAutoSyncEnabled: true,
    projectId: DEMO_PROJECT_ID,
    applicationId,
    syncStatus: status,
    lastSyncJobId: null,
    lastSyncedAt: syncedHoursAgo === null ? null : ago(syncedHoursAgo),
    lastSyncMessage: null,
    lastHealthCheckRanAt: null,
    lastHealthCheckStatus: null,
    lastHealthCheckMessage: null,
    importStatus: null,
    lastImportJobId: null,
    lastImportedAt: null,
    lastImportMessage: null,
    removeStatus: null,
    lastRemoveJobId: null,
    lastRemovedAt: null,
    lastRemoveMessage: null,
    syncOptions: {
      canImportCertificates: false,
      canRemoveCertificates: true,
      certificateNameSchema: "Infisical-{{certificateId}}"
    },
    connection: { app: connection.app, id: connection.id, name: connection.name },
    appConnectionName: connection.name,
    appConnectionApp: connection.app,
    filters: { profileIds: ["4a6c2e81-0b3d-4f57-8e19-7d2a5c0f3b64"] },
    ...extra
  } as TPkiSync;
};

const SYNC_IDS = {
  acm: "sync-3b8e1f2a-6c4d-4e9a-b7f0-5d1c2e3a4b61",
  keyVault: "sync-3b8e1f2a-6c4d-4e9a-b7f0-5d1c2e3a4b62",
  cloudflare: "sync-3b8e1f2a-6c4d-4e9a-b7f0-5d1c2e3a4b63",
  linux: "sync-3b8e1f2a-6c4d-4e9a-b7f0-5d1c2e3a4b64",
  gcp: "sync-3b8e1f2a-6c4d-4e9a-b7f0-5d1c2e3a4b65",
  f5: "sync-3b8e1f2a-6c4d-4e9a-b7f0-5d1c2e3a4b66",
  secretsManager: "sync-3b8e1f2a-6c4d-4e9a-b7f0-5d1c2e3a4b67",
  windows: "sync-3b8e1f2a-6c4d-4e9a-b7f0-5d1c2e3a4b68"
};

export const demoPkiSyncs = createFixtureStore<TPkiSync[]>([
  sync(
    SYNC_IDS.acm,
    PAYMENTS,
    "payments-acm-us-east-1",
    PkiSync.AwsCertificateManager,
    "aws-prod",
    { region: "us-east-1" },
    PkiSyncStatus.Succeeded,
    2,
    {
      syncOptions: {
        canImportCertificates: false,
        canRemoveCertificates: true,
        preserveArn: true,
        certificateNameSchema: "Infisical-{{certificateId}}"
      }
    }
  ),
  sync(
    SYNC_IDS.keyVault,
    PAYMENTS,
    "payments-keyvault",
    PkiSync.AzureKeyVault,
    "azure-payments",
    { vaultBaseUrl: "https://payments-prod.vault.azure.net" },
    PkiSyncStatus.Failed,
    26,
    {
      description: "Checkout certificates for the Azure Front Door origin",
      lastSyncMessage: "The service principal is missing the Key Vault Certificates Officer role"
    }
  ),
  sync(
    SYNC_IDS.cloudflare,
    PLATFORM,
    "platform-edge-cloudflare",
    PkiSync.CloudflareCustomCertificate,
    "cloudflare-acme",
    { zoneId: "acme.dev" },
    PkiSyncStatus.Running,
    0
  ),
  sync(
    SYNC_IDS.linux,
    PLATFORM,
    "nginx-web-tier",
    PkiSync.LinuxServer,
    "web-tier-ssh",
    { destinationPath: "/etc/nginx/certs" },
    PkiSyncStatus.Succeeded,
    5,
    {
      isAutoSyncEnabled: false,
      syncOptions: {
        canImportCertificates: false,
        canRemoveCertificates: true,
        certificateNameSchema: "{{commonName}}",
        healthCheckCommand: "nginx -t",
        postSyncCommand: "systemctl reload nginx"
      } as TPkiSync["syncOptions"]
    }
  ),
  sync(
    SYNC_IDS.gcp,
    DASHBOARD,
    "dashboard-gcp-global",
    PkiSync.GcpCertificateManager,
    "gcp-edge",
    {
      gcpProjectId: "acme-edge-prod",
      location: "global",
      scope: GcpCertificateManagerScope.Default,
      certificateMapBinding: { certificateMap: "dashboard-map", hostname: "dashboard.acme.dev" }
    },
    PkiSyncStatus.Succeeded,
    30
  ),
  sync(
    SYNC_IDS.f5,
    null,
    "dc1-bigip-legacy",
    PkiSync.F5BigIp,
    "f5-dc1",
    {
      partition: "Common",
      profileType: F5BigIpProfileType.ClientSsl,
      profileName: "clientssl-acme",
      createProfileIfMissing: true
    },
    null,
    null,
    {
      removeStatus: PkiSyncStatus.Failed,
      lastRemoveMessage: "Profile clientssl-acme is still attached to virtual server vs_api_443",
      lastRemovedAt: ago(70)
    }
  ),
  sync(
    SYNC_IDS.secretsManager,
    null,
    "billing-secrets-manager",
    PkiSync.AwsSecretsManager,
    "aws-staging",
    { region: "eu-west-1" },
    PkiSyncStatus.Pending,
    48,
    {
      syncOptions: {
        canImportCertificates: false,
        canRemoveCertificates: true,
        certificateNameSchema: "infisical-{{certificateId}}",
        fieldMappings: {
          certificate: "certificate",
          privateKey: "private_key",
          certificateChain: "certificate_chain",
          caCertificate: "ca_certificate"
        }
      }
    }
  ),
  sync(
    SYNC_IDS.windows,
    PAYMENTS,
    "iis-checkout-servers",
    PkiSync.WindowsServer,
    "iis-winrm",
    { destinationPath: "C:\\certs\\checkout" },
    PkiSyncStatus.Succeeded,
    9,
    {
      syncOptions: {
        canImportCertificates: false,
        canRemoveCertificates: true,
        certificateNameSchema: "{{commonName}}",
        exportFormat: PkiSyncExportFormat.Pkcs12,
        includePrivateKey: true
      } as TPkiSync["syncOptions"]
    }
  )
]);

const previewPool: TPkiSyncPreviewCertificate[] = [
  {
    id: "0f6b2d84-1e9a-4c37-b5d2-8a3e7c1f9d06",
    commonName: "api.acme.dev",
    altNames: "api.acme.dev, api-internal.acme.dev",
    serialNumber: "4F:A1:9C:2B:7E:11:D0:E2",
    notAfter: ago(-84 * 24),
    orderId: "9a1c3e5f-7b2d-4e6a-8c0f-1d3b5a7c9e01",
    profileName: "tls-server"
  },
  {
    id: "6c1e8a3f-4b2d-4f90-8e75-d03a9b6c2e41",
    commonName: "payments.acme.dev",
    altNames: "payments.acme.dev, checkout.acme.dev",
    serialNumber: "61:0B:E4:93:5A:C7:28:4D",
    notAfter: ago(-13 * 24),
    orderId: "9a1c3e5f-7b2d-4e6a-8c0f-1d3b5a7c9e02",
    profileName: "tls-server"
  },
  {
    id: "d84c1b6e-2f73-4a95-b0e8-7c5a3d9f1e26",
    commonName: "dashboard.acme.dev",
    altNames: "dashboard.acme.dev, app.acme.dev",
    serialNumber: "7D:3E:20:AF:C4:59:1B:86",
    notAfter: ago(-40 * 24),
    orderId: "9a1c3e5f-7b2d-4e6a-8c0f-1d3b5a7c9e03",
    profileName: "tls-server"
  },
  {
    id: "8e4a1c07-2b9d-4f63-a5e0-6d3c9f1b7a42",
    commonName: "pq-gateway.acme.dev",
    altNames: "pq-gateway.acme.dev",
    serialNumber: "A4:2D:91:6F:0C:B8:E3:57",
    notAfter: ago(-25 * 24),
    orderId: "9a1c3e5f-7b2d-4e6a-8c0f-1d3b5a7c9e04",
    profileName: "tls-server"
  }
];

const syncCertificate = (
  pkiSyncId: string,
  certificate: TPkiSyncPreviewCertificate,
  status: CertificateSyncStatus,
  extra: Partial<TPkiSyncCertificate> = {}
): TPkiSyncCertificate => ({
  id: `${pkiSyncId}-${certificate.id}`,
  pkiSyncId,
  certificateId: certificate.id,
  syncStatus: status,
  lastSyncMessage: null,
  lastSyncedAt: ago(2),
  createdAt: ago(24 * 30),
  updatedAt: ago(2),
  certificateSerialNumber: certificate.serialNumber,
  certificateCommonName: certificate.commonName,
  certificateOrderId: certificate.orderId,
  certificateAltNames: certificate.altNames ?? undefined,
  certificateStatus: CertStatus.ACTIVE,
  certificateNotBefore: new Date(ago(24 * 200)),
  certificateNotAfter: certificate.notAfter ? new Date(certificate.notAfter) : undefined,
  certificateRenewBeforeDays: 30,
  externalIdentifier: `Infisical-${certificate.id.slice(0, 8)}`,
  syncMetadata: null,
  ...extra
});

const syncCertificates = createFixtureStore<TPkiSyncCertificate[]>([
  syncCertificate(SYNC_IDS.acm, previewPool[0], CertificateSyncStatus.Succeeded),
  syncCertificate(SYNC_IDS.acm, previewPool[1], CertificateSyncStatus.Succeeded),
  syncCertificate(SYNC_IDS.keyVault, previewPool[1], CertificateSyncStatus.Failed, {
    lastSyncMessage: "Forbidden: the caller is not authorized to perform action on resource"
  }),
  syncCertificate(SYNC_IDS.cloudflare, previewPool[3], CertificateSyncStatus.Running),
  syncCertificate(SYNC_IDS.linux, previewPool[0], CertificateSyncStatus.Succeeded),
  syncCertificate(SYNC_IDS.linux, previewPool[3], CertificateSyncStatus.Succeeded),
  syncCertificate(SYNC_IDS.gcp, previewPool[2], CertificateSyncStatus.Succeeded, {
    syncMetadata: { isDefault: true }
  }),
  syncCertificate(SYNC_IDS.windows, previewPool[1], CertificateSyncStatus.Succeeded)
]);

const previewCertificates = (
  certificates: TCertificate[],
  filters?: TPkiSyncFilters | null,
  applicationId?: string | null
): TPkiSyncPreviewCertificate[] => {
  if (
    !filters?.profileIds?.length &&
    !filters?.certificateOrderIds?.length &&
    !filters?.metadata?.length
  )
    return [];
  const applicationName = demoApplications.get().find((entry) => entry.id === applicationId)?.name;
  const profileIds = new Set(filters.profileIds);
  const orderIds = new Set(filters.certificateOrderIds);
  return certificates
    .filter((cert) => !cert.deletedAt)
    .filter(
      (cert) =>
        !applicationId ||
        cert.applicationId === applicationId ||
        (Boolean(applicationName) && cert.applicationName === applicationName)
    )
    .filter((cert) => !profileIds.size || profileIds.has(cert.profileId ?? ""))
    .filter((cert) => !orderIds.size || orderIds.has(cert.orderId ?? ""))
    .filter((cert) =>
      (filters.metadata ?? []).every(({ key, value }) =>
        cert.metadata?.some((entry) => entry.key === key && (!value || entry.value === value))
      )
    )
    .map((cert) => ({
      id: cert.id,
      commonName: cert.commonName,
      altNames: cert.altNames,
      serialNumber: cert.serialNumber,
      notAfter: cert.notAfter,
      orderId: cert.orderId,
      profileName: cert.profileName
    }));
};

const updateSync = (syncId: string, change: Record<string, unknown>) =>
  demoPkiSyncs.update((current) =>
    current.map((entry) =>
      entry.id === syncId ? ({ ...entry, ...change, updatedAt: now() } as TPkiSync) : entry
    )
  );

const findSync = (syncId: string) => demoPkiSyncs.get().find((entry) => entry.id === syncId);

const relinkFilteredCertificates = (syncId: string, status?: CertificateSyncStatus) => {
  const target = findSync(syncId);
  if (!target?.filters) return;
  const matched = previewCertificates(demoCertificates.get(), target.filters, target.applicationId);
  syncCertificates.update((current) => {
    const existing = new Map(
      current
        .filter((entry) => entry.pkiSyncId === syncId)
        .map((entry) => [entry.certificateId, entry])
    );
    return [
      ...current.filter((entry) => entry.pkiSyncId !== syncId),
      ...matched.map((cert) => {
        const row =
          existing.get(cert.id) ?? syncCertificate(syncId, cert, CertificateSyncStatus.Pending);
        return status ? { ...row, syncStatus: status, lastSyncedAt: now(), updatedAt: now() } : row;
      })
    ];
  });
};

const healthCheck = (status: PkiSyncStatus, output: string) => ({
  status,
  exitCode: status === PkiSyncStatus.Succeeded ? 0 : 1,
  durationMs: 412,
  output
});

const loadBalancerArn =
  "arn:aws:elasticloadbalancing:us-east-1:111122223333:loadbalancer/app/payments-public/50dc6c495c0c9188";

export const pkiSyncsDemo: PkiSyncsAdapter = {
  useSyncs: (_projectId, options) => {
    const all = demoPkiSyncs.use();
    return idle(
      options?.enabled,
      options?.applicationId
        ? all.filter((entry) => entry.applicationId === options.applicationId)
        : all
    );
  },
  useSyncsWithCertificate: (_projectId, certificateId, options, applicationId) => {
    const all = demoPkiSyncs.use();
    const links = syncCertificates.use();
    return idle(
      options?.enabled ?? Boolean(certificateId),
      all
        .filter((entry) => !applicationId || entry.applicationId === applicationId)
        .map((entry) => ({
          ...entry,
          hasCertificate: links.some(
            (link) => link.pkiSyncId === entry.id && link.certificateId === certificateId
          )
        }))
    );
  },
  useSync: ({ syncId }) => {
    const found = demoPkiSyncs.use().find((entry) => entry.id === syncId);
    return found
      ? ready(found)
      : { data: undefined, isPending: false, error: new Error("Not found") };
  },
  useSyncOptions: () => ready(syncOptions.use()),
  useSyncCertificates: (syncId, pagination) => {
    const { offset = 0, limit = 20 } = pagination ?? {};
    const rows = syncCertificates.use().filter((entry) => entry.pkiSyncId === syncId);
    return ready({ certificates: rows.slice(offset, offset + limit), totalCount: rows.length });
  },
  usePreviewCertificates: ({ applicationId, filters, offset = 0, limit = 20, enabled }) => {
    const matched = previewCertificates(demoCertificates.use(), filters, applicationId);
    return {
      ...idle(enabled, {
        certificates: matched.slice(offset, offset + limit),
        totalCount: matched.length,
        toUnlink: [],
        willRemoveFromDestination: false
      }),
      refetch: async () => undefined,
      isFetching: false
    };
  },
  useCertificateOrders: ({ certificateOrderIds }) => {
    const ids = new Set(certificateOrderIds);
    return ready(
      new Map(
        demoCertificates
          .use()
          .filter((entry) => entry.orderId && ids.has(entry.orderId))
          .map((entry) => [entry.orderId!, entry.commonName])
      )
    );
  },
  useAvailableConnections: (apps) => {
    const wanted = new Set(apps);
    return { connections: connections.filter((entry) => wanted.has(entry.app)), isPending: false };
  },
  useAwsLoadBalancers: (_args, options) =>
    idle(options?.enabled, [
      {
        loadBalancerArn,
        loadBalancerName: "payments-public",
        type: "application",
        scheme: "internet-facing",
        state: "active"
      },
      {
        loadBalancerArn: loadBalancerArn.replace("payments-public", "internal-grpc"),
        loadBalancerName: "internal-grpc",
        type: "network",
        scheme: "internal",
        state: "active"
      }
    ]),
  useAwsListeners: (args, options) =>
    idle(options?.enabled, [
      {
        listenerArn: `${args.loadBalancerArn}/listener-443`,
        port: 443,
        protocol: "HTTPS",
        loadBalancerArn: args.loadBalancerArn,
        sslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06"
      },
      {
        listenerArn: `${args.loadBalancerArn}/listener-8443`,
        port: 8443,
        protocol: "HTTPS",
        loadBalancerArn: args.loadBalancerArn,
        sslPolicy: "ELBSecurityPolicy-TLS13-1-2-2021-06"
      }
    ]),
  useKempVirtualServices: (_args, options) =>
    idle(options?.enabled, [
      { id: "1", name: "web-https", address: "10.20.0.15", port: 443, protocol: "tcp" },
      { id: "2", name: "api-https", address: "10.20.0.16", port: 443, protocol: "tcp" }
    ]),
  useImpervaSites: (_args, options) =>
    idle(options?.enabled, [
      { id: "84211907", name: "www.acme.dev", status: "fully-configured" },
      { id: "84211908", name: "shop.acme.dev", status: "fully-configured" }
    ]),
  useCloudflareZones: (_connectionId, options) =>
    idle(options?.enabled, [
      { id: "acme.dev", name: "acme.dev" },
      { id: "acme-status.io", name: "acme-status.io" }
    ]),
  usePaloAltoTemplates: (connectionId, options) =>
    idle(options?.enabled ?? Boolean(connectionId), {
      isPanorama: true,
      templates: ["branch-firewalls", "datacenter-edge"]
    }),
  usePaloAltoSslTlsProfiles: (_connectionId, _template, options) =>
    idle(options?.enabled, [
      { name: "mgmt-ui-profile", vsys: null },
      { name: "globalprotect-portal", vsys: "vsys1" }
    ]),
  usePaloAltoCertificates: () =>
    ready([
      { name: "acme-wildcard-2025", vsys: null },
      { name: "globalprotect-fallback", vsys: "vsys1" }
    ]),
  useNutanixClusters: (_connectionId, options) =>
    idle(options?.enabled, [
      { id: "0005f2a1-6c3e-4b7d-9e10-2a4c6e8b0d11", name: "prod-ahv-cluster" },
      { id: "0005f2a1-6c3e-4b7d-9e10-2a4c6e8b0d12", name: "dr-ahv-cluster" }
    ]),
  useLdapMachines: (_connectionId, search, options) =>
    idle(
      options?.enabled,
      ["web01.corp.acme.dev", "web02.corp.acme.dev", "iis-checkout01.corp.acme.dev"]
        .filter((hostname) => !search || hostname.includes(search))
        .map((hostname) => ({ hostname }))
    ),
  useGcpProjects: (_connectionId, options) =>
    idle(options?.enabled, [
      { id: "acme-edge-prod", name: "Acme Edge Prod" },
      { id: "acme-edge-staging", name: "Acme Edge Staging" }
    ]),
  useGcpLocations: (_args, options) =>
    idle(options?.enabled, [
      { locationId: "global", displayName: "Global" },
      { locationId: "us-central1", displayName: "Iowa" },
      { locationId: "europe-west1", displayName: "Belgium" }
    ]),
  useGcpCertificateMaps: (_args, options) =>
    idle(options?.enabled, [
      { name: "dashboard-map", description: "Web dashboard load balancer" },
      { name: "api-map" }
    ]),
  useCreateSync: fixtureMutation(({ destination, connectionId, destinationConfig, ...dto }) => {
    const connection = connections.find((entry) => entry.id === connectionId) ?? connections[0];
    const created = {
      ...sync(
        crypto.randomUUID(),
        dto.applicationId ?? null,
        dto.name,
        destination,
        connection.name,
        destinationConfig,
        null,
        null
      ),
      description: dto.description ?? null,
      isAutoSyncEnabled: dto.isAutoSyncEnabled,
      syncOptions: dto.syncOptions,
      filters: dto.filters ?? null,
      createdAt: now()
    } as TPkiSync;
    demoPkiSyncs.update((current) => [created, ...current]);
    relinkFilteredCertificates(created.id);
    return created;
  }),
  useUpdateSync: fixtureMutation(
    ({ syncId, projectId: _projectId, removalOptions: _removal, connectionId, ...dto }) => {
      const connection = connectionId
        ? connections.find((entry) => entry.id === connectionId)
        : undefined;
      updateSync(syncId, {
        ...dto,
        ...(connection
          ? {
              connectionId: connection.id,
              connection: { app: connection.app, id: connection.id, name: connection.name },
              appConnectionName: connection.name
            }
          : {})
      });
      if ("filters" in dto) relinkFilteredCertificates(syncId);
      return findSync(syncId)!;
    }
  ),
  useDeleteSync: fixtureMutation(({ syncId }) => {
    demoPkiSyncs.update((current) => current.filter((entry) => entry.id !== syncId));
    return { syncId };
  }),
  useTriggerSync: fixtureMutation(({ syncId }) => {
    relinkFilteredCertificates(syncId, CertificateSyncStatus.Succeeded);
    updateSync(syncId, {
      syncStatus: PkiSyncStatus.Succeeded,
      lastSyncedAt: now(),
      lastSyncMessage: null
    });
    return { syncId };
  }),
  useTriggerImport: fixtureMutation(({ syncId }) => {
    updateSync(syncId, { importStatus: PkiSyncStatus.Succeeded, lastImportedAt: now() });
    return { syncId };
  }),
  useTriggerRemove: fixtureMutation(({ syncId }) => {
    updateSync(syncId, {
      removeStatus: PkiSyncStatus.Succeeded,
      lastRemovedAt: now(),
      lastRemoveMessage: null
    });
    syncCertificates.update((current) => current.filter((entry) => entry.pkiSyncId !== syncId));
    return { syncId };
  }),
  useTestHealthCheck: fixtureMutation(() =>
    healthCheck(
      PkiSyncStatus.Succeeded,
      "nginx: configuration file /etc/nginx/nginx.conf test is successful"
    )
  ),
  useRunHealthCheck: fixtureMutation(({ syncId }) => {
    updateSync(syncId, {
      lastHealthCheckRanAt: now(),
      lastHealthCheckStatus: PkiSyncStatus.Succeeded,
      lastHealthCheckMessage: null
    });
    return healthCheck(
      PkiSyncStatus.Succeeded,
      "nginx: configuration file /etc/nginx/nginx.conf test is successful"
    );
  }),
  usePreviewFilters: fixtureMutation(({ pkiSyncId, filters }) => {
    const certificates = previewCertificates(
      demoCertificates.get(),
      filters,
      findSync(pkiSyncId)?.applicationId
    );
    return {
      matchedCount: certificates.length,
      certificates,
      toUnlink: [],
      toUnlinkAtDestinationCount: 0,
      willRemoveFromDestination: false
    };
  }),
  useAddCertificates: fixtureMutation(({ pkiSyncId, certificateIds }) => {
    const ids = new Set(certificateIds);
    const added = previewPool
      .filter((entry) => ids.has(entry.id))
      .map((entry) => syncCertificate(pkiSyncId, entry, CertificateSyncStatus.Pending));
    syncCertificates.update((current) => {
      const existing = new Set(current.map((entry) => entry.id));
      return [...current, ...added.filter((entry) => !existing.has(entry.id))];
    });
    return { pkiSyncId };
  }),
  useRemoveCertificates: fixtureMutation(({ pkiSyncId, certificateIds }) => {
    const ids = new Set(certificateIds);
    syncCertificates.update((current) =>
      current.filter((entry) => entry.pkiSyncId !== pkiSyncId || !ids.has(entry.certificateId))
    );
    return { pkiSyncId };
  }),
  useSetDefaultCertificate: fixtureMutation(({ pkiSyncId, certificateId }) => {
    syncCertificates.update((current) =>
      current.map((entry) =>
        entry.pkiSyncId === pkiSyncId
          ? {
              ...entry,
              syncMetadata: {
                ...entry.syncMetadata,
                isDefault: entry.certificateId === certificateId
              }
            }
          : entry
      )
    );
    return { message: "Default certificate set" };
  }),
  useClearDefaultCertificate: fixtureMutation(({ pkiSyncId }) => {
    syncCertificates.update((current) =>
      current.map((entry) =>
        entry.pkiSyncId === pkiSyncId
          ? { ...entry, syncMetadata: { ...entry.syncMetadata, isDefault: false } }
          : entry
      )
    );
    return { message: "Default certificate cleared" };
  })
};
