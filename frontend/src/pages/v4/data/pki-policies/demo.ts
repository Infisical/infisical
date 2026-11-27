import type {
  TCertificatePolicy,
  TCustomExtensionRule
} from "@app/hooks/api/certificatePolicies/types";
import {
  EnrollmentType,
  IssuerType,
  type TCertificateProfile,
  type TCertificateProfileWithDetails
} from "@app/hooks/api/certificateProfiles/types";
import type { SubscriptionPlan } from "@app/hooks/api/types";

import { demoCreatedCas } from "../certificate-authorities/demo";
import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { PkiPoliciesAdapter } from "./contract";

const projectId = "internal-pki";
const issuingCa = { id: "8d2f4c61-3a7e-4b19-9f05-c6e1a2b7d438", name: "Acme Issuing CA G2" };
const rootCa = { id: "1b7e9a30-5c4d-4f82-a6e3-0d9f2c8b5e71", name: "Acme Internal Root CA" };

const daysAgo = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
const stamp = (created: number, updated = created) => ({
  createdAt: daysAgo(created),
  updatedAt: daysAgo(updated)
});
const ok = <T>(data: T) => ({ data, isPending: false, error: null });

const policies = createFixtureStore<TCertificatePolicy[]>([
  {
    id: "policy-tls-server",
    projectId,
    name: "tls-server",
    description: "Public-facing HTTPS services and internal APIs.",
    subject: [{ type: "common_name", allowed: ["*.acme.internal", "*.acme.com"] }],
    sans: [
      { type: "dns_name", allowed: ["*.acme.internal", "*.acme.com"], denied: ["*.corp.acme.com"] },
      { type: "ip_address", allowed: ["10.*"] }
    ],
    keyUsages: { required: ["digital_signature"], allowed: ["key_encipherment"] },
    extendedKeyUsages: { required: ["server_auth"], allowed: ["client_auth"] },
    algorithms: {
      signature: ["SHA256-ECDSA", "SHA384-ECDSA", "SHA256-RSA"],
      keyAlgorithm: ["ECDSA-P256", "ECDSA-P384", "RSA-2048"]
    },
    validity: { max: "397d" },
    ...stamp(180, 12)
  },
  {
    id: "policy-mtls-client",
    projectId,
    name: "mtls-client",
    description: "Service-to-service mutual TLS inside the mesh.",
    subject: [{ type: "common_name", required: ["*.svc.cluster.local"] }],
    sans: [{ type: "uri", allowed: ["spiffe://acme.internal/*"] }],
    keyUsages: { required: ["digital_signature"], allowed: ["key_agreement"] },
    extendedKeyUsages: { required: ["client_auth"] },
    algorithms: { signature: ["SHA256-ECDSA"], keyAlgorithm: ["ECDSA-P256"] },
    validity: { max: "30d" },
    ...stamp(150, 40)
  },
  {
    id: "policy-code-signing",
    projectId,
    name: "code-signing",
    description: "Release builds signed by the build pipeline.",
    subject: [
      { type: "common_name", required: ["Acme Release Engineering"] },
      { type: "organization", required: ["Acme Corp"] }
    ],
    keyUsages: { required: ["digital_signature", "non_repudiation"] },
    extendedKeyUsages: { required: ["code_signing"], allowed: ["time_stamping"] },
    algorithms: { signature: ["SHA384-RSA", "SHA512-RSA"], keyAlgorithm: ["RSA-3072", "RSA-4096"] },
    validity: { max: "1y" },
    customExtensions: [
      {
        oid: "1.3.6.1.4.1.311.20.2",
        critical: "not_critical" as TCustomExtensionRule["critical"],
        allowed: ["CodeSigning"]
      }
    ],
    ...stamp(120, 120)
  },
  {
    id: "policy-intermediate-ca",
    projectId,
    name: "intermediate-ca",
    description: "Subordinate issuing CAs under the internal root.",
    subject: [
      { type: "common_name", allowed: ["*"] },
      { type: "organization", required: ["Acme Corp"] },
      { type: "domain_component", allowed: ["corp,acme,com"] }
    ],
    keyUsages: { required: ["key_cert_sign", "crl_sign"], allowed: ["digital_signature"] },
    extendedKeyUsages: { allowed: ["ocsp_signing"] },
    algorithms: { keyAlgorithm: ["ECDSA-P384", "RSA-4096"] },
    validity: { max: "10y" },
    basicConstraints: {
      isCA: "required" as NonNullable<TCertificatePolicy["basicConstraints"]>["isCA"],
      maxPathLength: 0
    },
    ...stamp(90, 30)
  },
  {
    id: "policy-lab",
    projectId,
    name: "lab-unrestricted",
    ...stamp(14)
  }
]);

