import type { TCertManagerLegacyInstance } from "@app/hooks/api/certManagerInstance";
import { ExternalKmsProvider, type Kms, type KmsListEntry } from "@app/hooks/api/kms/types";
import type { TSubOrganization } from "@app/hooks/api/subOrganizations/types";

import { V4_DEMO_ORG_ID } from "../../mode";
import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { OrgSettingsAdapter } from "./contract";

const ready = <T>(data: T) => ({ data, isPending: false, error: null });
const day = 24 * 3600 * 1000;
const demoGcpKeys = (gcpRegion: string) =>
  ["infisical", "shared"].map(
    (ring) => `projects/acme-demo/locations/${gcpRegion}/keyRings/${ring}/cryptoKeys/org-data`
  );
const at = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString();

type StoredKms = KmsListEntry & { configuration: Record<string, unknown> };

const externalKms = createFixtureStore<StoredKms[]>([
  {
    id: "3f6c1d2e-8a4b-4c7d-9e1f-2a5b7c9d0e13",
    name: "production-aws-kms",
    description: "Encrypts organization data in us-east-1",
    isDisabled: false,
    createdAt: at(120),
    updatedAt: at(12),
    externalKms: { provider: ExternalKmsProvider.Aws, status: "Active", statusDetails: "" },
    configuration: {
      awsRegion: "us-east-1",
      kmsKeyId: "demo-aws-key-id",
      credential: {
        type: "assume-role",
        data: {
          assumeRoleArn: "arn:aws:iam::000000000000:role/InfisicalKmsDemo",
          externalId: ""
        }
      }
    }
  },
  {
    id: "8b2e4f6a-1c3d-4e5f-a7b9-0c1d2e3f4a58",
    name: "eu-gcp-kms",
    description: "",
    isDisabled: false,
    createdAt: at(40),
    updatedAt: at(40),
    externalKms: { provider: ExternalKmsProvider.Gcp, status: "Active", statusDetails: "" },
    configuration: {
      gcpRegion: "europe-west1",
      keyName: "projects/acme-demo/locations/europe-west1/keyRings/infisical/cryptoKeys/org-data"
    }
  }
]);

const toKms = (entry: StoredKms): Kms => ({
  id: entry.id,
  name: entry.name,
  description: entry.description,
  orgId: V4_DEMO_ORG_ID,
  externalKms: {
    id: `ext-${entry.id}`,
    status: entry.externalKms.status,
    statusDetails: entry.externalKms.statusDetails,
    provider: entry.externalKms.provider,
    configuration: entry.configuration
  }
});

const subOrganizations = createFixtureStore<(TSubOrganization & { isMember: boolean })[]>(
  [
    ["platform-engineering", "Platform Engineering", 210, true],
    ["payments", "Payments", 160, true],
    ["data-science", "Data Science", 95, false],
    ["acme-europe", "Acme Europe", 60, false],
    ["mobile", "Mobile", 21, true]
  ].map(([slug, name, daysAgo, isMember]) => ({
    id: `sub-${slug}`,
    slug: slug as string,
    name: name as string,
    createdAt: at(daysAgo as number),
    updatedAt: at(daysAgo as number),
    parentOrgId: V4_DEMO_ORG_ID,
    isMember: isMember as boolean
  }))
);

const legacyInstances = createFixtureStore<TCertManagerLegacyInstance[]>([
  {
    id: "cert-manager",
    name: "Certificate Manager",
    slug: "certificate-manager",
    createdAt: at(300),
    certificateCount: 148,
    syncCount: 6,
    alertCount: 3,
    isActive: true
  },
  {
    id: "cert-manager-legacy",
    name: "Internal PKI (legacy)",
    slug: "internal-pki-legacy",
    createdAt: at(520),
    certificateCount: 37,
    syncCount: 0,
    alertCount: 1,
    isActive: false
  }
]);

const rename = (name: string) => name.trim();

