import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  PkiCertificateFileFormat,
  PkiDiscoveryScanStatus,
  PkiDiscoveryType,
  PkiInstallationLocationType,
  PkiInstallationType,
  PkiKeystoreStatus,
  type TPkiDiscovery,
  type TPkiDiscoveryScan,
  type TPkiInstallation,
  type TPkiInstallationCert,
  WindowsCertificateStore
} from "@app/hooks/api/pkiDiscovery/types";
import type { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";

import { saved } from "../../access/toast";
import { createFixtureStore } from "../fixture-store";
import type { PkiDiscoveryAdapter, THostConnection } from "./contract";

const projectId = "internal-pki";
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 36e5).toISOString();
const daysFromNow = (days: number) => new Date(Date.now() + days * 864e5).toISOString();
const ok = <T>(data: T) => ({ data, isPending: false, error: null });
const missing = () => ({ data: undefined, isPending: false, error: null });

const US_POOL = "4a8e2c60-1b7d-4f39-a5e0-8c3b6d9f2e17";

const hostConnections: THostConnection[] = [
  {
    id: "5e1c9a72-3d4b-4f08-9a6e-2b7c0d8e1f43",
    name: "web-fleet-ssh",
    projectId,
    gatewayPoolId: US_POOL,
    app: AppConnection.SSH
  },
  {
    id: "8b2d4f61-7a3c-4e95-b0d1-6c9e2a5f7b38",
    name: "bastion-ssh",
    projectId,
    app: AppConnection.SSH
  },
  {
    id: "c4a7e1d9-2b6f-4083-9e5a-1d3c8b0f6a27",
    name: "iis-prod-winrm",
    projectId,
    gatewayPoolId: US_POOL,
    app: AppConnection.WinRM
  }
];

const connectionsFor = (ids: string[] = []) => {
  const wanted = new Set(ids);
  return hostConnections
    .filter((connection) => wanted.has(connection.id))
    .map(({ id, name }) => ({ id, name }));
};

const discovery = (
  id: string,
  name: string,
  discoveryType: PkiDiscoveryType,
  targetConfig: TPkiDiscovery["targetConfig"],
  extra: Partial<TPkiDiscovery> = {}
): TPkiDiscovery => ({
  id,
  projectId,
  name,
  description: null,
  discoveryType,
  targetConfig,
  isAutoScanEnabled: true,
  scanIntervalDays: 7,
  gatewayId: null,
  gatewayPoolId: null,
  gatewayName: null,
  gatewayPoolName: null,
  isActive: true,
  lastScanStatus: PkiDiscoveryScanStatus.Completed,
  lastScanJobId: null,
  lastScanMessage: null,
  lastScannedAt: hoursAgo(6),
  certificatesFound: 0,
  installationsFound: 0,
  createdAt: hoursAgo(24 * 40),
  updatedAt: hoursAgo(6),
  connections: connectionsFor(targetConfig.connectionIds),
  ...extra
});

const EDGE = "1f7c3a95-6e2d-4b81-a0c4-9d5e8f2b7a16";
const LINUX = "6a2e9d14-8c5b-4f37-b1e0-3d7a9c2f5e84";
const WINDOWS = "b9d4f2a6-1e7c-4053-8a9b-5c2e0d6f3a71";
const PARTNER = "e3c8a1f5-9b2d-4e64-a7f0-8d1b6c4e2a95";