export const demoCertificateProfiles = createFixtureStore<TCertificateProfile[]>([
  {
    id: "4a6c2e81-0b3d-4f57-8e19-7d2a5c0f3b64",
    projectId,
    caId: issuingCa.id,
    certificatePolicyId: "policy-tls-server",
    slug: "tls-server",
    description: "HTTPS certificates for public and internal web services.",
    enrollmentType: EnrollmentType.API,
    issuerType: IssuerType.CA,
    certificateAuthority: { ...issuingCa, status: "active", isExternal: false },
    defaults: {
      ttlDays: 90,
      keyAlgorithm: "EC_prime256v1",
      signatureAlgorithm: "ECDSA-SHA256",
      keyUsages: ["digital_signature", "key_encipherment"],
      extendedKeyUsages: ["server_auth"],
      organization: "Acme Corp",
      country: "CA"
    },
    ...stamp(170, 12)
  },
  {
    id: "b9e03d57-6f21-4c8a-91d4-2e7b8a6c0f15",
    projectId,
    caId: issuingCa.id,
    certificatePolicyId: "policy-mtls-client",
    slug: "mtls-client",
    description: "Short-lived workload identities for the service mesh.",
    enrollmentType: EnrollmentType.EST,
    issuerType: IssuerType.CA,
    certificateAuthority: { ...issuingCa, status: "active", isExternal: false },
    defaults: {
      ttlDays: 7,
      keyAlgorithm: "EC_prime256v1",
      keyUsages: ["digital_signature"],
      extendedKeyUsages: ["client_auth"]
    },
    ...stamp(140, 40)
  },
  {
    id: "e2c75a19-8d40-4b6e-a3f2-5c1d9e0b7a28",
    projectId,
    caId: rootCa.id,
    certificatePolicyId: "policy-code-signing",
    slug: "code-signing",
    enrollmentType: EnrollmentType.API,
    issuerType: IssuerType.CA,
    certificateAuthority: { ...rootCa, status: "active", isExternal: false },
    defaults: {
      ttlDays: 365,
      keyAlgorithm: "RSA_4096",
      signatureAlgorithm: "RSA-SHA384",
      commonName: "Acme Release Engineering",
      organization: "Acme Corp",
      customExtensions: [{ oid: "1.3.6.1.4.1.311.20.2", critical: false, value: "CodeSigning" }]
    },
    ...stamp(110, 110)
  },
  {
    id: "7f1d3b92-4e6a-4c08-b5d1-9a2e6c4f8b30",
    projectId,
    caId: null,
    certificatePolicyId: "policy-lab",
    slug: "lab-self-signed",
    description: "Throwaway certificates for local testing.",
    enrollmentType: EnrollmentType.API,
    issuerType: IssuerType.SELF_SIGNED,
    defaults: null,
    ...stamp(10)
  }
]);

const policyRef = (policyId: string) => {
  const policy = policies.get().find((entry) => entry.id === policyId);
  return policy
    ? { id: policy.id, projectId, name: policy.name, description: policy.description }
    : undefined;
};

const withDetails = (profile: TCertificateProfile): TCertificateProfileWithDetails => ({
  ...profile,
  certificatePolicy: policyRef(profile.certificatePolicyId)
});

const caRef = (caId?: string) =>
  [issuingCa, rootCa, ...demoCreatedCas()]
    .filter((ca) => ca.id === caId)
    .map((ca) => ({ ...ca, status: "active", isExternal: false }))[0];