export const orgSettingsDemo: OrgSettingsAdapter = {
  useEntitlements: () => ready({ enforceMfa: true, externalKms: true, subOrganization: true }),

  useExternalKmsList: () => ready(externalKms.use()),
  useExternalKms: ({ kmsId }) => {
    const entry = externalKms.use().find((item) => item.id === kmsId);
    return ready(entry ? toKms(entry) : undefined);
  },
  useAddExternalKms: fixtureMutation(({ name, description, configuration }) => {
    const created: StoredKms = {
      id: crypto.randomUUID(),
      name: rename(name) || `${configuration.type}-kms`,
      description: description ?? "",
      isDisabled: false,
      createdAt: at(0),
      updatedAt: at(0),
      externalKms: { provider: configuration.type, status: "Active", statusDetails: "" },
      configuration: configuration.inputs as Record<string, unknown>
    };
    externalKms.update((list) => [...list, created]);
    return created;
  }),
  useUpdateExternalKms: fixtureMutation(({ kmsId, name, description, configuration }) => {
    externalKms.update((list) =>
      list.map((entry) =>
        entry.id === kmsId
          ? {
              ...entry,
              name: name ? rename(name) : entry.name,
              description: description ?? entry.description,
              configuration: configuration
                ? { ...entry.configuration, ...(configuration.inputs as Record<string, unknown>) }
                : entry.configuration,
              updatedAt: at(0)
            }
          : entry
      )
    );
    return {};
  }),
  useRemoveExternalKms: fixtureMutation(({ kmsId }) => {
    externalKms.update((list) => list.filter((entry) => entry.id !== kmsId));
    return {};
  }),
  useFetchGcpKeys: fixtureMutation(({ gcpRegion }) => ({ keys: demoGcpKeys(gcpRegion) })),
  useSavedGcpKeys: (params) =>
    params
      ? ready({ keys: demoGcpKeys(params.gcpRegion) })
      : { data: undefined, isPending: true, error: null },

  useSubOrganizations: ({ search, offset = 0, limit = 20, isAccessible, orderDirection }) => {
    const all = subOrganizations.use();
    const needle = search?.toLowerCase() ?? "";
    const matching = all
      .filter((entry) => (isAccessible ? entry.isMember : true))
      .filter((entry) => entry.name.toLowerCase().includes(needle))
      .sort((a, b) =>
        orderDirection === "desc" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)
      );
    return ready({
      organizations: matching.slice(offset, offset + limit),
      totalCount: matching.length
    });
  },
  useCreateSubOrganization: fixtureMutation(({ name, slug }) => {
    const organization = {
      id: `sub-${crypto.randomUUID()}`,
      name: rename(name),
      slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      createdAt: at(0),
      updatedAt: at(0),
      parentOrgId: V4_DEMO_ORG_ID
    };
    subOrganizations.update((list) => [...list, { ...organization, isMember: true }]);
    return { organization };
  }),
  useUpdateSubOrganization: fixtureMutation(({ subOrgId, name, slug }) => {
    subOrganizations.update((list) =>
      list.map((entry) =>
        entry.id === subOrgId
          ? { ...entry, name: name ? rename(name) : entry.name, slug: slug || entry.slug }
          : entry
      )
    );
    return {};
  }),
  useDeleteSubOrganization: fixtureMutation(({ subOrgId }) => {
    subOrganizations.update((list) => list.filter((entry) => entry.id !== subOrgId));
    return {};
  }),
  useJoinSubOrganization: fixtureMutation(({ subOrgId }) => {
    subOrganizations.update((list) =>
      list.map((entry) => (entry.id === subOrgId ? { ...entry, isMember: true } : entry))
    );
    return {};
  }),

  useCertManagerLegacyInstances: () => {
    const instances = legacyInstances.use();
    return ready({
      activeProjectId: instances.find((entry) => entry.isActive)?.id ?? null,
      instances
    });
  },
  useSetCertManagerActiveProject: fixtureMutation((projectId) => {
    legacyInstances.update((list) =>
      list.map((entry) => ({ ...entry, isActive: entry.id === projectId }))
    );
    return {};
  }),
  useExportCertManagerProject: fixtureMutation(({ sourceProjectId }) => {
    const source = legacyInstances.get().find((entry) => entry.id === sourceProjectId);
    const active = legacyInstances.get().find((entry) => entry.isActive);
    return {
      sourceProjectId,
      destinationProjectId: active?.id ?? "",
      skippedCertificateProfiles: 0,
      exportedCertificateAuthorities: source ? 2 : 0,
      renamedCertificateAuthorities: [],
      exportedCertificatePolicies: source ? 3 : 0,
      renamedCertificatePolicies: [],
      exportedCertificateProfiles: source ? 4 : 0,
      renamedCertificateProfiles: []
    };
  }),
  useDeleteCertManagerProject: fixtureMutation(({ projectId }) => {
    legacyInstances.update((list) => list.filter((entry) => entry.id !== projectId));
    return {};
  }),

  useCreateMicrosoftTeamsIntegration: fixtureMutation(() => ({}))
};