const discoveries = createFixtureStore<TPkiDiscovery[]>([
  discovery(
    EDGE,
    "edge-tls-sweep",
    PkiDiscoveryType.Network,
    {
      domains: ["api.acme.dev", "payments.acme.dev", "dashboard.acme.dev"],
      ipRanges: ["10.0.4.0/28"],
      ports: "443,8443"
    },
    {
      description: "Public endpoints and the production load balancers",
      gatewayPoolId: US_POOL,
      gatewayPoolName: "us-primary",
      certificatesFound: 6,
      installationsFound: 3
    }
  ),
  discovery(
    LINUX,
    "linux-web-fleet",
    PkiDiscoveryType.LinuxServer,
    {
      connectionIds: [hostConnections[0].id],
      searchFolderPaths: ["/etc/ssl", "/etc/nginx", "/opt"],
      skipFolderPaths: ["/opt/backups"],
      maxFolderDepth: 8,
      maxFileSizeKb: 512,
      importStandaloneCaCertificates: false
    },
    {
      lastScanMessage: "2 folders could not be read: /opt/vault, /etc/ssl/private",
      certificatesFound: 3,
      installationsFound: 2,
      lastScannedAt: hoursAgo(20)
    }
  ),
  discovery(
    WINDOWS,
    "windows-iis-hosts",
    PkiDiscoveryType.WindowsServer,
    {
      connectionIds: [hostConnections[2].id],
      certificateStores: [WindowsCertificateStore.Personal, WindowsCertificateStore.WebHosting],
      importStandaloneCaCertificates: false
    },
    {
      lastScanStatus: PkiDiscoveryScanStatus.Running,
      scanIntervalDays: 1,
      certificatesFound: 1,
      installationsFound: 1,
      lastScannedAt: hoursAgo(25)
    }
  ),
  discovery(
    PARTNER,
    "partner-endpoints",
    PkiDiscoveryType.Network,
    { domains: ["sso.partner-portal.example", "files.partner-portal.example"], ports: "443" },
    {
      isActive: false,
      isAutoScanEnabled: false,
      scanIntervalDays: null,
      lastScanStatus: PkiDiscoveryScanStatus.Failed,
      lastScanMessage: "Connection timed out on files.partner-portal.example:443",
      lastScannedAt: hoursAgo(24 * 12)
    }
  )
]);

const scan = (
  id: string,
  discoveryConfigId: string,
  startedHoursAgo: number,
  status: PkiDiscoveryScanStatus,
  counts: [number, number, number],
  errorMessage: string | null = null
): TPkiDiscoveryScan => ({
  id,
  discoveryConfigId,
  startedAt: hoursAgo(startedHoursAgo),
  completedAt:
    status === PkiDiscoveryScanStatus.Running
      ? null
      : new Date(Date.now() - startedHoursAgo * 36e5 + 41_300).toISOString(),
  status,
  targetsScannedCount: counts[0],
  certificatesFoundCount: counts[1],
  installationsFoundCount: counts[2],
  errorMessage,
  createdAt: hoursAgo(startedHoursAgo),
  updatedAt: hoursAgo(startedHoursAgo)
});

const scans = createFixtureStore<TPkiDiscoveryScan[]>([
  scan("5b0e2c41-a1", EDGE, 6, PkiDiscoveryScanStatus.Completed, [19, 6, 3]),
  scan("5b0e2c41-a2", EDGE, 6 + 168, PkiDiscoveryScanStatus.Completed, [19, 5, 3]),
  scan(
    "5b0e2c41-a3",
    EDGE,
    6 + 336,
    PkiDiscoveryScanStatus.Failed,
    [0, 0, 0],
    "Gateway pool us-primary has no healthy members"
  ),
  scan(
    "5b0e2c41-b1",
    LINUX,
    20,
    PkiDiscoveryScanStatus.Completed,
    [1, 3, 2],
    "2 folders could not be read: /opt/vault, /etc/ssl/private"
  ),
  scan("5b0e2c41-c1", WINDOWS, 0.1, PkiDiscoveryScanStatus.Running, [0, 0, 0]),
  scan("5b0e2c41-c2", WINDOWS, 25, PkiDiscoveryScanStatus.Completed, [1, 1, 1]),
  scan(
    "5b0e2c41-d1",
    PARTNER,
    24 * 12,
    PkiDiscoveryScanStatus.Failed,
    [2, 0, 0],
    "Connection timed out on files.partner-portal.example:443"
  )
]);

