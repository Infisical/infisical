import type { TCertificateRequestListItem } from "@app/hooks/api/certificates/types";
import type {
  TPkiApplication,
  TPkiApplicationMember,
  TPkiApplicationProfile
} from "@app/hooks/api/pkiApplications/types";

import { createFixtureStore } from "../fixture-store";

export const DEMO_PROJECT_ID = "internal-pki";

export type EnrollmentMethodKey = "api" | "est" | "acme" | "scep";

export const demoProfileSlugs: Record<string, string> = {
  "4a6c2e81-0b3d-4f57-8e19-7d2a5c0f3b64": "tls-server",
  "b9e03d57-6f21-4c8a-91d4-2e7b8a6c0f15": "mtls-client",
  "e2c75a19-8d40-4b6e-a3f2-5c1d9e0b7a28": "code-signing"
};

const [TLS_SERVER, MTLS_CLIENT, CODE_SIGNING] = Object.keys(demoProfileSlugs);

const application = (
  id: string,
  name: string,
  description: string | null,
  createdAt: string
): TPkiApplication => ({
  id,
  projectId: DEMO_PROJECT_ID,
  name,
  description,
  createdAt,
  updatedAt: createdAt
});

export const demoApplications = createFixtureStore<TPkiApplication[]>([
  application(
    "3f9a1c52-7b6e-4d08-a1f3-9c2e5b7d4a61",
    "payments-api",
    "Customer-facing payment processing APIs behind the public edge.",
    "2026-03-14T17:22:00Z"
  ),
  application(
    "8b2d4e17-0c5a-4f93-b6e8-1d7c3a9f2e05",
    "platform-core",
    null,
    "2026-05-02T09:41:00Z"
  ),
  application(
    "5e0a7c21-9d4b-4f36-a8e2-7b1c6d3f9a84",
    "web-dashboard",
    "Customer dashboard and marketing site.",
    "2026-06-09T13:30:00Z"
  ),
  application(
    "c4e86a3d-2f17-4b59-9e0c-6a1b8d5f7c32",
    "iot-fleet",
    "Device certificates for the warehouse scanner fleet.",
    "2026-08-19T21:05:00Z"
  ),
  application(
    "1d7f3b98-6a2c-4e05-8f41-b3c9e2a6d710",
    "internal-tools",
    null,
    "2026-10-27T15:12:00Z"
  )
]);

const idOf = (name: string) =>
  demoApplications.get().find((entry) => entry.name === name)?.id ?? name;
const PAYMENTS = idOf("payments-api");
const PLATFORM = idOf("platform-core");
const IOT = idOf("iot-fleet");

const attachment = (
  applicationId: string,
  profileId: string,
  methods: Partial<Record<EnrollmentMethodKey, boolean>>,
  createdAt: string
): TPkiApplicationProfile => ({
  applicationId,
  profileId,
  profileSlug: demoProfileSlugs[profileId],
  profileDescription: null,
  apiConfigId: methods.api ? `api-${applicationId}-${profileId}` : null,
  estConfigId: methods.est ? `est-${applicationId}-${profileId}` : null,
  acmeConfigId: methods.acme ? `acme-${applicationId}-${profileId}` : null,
  scepConfigId: methods.scep ? `scep-${applicationId}-${profileId}` : null,
  createdAt,
  updatedAt: createdAt
});

export const demoProfiles = createFixtureStore<TPkiApplicationProfile[]>([
  attachment(PAYMENTS, TLS_SERVER, { api: true, acme: true }, "2026-03-14T17:25:00Z"),
  attachment(PAYMENTS, MTLS_CLIENT, { est: true }, "2026-03-20T11:00:00Z"),
  attachment(PAYMENTS, CODE_SIGNING, {}, "2026-09-02T10:30:00Z"),
  attachment(PLATFORM, TLS_SERVER, { acme: true }, "2026-05-02T09:45:00Z"),
  attachment(IOT, MTLS_CLIENT, { scep: true }, "2026-08-19T21:10:00Z")
]);

export const setDemoProfileMethod = (
  applicationId: string,
  profileId: string,
  method: EnrollmentMethodKey,
  configured: boolean
) =>
  demoProfiles.update((current) =>
    current.map((entry) =>
      entry.applicationId === applicationId && entry.profileId === profileId
        ? {
            ...entry,
            [`${method}ConfigId`]: configured ? `${method}-${applicationId}-${profileId}` : null,
            updatedAt: new Date().toISOString()
          }
        : entry
    )
  );

type MemberSeed = {
  kind: "user" | "identity" | "group";
  actorId: string;
  role: string;
  name: string;
  email?: string;
  createdAt: string;
};

const member = (applicationId: string, seed: MemberSeed): TPkiApplicationMember => ({
  membershipId: `${applicationId}-${seed.actorId}`,
  applicationId,
  actorUserId: seed.kind === "user" ? seed.actorId : null,
  actorIdentityId: seed.kind === "identity" ? seed.actorId : null,
  actorGroupId: seed.kind === "group" ? seed.actorId : null,
  role: seed.role,
  createdAt: seed.createdAt,
  updatedAt: seed.createdAt,
  details: {
    name: seed.name,
    email: seed.email ?? null,
    username: seed.email ?? null,
    slug: seed.kind === "group" ? seed.name.toLowerCase().replace(/\s+/g, "-") : null
  }
});

