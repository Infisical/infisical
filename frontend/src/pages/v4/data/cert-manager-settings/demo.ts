import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TAppConnection } from "@app/hooks/api/appConnections/types";
import { AwsConnectionMethod } from "@app/hooks/api/appConnections/types/aws-connection";
import { AzureADCSConnectionMethod } from "@app/hooks/api/appConnections/types/azure-adcs-connection";
import { CloudflareConnectionMethod } from "@app/hooks/api/appConnections/types/cloudflare-connection";
import { DigiCertConnectionMethod } from "@app/hooks/api/appConnections/types/digicert-connection";
import { F5BigIpConnectionMethod } from "@app/hooks/api/appConnections/types/f5-big-ip-connection";
import { AppConnectionCredentialRotationStatus } from "@app/hooks/api/appConnections/types/root-connection-enums";
import type { TCertificateCleanupConfig } from "@app/hooks/api/certificateCleanup/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { CertManagerSettingsAdapter } from "./contract";
import { alertsDemo } from "./demo-alerts";
import { hsmDemo } from "./demo-hsm";

const PROJECT_ID = "internal-pki";
const project = {
  id: PROJECT_ID,
  name: PROJECT_ID,
  slug: PROJECT_ID,
  type: ProjectType.CertificateManager
};
const days = (count: number) => new Date(Date.now() + count * 86_400_000);

const adcsMethod: string = AzureADCSConnectionMethod.UsernamePassword;

const connection = (
  id: string,
  app: AppConnection,
  name: string,
  method: string,
  createdAt: string,
  extra: Partial<Omit<TAppConnection, "app" | "method" | "credentials">> = {}
) =>
  ({
    id,
    app,
    name,
    method,
    credentials: {},
    description: null,
    version: 1,
    orgId: V4_DEMO_ORG_ID,
    createdAt,
    updatedAt: createdAt,
    projectId: PROJECT_ID,
    project,
    ...extra
  }) as TAppConnection;

const connections = createFixtureStore<TAppConnection[]>([
  connection(
    "3e5a7c9d-1f3b-4d5f-a7c9-1d3f5b7d9e69",
    AppConnection.AWS,
    "aws-route53-pki",
    AwsConnectionMethod.AssumeRole,
    "2026-07-30T16:50:00Z",
    { description: "DNS validation for ACME issuance" }
  ),
  connection(
    "6f1b3d5e-7a9c-4e2f-b4d6-8f0a2c4e6b13",
    AppConnection.AWS,
    "aws-acm-edge",
    AwsConnectionMethod.AccessKey,
    "2026-03-04T09:12:00Z",
    {
      isAutoRotationEnabled: true,
      rotation: {
        nextRotationAt: days(18),
        rotationInterval: 30,
        rotationStatus: AppConnectionCredentialRotationStatus.Success,
        lastRotationMessage: null,
        rotateAtUtc: { hours: 2, minutes: 30 }
      }
    }
  ),
  connection(
    "8a2c4e6f-0b1d-4f3a-95c7-e9b1d3f5a724",
    AppConnection.AzureADCS,
    "adcs-corp-issuing",
    adcsMethod,
    "2025-11-19T14:40:00Z",
    { description: "Issuing CA for internal services" }
  ),
  connection(
    "b4d6f8a0-2c3e-4a5b-87d9-1f3b5d7f9a35",
    AppConnection.Cloudflare,
    "cloudflare-dns",
    CloudflareConnectionMethod.ApiToken,
    "2026-05-02T11:05:00Z"
  ),
  connection(
    "c5e7a9b1-3d4f-4b6c-98ea-2a4c6e8a0b46",
    AppConnection.DigiCert,
    "digicert-public-tls",
    DigiCertConnectionMethod.ApiKey,
    "2026-01-21T08:30:00Z"
  ),
  connection(
    "d6f8b0c2-4e5a-4c7d-a9fb-3b5d7f9b1c57",
    AppConnection.F5BigIp,
    "f5-lb-prod",
    F5BigIpConnectionMethod.BasicAuth,
    "2026-08-11T17:25:00Z",
    { isPlatformManagedCredentials: true }
  )
]);

const cleanup = createFixtureStore<TCertificateCleanupConfig>({
  projectId: PROJECT_ID,
  isEnabled: true,
  postExpiryRetentionDays: 7,
  skipCertsWithActiveSyncs: true,
  lastRunStatus: "success",
  lastRunAt: days(-1).toISOString(),
  lastRunCertsDeleted: 4,
  lastRunMessage: null
});

const byId = (connectionId: string) =>
  connections.get().find((entry) => entry.id === connectionId) as TAppConnection;

export const certManagerSettingsDemo: CertManagerSettingsAdapter = {
  ...hsmDemo,
  ...alertsDemo,
  useConnections: (projectId) => ({
    data: connections.use().filter((entry) => entry.projectId === projectId),
    isPending: false,
    error: null
  }),
  useCreateConnection: fixtureMutation((input) => {
    const now = new Date().toISOString();
    const created = connection(crypto.randomUUID(), input.app, input.name, input.method, now, {
      description: input.description ?? null,
      projectId: input.projectId ?? PROJECT_ID
    });
    connections.update((entries) => [...entries, created]);
    return created;
  }),
  useUpdateConnection: fixtureMutation(({ connectionId, app, credentials, rotation, ...patch }) => {
    connections.update((entries) =>
      entries.map((entry) =>
        entry.id === connectionId
          ? ({ ...entry, ...patch, updatedAt: new Date().toISOString() } as TAppConnection)
          : entry
      )
    );
    return byId(connectionId);
  }),
  useRotateConnectionCredentials: fixtureMutation(({ connectionId }) => {
    connections.update((entries) =>
      entries.map((entry) =>
        entry.id === connectionId && entry.rotation
          ? {
              ...entry,
              rotation: {
                ...entry.rotation,
                rotationStatus: AppConnectionCredentialRotationStatus.Success,
                lastRotationMessage: null,
                nextRotationAt: days(entry.rotation.rotationInterval)
              }
            }
          : entry
      )
    );
    return byId(connectionId);
  }),
  useDeleteConnection: fixtureMutation(({ connectionId }) => {
    const removed = byId(connectionId);
    connections.update((entries) => entries.filter((entry) => entry.id !== connectionId));
    return removed;
  }),
  useCleanupConfig: () => ({ data: cleanup.use(), isPending: false, error: null }),
  useUpdateCleanupConfig: fixtureMutation((dto) => {
    cleanup.update((current) => ({ ...current, ...dto }));
    return cleanup.get();
  })
};