const cert = (
  installationId: string,
  certificateId: string,
  commonName: string,
  serialNumber: string,
  expiresInDays: number
): TPkiInstallationCert => ({
  id: `${installationId.slice(0, 8)}-${certificateId.slice(0, 8)}`,
  installationId,
  certificateId,
  firstSeenAt: hoursAgo(24 * 30),
  lastSeenAt: hoursAgo(6),
  createdAt: hoursAgo(24 * 30),
  updatedAt: hoursAgo(6),
  commonName,
  serialNumber,
  notBefore: hoursAgo(24 * 200),
  notAfter: daysFromNow(expiresInDays)
});

const installation = (
  id: string,
  locationType: PkiInstallationLocationType,
  locationDetails: TPkiInstallation["locationDetails"],
  extra: Partial<TPkiInstallation> = {}
): TPkiInstallation => {
  const certificates = extra.certificates ?? [];
  return {
    id,
    projectId,
    locationType,
    locationDetails,
    locationFingerprint: id,
    name: null,
    type: PkiInstallationType.Server,
    metadata: null,
    lastSeenAt: hoursAgo(6),
    createdAt: hoursAgo(24 * 30),
    updatedAt: hoursAgo(6),
    certificatesCount: certificates.length,
    primaryCertName: certificates[0]?.commonName ?? null,
    discoveryName: null,
    ...extra,
    certificates
  };
};

const LB = "f4b81c2e-7a3d-4e60-95b8-1d6c0e2a7f39";
const INGRESS = "3a9e5d71-0c8b-4f24-a6d3-7e2b1f9c5a08";
const DASHBOARD = "70c2e9a4-5b1d-4f86-9e3a-2d8c6b0f4a15";
const NGINX_FILE = "2d6f9b13-8e4a-4c70-a5b1-9f3e7c2d0a64";
const KEYSTORE = "9a5c1e70-3f2b-4d98-b6e4-0c7a2d5f8e31";
const IIS = "c7e2a4b9-6d1f-4053-8b9c-3e5a0f7d2c16";

const installationDiscoveries: Record<string, string[]> = {
  [LB]: [EDGE],
  [INGRESS]: [EDGE],
  [DASHBOARD]: [EDGE],
  [NGINX_FILE]: [LINUX],
  [KEYSTORE]: [LINUX],
  [IIS]: [WINDOWS]
};