export const pkiPoliciesDemo: PkiPoliciesAdapter = {
  usePolicies: ({ limit, offset }) => {
    const rows = policies.use();
    return ok({
      certificatePolicies: rows.slice(
        offset ?? 0,
        limit === undefined ? undefined : (offset ?? 0) + limit
      ),
      totalCount: rows.length
    });
  },
  usePolicy: ({ policyId }) => ok(policies.use().find((policy) => policy.id === policyId)),
  useCreatePolicy: fixtureMutation((dto) => {
    const created = {
      ...dto,
      id: crypto.randomUUID(),
      projectId,
      ...stamp(0)
    } as TCertificatePolicy;
    policies.update((rows) => [created, ...rows]);
    return created;
  }),
  useUpdatePolicy: fixtureMutation(({ policyId, ...dto }) => {
    const current = policies.get().find((policy) => policy.id === policyId);
    if (!current) throw new Error("Certificate policy not found");
    const updated = { ...current, ...dto, updatedAt: daysAgo(0) } as TCertificatePolicy;
    policies.update((rows) => rows.map((policy) => (policy.id === policyId ? updated : policy)));
    return updated;
  }),
  useDeletePolicy: fixtureMutation(({ policyId }) => {
    const current = policies.get().find((policy) => policy.id === policyId);
    if (!current) throw new Error("Certificate policy not found");
    if (demoCertificateProfiles.get().some((profile) => profile.certificatePolicyId === policyId))
      throw new Error("Profiles still use this policy. Move them to another policy first.");
    policies.update((rows) => rows.filter((policy) => policy.id !== policyId));
    return current;
  }),
  useProfiles: ({ limit, offset }) => {
    const rows = demoCertificateProfiles.use();
    return ok({
      certificateProfiles: rows.slice(
        offset ?? 0,
        limit === undefined ? undefined : (offset ?? 0) + limit
      ),
      totalCount: rows.length
    });
  },
  useProfile: ({ profileId }) => {
    policies.use();
    const profile = demoCertificateProfiles.use().find((entry) => entry.id === profileId);
    return ok(profile ? withDetails(profile) : undefined);
  },
  useCreateProfile: fixtureMutation((dto) => {
    if (demoCertificateProfiles.get().some((profile) => profile.slug === dto.slug))
      throw new Error(`A certificate profile named ${dto.slug} already exists`);
    const created: TCertificateProfile = {
      ...dto,
      id: crypto.randomUUID(),
      projectId,
      caId: dto.caId ?? null,
      enrollmentType: EnrollmentType.API,
      certificateAuthority: caRef(dto.caId),
      ...stamp(0)
    };
    demoCertificateProfiles.update((rows) => [created, ...rows]);
    return created;
  }),
  useUpdateProfile: fixtureMutation(({ profileId, ...dto }) => {
    const current = demoCertificateProfiles.get().find((profile) => profile.id === profileId);
    if (!current) throw new Error("Certificate profile not found");
    const updated = { ...current, ...dto, updatedAt: daysAgo(0) };
    demoCertificateProfiles.update((rows) =>
      rows.map((profile) => (profile.id === profileId ? updated : profile))
    );
    return updated;
  }),
  useDeleteProfile: fixtureMutation(({ profileId }) => {
    const current = demoCertificateProfiles.get().find((profile) => profile.id === profileId);
    if (!current) throw new Error("Certificate profile not found");
    demoCertificateProfiles.update((rows) => rows.filter((profile) => profile.id !== profileId));
    return current;
  }),
  useAzureAdcsTemplates: () =>
    ok({
      templates: [
        { id: "WebServer", name: "Web Server" },
        { id: "Machine", name: "Computer" }
      ]
    }),
  useAdcsTemplates: () =>
    ok({
      templates: [
        { id: "WebServer", name: "WebServer" },
        { id: "Machine", name: "Machine" }
      ]
    }),
  useSubscription: () => ok({ pkiPqc: true, pkiApprovals: true } as SubscriptionPlan)
};
