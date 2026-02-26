import { NhiIdentityType, NhiProvider } from "../nhi-enums";
import { TRawNhiIdentity } from "../nhi-scanner-types";

export const scanGcpMockIdentities = (projectId: string): TRawNhiIdentity[] => {
  const now = new Date();
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const saEmail = (name: string) => `${name}@${projectId}.iam.gserviceaccount.com`;
  const saPath = (name: string) => `projects/${projectId}/serviceAccounts/${saEmail(name)}`;

  // --- Service Accounts ---
  const serviceAccounts: TRawNhiIdentity[] = [
    {
      externalId: saPath("terraform-sa"),
      name: "terraform-sa",
      type: NhiIdentityType.GcpServiceAccount,
      provider: NhiProvider.GCP,
      metadata: {
        email: saEmail("terraform-sa"),
        uniqueId: "110284756391827364501",
        projectId,
        displayName: "Terraform Service Account",
        description: "Used by Terraform for infrastructure provisioning",
        roles: ["roles/owner"],
        createDate: daysAgo(420).toISOString(),
        lastAuthenticated: daysAgo(2).toISOString(),
        disabled: false
      },
      policies: ["roles/owner"],
      keyCreateDate: daysAgo(420),
      keyLastUsedDate: daysAgo(2),
      lastActivityAt: daysAgo(2)
    },
    {
      externalId: saPath("ci-cd-pipeline"),
      name: "ci-cd-pipeline",
      type: NhiIdentityType.GcpServiceAccount,
      provider: NhiProvider.GCP,
      metadata: {
        email: saEmail("ci-cd-pipeline"),
        uniqueId: "118374629501837264912",
        projectId,
        displayName: "CI/CD Pipeline",
        description: "Cloud Build service account for CI/CD",
        roles: ["roles/cloudbuild.builds.editor", "roles/container.developer", "roles/storage.objectAdmin"],
        createDate: daysAgo(180).toISOString(),
        lastAuthenticated: daysAgo(1).toISOString(),
        disabled: false
      },
      policies: ["roles/cloudbuild.builds.editor", "roles/container.developer", "roles/storage.objectAdmin"],
      keyCreateDate: daysAgo(180),
      keyLastUsedDate: daysAgo(1),
      lastActivityAt: daysAgo(1)
    },
    {
      externalId: saPath("cloud-functions-runtime"),
      name: "cloud-functions-runtime",
      type: NhiIdentityType.GcpServiceAccount,
      provider: NhiProvider.GCP,
      metadata: {
        email: saEmail("cloud-functions-runtime"),
        uniqueId: "104958271638402917365",
        projectId,
        displayName: "Cloud Functions Runtime",
        description: "Runtime service account for Cloud Functions",
        roles: ["roles/cloudfunctions.invoker", "roles/pubsub.subscriber"],
        createDate: daysAgo(90).toISOString(),
        lastAuthenticated: daysAgo(0).toISOString(),
        disabled: false
      },
      policies: ["roles/cloudfunctions.invoker", "roles/pubsub.subscriber"],
      keyCreateDate: daysAgo(90),
      keyLastUsedDate: daysAgo(0),
      lastActivityAt: daysAgo(0)
    },
    {
      externalId: saPath("data-pipeline-sa"),
      name: "data-pipeline-sa",
      type: NhiIdentityType.GcpServiceAccount,
      provider: NhiProvider.GCP,
      metadata: {
        email: saEmail("data-pipeline-sa"),
        uniqueId: "112847563918273640195",
        projectId,
        displayName: "Data Pipeline Service Account",
        description: "BigQuery and Dataflow jobs",
        roles: ["roles/bigquery.admin", "roles/dataflow.worker", "roles/storage.objectViewer"],
        createDate: daysAgo(300).toISOString(),
        lastAuthenticated: daysAgo(95).toISOString(),
        disabled: false
      },
      policies: ["roles/bigquery.admin", "roles/dataflow.worker", "roles/storage.objectViewer"],
      keyCreateDate: daysAgo(300),
      keyLastUsedDate: daysAgo(95),
      lastActivityAt: daysAgo(95)
    }
  ];

  // --- Service Account Keys ---
  const serviceAccountKeys: TRawNhiIdentity[] = [
    {
      externalId: `${saPath("terraform-sa")}/keys/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6`,
      name: "terraform-sa key (a1b2c3)",
      type: NhiIdentityType.GcpServiceAccountKey,
      provider: NhiProvider.GCP,
      metadata: {
        serviceAccountEmail: saEmail("terraform-sa"),
        keyAlgorithm: "KEY_ALG_RSA_2048",
        keyOrigin: "GOOGLE_PROVIDED",
        keyType: "USER_MANAGED",
        validAfterTime: daysAgo(420).toISOString(),
        validBeforeTime: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        disabled: false,
        projectId
      },
      policies: ["roles/owner"],
      keyCreateDate: daysAgo(420),
      keyLastUsedDate: daysAgo(2),
      lastActivityAt: daysAgo(2)
    },
    {
      externalId: `${saPath("ci-cd-pipeline")}/keys/f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1`,
      name: "ci-cd-pipeline key (f6e5d4)",
      type: NhiIdentityType.GcpServiceAccountKey,
      provider: NhiProvider.GCP,
      metadata: {
        serviceAccountEmail: saEmail("ci-cd-pipeline"),
        keyAlgorithm: "KEY_ALG_RSA_2048",
        keyOrigin: "GOOGLE_PROVIDED",
        keyType: "USER_MANAGED",
        validAfterTime: daysAgo(180).toISOString(),
        validBeforeTime: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString(),
        disabled: false,
        projectId
      },
      policies: ["roles/cloudbuild.builds.editor", "roles/container.developer"],
      keyCreateDate: daysAgo(180),
      keyLastUsedDate: daysAgo(1),
      lastActivityAt: daysAgo(1)
    },
    {
      externalId: `${saPath("data-pipeline-sa")}/keys/b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2`,
      name: "data-pipeline-sa key (b7c8d9)",
      type: NhiIdentityType.GcpServiceAccountKey,
      provider: NhiProvider.GCP,
      metadata: {
        serviceAccountEmail: saEmail("data-pipeline-sa"),
        keyAlgorithm: "KEY_ALG_RSA_2048",
        keyOrigin: "GOOGLE_PROVIDED",
        keyType: "USER_MANAGED",
        validAfterTime: daysAgo(300).toISOString(),
        validBeforeTime: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        disabled: true,
        projectId
      },
      policies: ["roles/bigquery.admin"],
      keyCreateDate: daysAgo(300),
      keyLastUsedDate: daysAgo(95),
      lastActivityAt: daysAgo(95)
    }
  ];

  // --- API Keys ---
  const apiKeys: TRawNhiIdentity[] = [
    {
      externalId: `projects/${projectId}/locations/global/keys/maps-key-a1b2c3d4`,
      name: "Maps API Key",
      type: NhiIdentityType.GcpApiKey,
      provider: NhiProvider.GCP,
      metadata: {
        displayName: "Maps API Key",
        uid: "maps-key-a1b2c3d4",
        createTime: daysAgo(250).toISOString(),
        restrictions: {
          apiTargets: [{ service: "maps.googleapis.com" }],
          browserKeyRestrictions: { allowedReferrers: ["*.infisical.com/*"] }
        },
        projectId
      },
      policies: [],
      keyCreateDate: daysAgo(250),
      keyLastUsedDate: daysAgo(0),
      lastActivityAt: daysAgo(0)
    },
    {
      externalId: `projects/${projectId}/locations/global/keys/firebase-key-e5f6a7b8`,
      name: "Firebase API Key",
      type: NhiIdentityType.GcpApiKey,
      provider: NhiProvider.GCP,
      metadata: {
        displayName: "Firebase API Key",
        uid: "firebase-key-e5f6a7b8",
        createTime: daysAgo(400).toISOString(),
        restrictions: {},
        projectId
      },
      policies: [],
      keyCreateDate: daysAgo(400),
      keyLastUsedDate: daysAgo(60),
      lastActivityAt: daysAgo(60)
    },
    {
      externalId: `projects/${projectId}/locations/global/keys/vision-key-c9d0e1f2`,
      name: "Cloud Vision Key",
      type: NhiIdentityType.GcpApiKey,
      provider: NhiProvider.GCP,
      metadata: {
        displayName: "Cloud Vision Key",
        uid: "vision-key-c9d0e1f2",
        createTime: daysAgo(150).toISOString(),
        restrictions: {
          apiTargets: [{ service: "vision.googleapis.com" }],
          serverKeyRestrictions: { allowedIps: ["10.0.0.0/8"] }
        },
        projectId
      },
      policies: [],
      keyCreateDate: daysAgo(150),
      keyLastUsedDate: daysAgo(5),
      lastActivityAt: daysAgo(5)
    }
  ];

  return [...serviceAccounts, ...serviceAccountKeys, ...apiKeys];
};