const installations = createFixtureStore<TPkiInstallation[]>([
  installation(
    LB,
    PkiInstallationLocationType.Network,
    { ipAddress: "10.0.4.12", port: 443, gatewayName: "prod-us-east" },
    {
      name: "lb-prod-1",
      type: PkiInstallationType.LoadBalancer,
      discoveryName: "edge-tls-sweep",
      certificates: [
        cert(LB, "0f6b2d84-1e9a-4c37-b5d2-8a3e7c1f9d06", "api.acme.dev", "4FA19C2B7E11D0E2", 84),
        cert(
          LB,
          "6c1e8a3f-4b2d-4f90-8e75-d03a9b6c2e41",
          "payments.acme.dev",
          "610BE4935AC7284D",
          13
        )
      ]
    }
  ),
  installation(
    INGRESS,
    PkiInstallationLocationType.Network,
    { fqdn: "ingress.prod-us-east.acme.internal", port: 443, gatewayName: "prod-us-east" },
    {
      name: "ingress-nginx",
      type: PkiInstallationType.Container,
      discoveryName: "edge-tls-sweep",
      certificates: [
        cert(
          INGRESS,
          "2e5f8c97-0a4b-4d61-8f3c-9b7d1e6a2c58",
          "*.edge.acme.dev",
          "0A5FC271E83499D3",
          27
        )
      ]
    }
  ),
  installation(
    DASHBOARD,
    PkiInstallationLocationType.Network,
    { fqdn: "dashboard.acme.dev", port: 8443 },
    {
      discoveryName: "edge-tls-sweep",
      lastSeenAt: hoursAgo(30),
      certificates: [
        cert(
          DASHBOARD,
          "d84c1b6e-2f73-4a95-b0e8-7c5a3d9f1e26",
          "dashboard.acme.dev",
          "7D3E20AFC4591B86",
          40
        )
      ]
    }
  ),
  installation(
    NGINX_FILE,
    PkiInstallationLocationType.Filesystem,
    {
      hostIdentifier: "10.0.8.21",
      hostname: "web-01",
      filePath: "/etc/nginx/certs/api.acme.dev.pem",
      format: PkiCertificateFileFormat.Pem
    },
    {
      discoveryName: "linux-web-fleet",
      connection: { id: hostConnections[0].id, name: hostConnections[0].name },
      lastSeenAt: hoursAgo(20),
      certificates: [
        cert(
          NGINX_FILE,
          "0f6b2d84-1e9a-4c37-b5d2-8a3e7c1f9d06",
          "api.acme.dev",
          "4FA19C2B7E11D0E2",
          84
        )
      ]
    }
  ),
  installation(
    KEYSTORE,
    PkiInstallationLocationType.Keystore,
    {
      hostIdentifier: "10.0.8.22",
      hostname: "web-02",
      filePath: "/opt/payments/keystore.p12",
      format: PkiCertificateFileFormat.Pkcs12
    },
    {
      name: "payments-keystore",
      discoveryName: "linux-web-fleet",
      connection: { id: hostConnections[0].id, name: hostConnections[0].name },
      metadata: { keystoreStatus: PkiKeystoreStatus.Locked },
      lastSeenAt: hoursAgo(20)
    }
  ),
  installation(
    IIS,
    PkiInstallationLocationType.OsStore,
    {
      hostIdentifier: "10.0.12.5",
      hostname: "IIS-PROD-01",
      storeLocation: "LocalMachine",
      storeName: WindowsCertificateStore.WebHosting,
      thumbprint: "9C41E07A2B5D83F6E1C0A4B7D2E95F3A08C6B1D4",
      hasPrivateKey: true
    },
    {
      discoveryName: "windows-iis-hosts",
      connection: { id: hostConnections[2].id, name: hostConnections[2].name },
      lastSeenAt: hoursAgo(25),
      certificates: [
        cert(
          IIS,
          "6c1e8a3f-4b2d-4f90-8e75-d03a9b6c2e41",
          "payments.acme.dev",
          "610BE4935AC7284D",
          13
        )
      ]
    }
  )
]);

const page = <T>(rows: T[], offset = 0, limit = 25) => rows.slice(offset, offset + limit);

const matches = (search: string | undefined, ...values: (string | null | undefined)[]) =>
  !search || values.some((value) => value?.toLowerCase().includes(search.trim().toLowerCase()));

const announce =
  <TVariables, TData>(
    message: string | ((variables: TVariables) => string),
    run: (variables: TVariables) => TData
  ) =>
  () => ({
    mutateAsync: async (variables: TVariables) => {
      const data = run(variables);
      saved(typeof message === "string" ? message : message(variables));
      return data;
    },
    isPending: false
  });

const requireDiscovery = (discoveryId: string) => {
  const found = discoveries.get().find((entry) => entry.id === discoveryId);
  if (!found) throw new Error("Discovery job not found");
  return found;
};

const requireInstallation = (installationId: string) => {
  const found = installations.get().find((entry) => entry.id === installationId);
  if (!found) throw new Error("Installation not found");
  return found;
};