export const demoMemberSeeds = {
  users: [
    { id: "user-maya-chen", name: "Maya Chen", email: "maya.chen@acme.dev" },
    { id: "user-jonas-weber", name: "Jonas Weber", email: "jonas.weber@acme.dev" },
    { id: "user-priya-raman", name: "Priya Raman", email: "priya.raman@acme.dev" },
    { id: "user-leo-martins", name: "Leo Martins", email: "leo.martins@acme.dev" }
  ],
  identities: [
    { id: "identity-payments-deployer", name: "payments-deployer" },
    { id: "identity-cert-manager-agent", name: "cert-manager-agent" },
    { id: "identity-k8s-issuer", name: "k8s-cluster-issuer" }
  ],
  groups: [
    { id: "group-platform-security", name: "Platform Security" },
    { id: "group-sre-oncall", name: "SRE On-call" }
  ]
};

export const demoMembers = createFixtureStore<TPkiApplicationMember[]>([
  member(PAYMENTS, {
    kind: "user",
    actorId: "user-maya-chen",
    role: "admin",
    name: "Maya Chen",
    email: "maya.chen@acme.dev",
    createdAt: "2026-03-14T17:22:00Z"
  }),
  member(PAYMENTS, {
    kind: "user",
    actorId: "user-jonas-weber",
    role: "operator",
    name: "Jonas Weber",
    email: "jonas.weber@acme.dev",
    createdAt: "2026-04-01T08:15:00Z"
  }),
  member(PAYMENTS, {
    kind: "identity",
    actorId: "identity-payments-deployer",
    role: "operator",
    name: "payments-deployer",
    createdAt: "2026-04-03T12:40:00Z"
  }),
  member(PAYMENTS, {
    kind: "group",
    actorId: "group-platform-security",
    role: "auditor",
    name: "Platform Security",
    createdAt: "2026-06-11T16:00:00Z"
  }),
  member(PLATFORM, {
    kind: "user",
    actorId: "user-maya-chen",
    role: "admin",
    name: "Maya Chen",
    email: "maya.chen@acme.dev",
    createdAt: "2026-05-02T09:41:00Z"
  }),
  member(IOT, {
    kind: "user",
    actorId: "user-priya-raman",
    role: "admin",
    name: "Priya Raman",
    email: "priya.raman@acme.dev",
    createdAt: "2026-08-19T21:05:00Z"
  }),
  member(IOT, {
    kind: "identity",
    actorId: "identity-k8s-issuer",
    role: "operator",
    name: "k8s-cluster-issuer",
    createdAt: "2026-08-20T09:00:00Z"
  })
]);

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

const request = (
  id: string,
  status: TCertificateRequestListItem["status"],
  commonName: string,
  profileSlug: string,
  hoursAgo: number,
  extra: Partial<TCertificateRequestListItem> = {}
): TCertificateRequestListItem & { applicationId: string | null } => {
  const profileId =
    Object.keys(demoProfileSlugs).find((key) => demoProfileSlugs[key] === profileSlug) ?? null;
  return {
    id,
    applicationId: PAYMENTS,
    status,
    commonName,
    altNames: commonName,
    profileId,
    profileName: profileSlug,
    caId: null,
    certificateId: null,
    approvalRequestId: null,
    errorMessage: null,
    pendingMessage: null,
    createdAt: ago(hoursAgo),
    updatedAt: ago(hoursAgo),
    certificate: null,
    ...extra
  };
};

export const demoCertificateRequests = createFixtureStore([
  request("creq-7a1d2c3b-4e5f-4a6b-8c9d-0e1f2a3b4c51", "issued", "api.acme.dev", "tls-server", 3, {
    certificateId: "0f6b2d84-1e9a-4c37-b5d2-8a3e7c1f9d06",
    certificate: {
      id: "0f6b2d84-1e9a-4c37-b5d2-8a3e7c1f9d06",
      serialNumber: "4FA19C2B7E11D0E2",
      status: "active"
    }
  }),
  request(
    "creq-7a1d2c3b-4e5f-4a6b-8c9d-0e1f2a3b4c52",
    "pending_approval",
    "checkout.acme.dev",
    "tls-server",
    6,
    { approvalRequestId: "apr-5c2e7d1a-9b3f-4e68-a0c4-1d7f2b9e6a35" }
  ),
  request(
    "creq-7a1d2c3b-4e5f-4a6b-8c9d-0e1f2a3b4c53",
    "pending_validation",
    "webhooks.acme.dev",
    "tls-server",
    20,
    { pendingMessage: "Waiting for the ACME DNS-01 challenge to propagate" }
  ),
  request(
    "creq-7a1d2c3b-4e5f-4a6b-8c9d-0e1f2a3b4c54",
    "failed",
    "ledger-worker.payments.internal",
    "mtls-client",
    49,
    { errorMessage: "The EST passphrase did not match the configured value" }
  ),
  request(
    "creq-7a1d2c3b-4e5f-4a6b-8c9d-0e1f2a3b4c55",
    "pending",
    "settlement.payments.internal",
    "mtls-client",
    1
  ),
  request(
    "creq-7a1d2c3b-4e5f-4a6b-8c9d-0e1f2a3b4c56",
    "issued",
    "payments.acme.dev",
    "tls-server",
    170,
    {
      certificateId: "6c1e8a3f-4b2d-4f90-8e75-d03a9b6c2e41",
      certificate: {
        id: "6c1e8a3f-4b2d-4f90-8e75-d03a9b6c2e41",
        serialNumber: "610BE4935AC7284D",
        status: "active"
      }
    }
  )
]);

export const demoMember = member;