export const pkiDiscoveryDemo: PkiDiscoveryAdapter = {
  useSubscription: () => ok({ pkiDiscovery: true } as SubscriptionPlan),
  useDiscoveries: ({ offset, limit, search }) => {
    const rows = discoveries
      .use()
      .filter((entry) => matches(search, entry.name, entry.description));
    return ok({ discoveries: page(rows, offset, limit), totalCount: rows.length });
  },
  useDiscovery: (discoveryId) => {
    const found = discoveries.use().find((entry) => entry.id === discoveryId);
    return found ? ok(found) : missing();
  },
  useScanHistory: ({ discoveryId, offset, limit }) => {
    const rows = scans.use().filter((entry) => entry.discoveryConfigId === discoveryId);
    return ok({ scans: page(rows, offset, limit), totalCount: rows.length });
  },
  useRefreshAfterScan: () => undefined,
  useInstallations: ({ discoveryId, certificateId, offset, limit, search }) => {
    const rows = installations
      .use()
      .filter(
        (entry) =>
          (!discoveryId || installationDiscoveries[entry.id]?.includes(discoveryId)) &&
          (!certificateId ||
            entry.certificates?.some((item) => item.certificateId === certificateId)) &&
          matches(
            search,
            entry.name,
            entry.locationDetails.fqdn,
            entry.locationDetails.ipAddress,
            entry.locationDetails.hostname,
            entry.locationDetails.filePath
          )
      );
    return ok({ installations: page(rows, offset, limit), totalCount: rows.length });
  },
  useInstallation: ({ installationId }) => {
    const found = installations.use().find((entry) => entry.id === installationId);
    return found ? ok(found) : missing();
  },
  useHostConnections: (apps) => ({
    connections: hostConnections.filter((connection) => apps.includes(connection.app)),
    isPending: false
  }),
  useCreateDiscovery: announce("Successfully created discovery job", (dto) => {
    const created = discovery(
      crypto.randomUUID(),
      dto.name,
      dto.discoveryType ?? PkiDiscoveryType.Network,
      dto.targetConfig,
      {
        description: dto.description ?? null,
        isAutoScanEnabled: Boolean(dto.isAutoScanEnabled),
        scanIntervalDays: dto.scanIntervalDays ?? null,
        gatewayId: dto.gatewayId ?? null,
        gatewayPoolId: dto.gatewayPoolId ?? null,
        lastScanStatus: null,
        lastScannedAt: null
      }
    );
    discoveries.update((current) => [created, ...current]);
    return created;
  }),
  useUpdateDiscovery: announce("Successfully updated discovery job", ({ discoveryId, ...dto }) => {
    const current = requireDiscovery(discoveryId);
    const updated: TPkiDiscovery = {
      ...current,
      ...Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined)),
      connections: dto.targetConfig?.connectionIds
        ? connectionsFor(dto.targetConfig.connectionIds)
        : current.connections,
      updatedAt: new Date().toISOString()
    };
    discoveries.update((rows) => rows.map((entry) => (entry.id === discoveryId ? updated : entry)));
    return updated;
  }),
  useDeleteDiscovery: announce("Successfully deleted discovery job", ({ discoveryId }) => {
    const current = requireDiscovery(discoveryId);
    discoveries.update((rows) => rows.filter((entry) => entry.id !== discoveryId));
    return current;
  }),
  useTriggerScan: announce("Scan triggered successfully", ({ discoveryId }) => {
    requireDiscovery(discoveryId);
    discoveries.update((rows) =>
      rows.map((entry) =>
        entry.id === discoveryId
          ? { ...entry, lastScanStatus: PkiDiscoveryScanStatus.Pending, lastScanMessage: null }
          : entry
      )
    );
    scans.update((rows) => [
      scan(crypto.randomUUID(), discoveryId, 0, PkiDiscoveryScanStatus.Running, [0, 0, 0]),
      ...rows
    ]);
    return { message: "Scan triggered" };
  }),
  useUpdateInstallation: announce(
    ({ keystorePassword }) =>
      keystorePassword === undefined
        ? "Successfully updated installation"
        : "Password saved. Rescanning this file.",
    ({ installationId, name, keystorePassword }) => {
      const current = requireInstallation(installationId);
      const updated: TPkiInstallation = {
        ...current,
        name: name === undefined ? current.name : name || null,
        ...(keystorePassword !== undefined && {
          hasKeystorePassword: true,
          metadata: {
            ...current.metadata,
            keystoreStatus: PkiKeystoreStatus.Readable,
            lastCheckedAt: new Date().toISOString()
          }
        })
      };
      installations.update((rows) =>
        rows.map((entry) => (entry.id === installationId ? updated : entry))
      );
      return updated;
    }
  ),
  useDeleteInstallation: announce("Successfully deleted installation", ({ installationId }) => {
    const current = requireInstallation(installationId);
    installations.update((rows) => rows.filter((entry) => entry.id !== installationId));
    return current;
  })
};
