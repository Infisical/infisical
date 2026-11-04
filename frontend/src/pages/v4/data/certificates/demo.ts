import { createMongoAbility } from "@casl/ability";

import {
  ProjectPermissionCertificateActions,
  type ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { CaStatus, CaType, InternalCaType } from "@app/hooks/api/ca/enums";
import type { TInternalCertificateAuthority } from "@app/hooks/api/ca/types";
import {
  EnrollmentType,
  IssuerType,
  type TCertificateProfile
} from "@app/hooks/api/certificateProfiles/types";
import { isPqcAlgorithm } from "@app/hooks/api/certificates/constants";
import {
  CertExtendedKeyUsage,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertSource,
  CertStatus
} from "@app/hooks/api/certificates/enums";
import type { TCertificate, TDashboardDistribution } from "@app/hooks/api/certificates/types";
import { SigningAlgorithm } from "@app/hooks/api/cmeks/types";
import {
  PkiInstallationLocationType,
  PkiInstallationType,
  type TPkiInstallation
} from "@app/hooks/api/pkiDiscovery/types";
import {
  SignerKeyAlgorithm,
  SignerStatus,
  SigningActorType,
  SigningOperationStatus,
  type TSigner,
  type TSigningOperation
} from "@app/hooks/api/signers/types";

import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { CertificatesAdapter } from "./contract";

const projectId = "internal-pki";
const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString();

const authority = (
  id: string,
  name: string,
  type: InternalCaType,
  notAfter: string,
  parentCaId?: string
): TInternalCertificateAuthority => ({
  id,
  projectId,
  type: CaType.INTERNAL,
  status: CaStatus.ACTIVE,
  name,
  enableDirectIssuance: true,
  configuration: {
    type,
    commonName: name,
    organization: "Acme Corp",
    ou: "Security",
    country: "CA",
    province: "British Columbia",
    locality: "Vancouver",
    maxPathLength: type === InternalCaType.ROOT ? -1 : 0,
    keyAlgorithm: CertKeyAlgorithm.ECDSA_P384,
    notAfter,
    parentCaId
  }
});

const authorities = [
  authority(
    "8d2f4c61-3a7e-4b19-9f05-c6e1a2b7d438",
    "Acme Issuing CA G2",
    InternalCaType.INTERMEDIATE,
    "2030-04-01T00:00:00Z",
    "1b7e9a30-5c4d-4f82-a6e3-0d9f2c8b5e71"
  ),
  authority(
    "1b7e9a30-5c4d-4f82-a6e3-0d9f2c8b5e71",
    "Acme Internal Root CA",
    InternalCaType.ROOT,
    "2036-01-09T00:00:00Z"
  )
];
const [issuing, root] = authorities;

const profile = (
  id: string,
  slug: string,
  enrollmentType: EnrollmentType,
  caId: string
): TCertificateProfile => ({
  id,
  projectId,
  caId,
  certificatePolicyId: `policy-${slug}`,
  slug,
  enrollmentType,
  issuerType: IssuerType.CA,
  createdAt: "2025-09-01T00:00:00Z",
  updatedAt: "2025-09-01T00:00:00Z"
});

const profiles = [
  profile("4a6c2e81-0b3d-4f57-8e19-7d2a5c0f3b64", "tls-server", EnrollmentType.API, issuing.id),
  profile("b9e03d57-6f21-4c8a-91d4-2e7b8a6c0f15", "mtls-client", EnrollmentType.EST, issuing.id),
  profile("e2c75a19-8d40-4b6e-a3f2-5c1d9e0b7a28", "code-signing", EnrollmentType.API, root.id)
];
const [tlsServer, mtlsClient, codeSigning] = profiles;

const usages: Record<string, Pick<TCertificate, "keyUsages" | "extendedKeyUsages">> = {
  [tlsServer.id]: {
    keyUsages: [CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT],
    extendedKeyUsages: [CertExtendedKeyUsage.SERVER_AUTH]
  },
  [mtlsClient.id]: {
    keyUsages: [CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT],
    extendedKeyUsages: [CertExtendedKeyUsage.CLIENT_AUTH]
  },
  [codeSigning.id]: {
    keyUsages: [CertKeyUsage.DIGITAL_SIGNATURE],
    extendedKeyUsages: [CertExtendedKeyUsage.CODE_SIGNING]
  }
};

const certificate = (
  id: string,
  commonName: string,
  altNames: string[],
  serialNumber: string,
  issuedDaysAgo: number,
  expiresInDays: number,
  issuedBy: TCertificateProfile,
  keyAlgorithm: CertKeyAlgorithm,
  extra: Partial<TCertificate> = {}
): TCertificate => {
  const ca = authorities.find((entry) => entry.id === issuedBy.caId) ?? issuing;
  return {
    id,
    caId: ca.id,
    caName: ca.name,
    profileId: issuedBy.id,
    profileName: issuedBy.slug,
    enrollmentType: issuedBy.enrollmentType,
    status: CertStatus.ACTIVE,
    friendlyName: commonName,
    commonName,
    subjectAltNames: altNames.join(", "),
    altNames: altNames.join(", "),
    serialNumber,
    notBefore: day(-issuedDaysAgo),
    notAfter: day(expiresInDays),
    ...usages[issuedBy.id],
    keyAlgorithm,
    signatureAlgorithm: keyAlgorithm.startsWith("RSA") ? "RSA-SHA256" : "ECDSA-SHA384",
    subject: {
      commonName,
      organization: "Acme Corp",
      organizationalUnit: "Platform",
      locality: "Vancouver",
      state: "British Columbia",
      country: "CA"
    },
    basicConstraints: { isCA: false },
    hasPrivateKey: true,
    source: CertSource.Issued,
    ...extra
  };
};

const store = createFixtureStore<TCertificate[]>([
  certificate(
    "0f6b2d84-1e9a-4c37-b5d2-8a3e7c1f9d06",
    "api.acme.dev",
    ["api.acme.dev", "api-internal.acme.dev"],
    "4F:A1:9C:2B:7E:11:D0:E2",
    281,
    84,
    tlsServer,
    CertKeyAlgorithm.RSA_2048,
    { applicationName: "payments-api", renewBeforeDays: 30 }
  ),
  certificate(
    "6c1e8a3f-4b2d-4f90-8e75-d03a9b6c2e41",
    "payments.acme.dev",
    ["payments.acme.dev", "checkout.acme.dev", "webhooks.acme.dev"],
    "61:0B:E4:93:5A:C7:28:4D",
    352,
    13,
    tlsServer,
    CertKeyAlgorithm.RSA_2048,
    { applicationName: "payments-api" }
  ),
  certificate(
    "a3d97f02-5e6b-4c18-9a4f-1b8e2c7d6053",
    "grpc.platform-core.internal",
    ["grpc.platform-core.internal"],
    "2C:88:F1:06:B3:9E:47:5A",
    83,
    7,
    mtlsClient,
    CertKeyAlgorithm.ECDSA_P256,
    { applicationName: "platform-core", renewBeforeDays: 7 }
  ),
  certificate(
    "d84c1b6e-2f73-4a95-b0e8-7c5a3d9f1e26",
    "dashboard.acme.dev",
    ["dashboard.acme.dev", "app.acme.dev"],
    "7D:3E:20:AF:C4:59:1B:86",
    50,
    40,
    { ...tlsServer, enrollmentType: EnrollmentType.ACME },
    CertKeyAlgorithm.ECDSA_P256,
    { applicationName: "web-dashboard", renewBeforeDays: 30 }
  ),
  certificate(
    "2e5f8c97-0a4b-4d61-8f3c-9b7d1e6a2c58",
    "*.edge.acme.dev",
    ["*.edge.acme.dev", "edge.acme.dev"],
    "0A:5F:C2:71:E8:34:99:D3",
    63,
    27,
    { ...tlsServer, enrollmentType: EnrollmentType.ACME },
    CertKeyAlgorithm.ECDSA_P256,
    { renewBeforeDays: 30, source: CertSource.Discovered }
  ),
  certificate(
    "7b3a0e5d-9c81-4f26-a4d7-3e2c8b5f0a19",
    "kafka-broker-1.platform-core.internal",
    ["kafka-broker-1.platform-core.internal"],
    "93:C0:4A:1E:6B:F2:58:07",
    325,
    40,
    mtlsClient,
    CertKeyAlgorithm.RSA_4096,
    {
      applicationName: "platform-core",
      status: CertStatus.RENEWED,
      renewedByCertificateId: "a3d97f02-5e6b-4c18-9a4f-1b8e2c7d6053"
    }
  ),
  certificate(
    "c56e2a18-7d9f-4b03-8e61-4a0b5c3d9f72",
    "release-signer",
    [],
    "B7:12:6D:E0:43:8A:F9:21",
    226,
    505,
    codeSigning,
    CertKeyAlgorithm.ECDSA_P384
  ),
  certificate(
    "93f1d7a4-6b2e-4c58-a0d9-5e8c2b7a1f36",
    "vault-agent.acme.dev",
    ["vault-agent.acme.dev"],
    "5E:A9:03:D7:2F:C1:6B:48",
    129,
    236,
    mtlsClient,
    CertKeyAlgorithm.RSA_2048,
    { source: CertSource.Imported }
  ),
  certificate(
    "5d8b4f20-3c6a-4e17-9b52-0f7e1a8d3c64",
    "legacy-billing.acme.dev",
    ["legacy-billing.acme.dev"],
    "18:F4:B2:9D:60:E5:3C:7A",
    263,
    102,
    tlsServer,
    CertKeyAlgorithm.RSA_2048,
    { status: CertStatus.REVOKED }
  ),
  certificate(
    "e0a6c3b9-8f14-4d72-b6e5-2c9a7d0f4b83",
    "staging.acme.dev",
    ["staging.acme.dev", "staging-api.acme.dev"],
    "C3:7B:55:0E:A2:19:D8:F4",
    97,
    -7,
    { ...tlsServer, enrollmentType: EnrollmentType.ACME },
    CertKeyAlgorithm.ECDSA_P256,
    { status: CertStatus.EXPIRED }
  ),
  certificate(
    "8e4a1c07-2b9d-4f63-a5e0-6d3c9f1b7a42",
    "pq-gateway.acme.dev",
    ["pq-gateway.acme.dev"],
    "A4:2D:91:6F:0C:B8:E3:57",
    20,
    25,
    tlsServer,
    CertKeyAlgorithm.ML_DSA_65,
    { applicationName: "platform-core", renewBeforeDays: 10 }
  )
]);

const installation = (
  id: string,
  name: string,
  type: PkiInstallationType,
  locationDetails: TPkiInstallation["locationDetails"],
  seenHoursAgo: number
): TPkiInstallation => ({
  id,
  projectId,
  locationType: PkiInstallationLocationType.Network,
  locationDetails,
  locationFingerprint: id,
  name,
  type,
  metadata: null,
  lastSeenAt: new Date(Date.now() - seenHoursAgo * 36e5).toISOString(),
  createdAt: day(-30),
  updatedAt: day(-1)
});

const installations = [
  installation(
    "f4b81c2e-7a3d-4e60-95b8-1d6c0e2a7f39",
    "lb-prod-1",
    PkiInstallationType.LoadBalancer,
    { ipAddress: "10.0.4.12", port: 443, gatewayName: "prod-us-east" },
    2
  ),
  installation(
    "3a9e5d71-0c8b-4f24-a6d3-7e2b1f9c5a08",
    "ingress-nginx",
    PkiInstallationType.Container,
    {
      fqdn: "ingress.prod-us-east.acme.internal",
      port: 443,
      gatewayName: "prod-us-east"
    },
    5
  )
];

const keySize = (algorithm?: string | null) => Number(algorithm?.match(/(\d+)/)?.[1] ?? 0);
const asList = (value?: string | string[]) =>
  typeof value === "string" ? value.split(",") : (value ?? []);
const within = (value: string, from?: Date, to?: Date) =>
  (!from || new Date(value) >= from) && (!to || new Date(value) <= to);
const result = <T>(data: T) => ({ data, isPending: false, error: null });

const distribution = (
  certs: TCertificate[],
  key: (cert: TCertificate) => { id?: string; label: string }
): TDashboardDistribution[] =>
  Object.values(
    certs.reduce<Record<string, TDashboardDistribution>>((groups, cert) => {
      const { id, label } = key(cert);
      const group = groups[label] ?? { id, label, count: 0 };
      return { ...groups, [label]: { ...group, count: group.count + 1 } };
    }, {})
  );

const bucketCounts = (labels: string[], values: string[]) =>
  labels.map((bucket) => ({ bucket, count: values.filter((value) => value === bucket).length }));

const expirationBucket = (cert: TCertificate) => {
  const days = (new Date(cert.notAfter).getTime() - Date.now()) / 864e5;
  if (days < 0) return "expired";
  if (days <= 7) return "0-7d";
  if (days <= 30) return "8-30d";
  if (days <= 60) return "31-60d";
  if (days <= 90) return "61-90d";
  return "90d+";
};

const validityBucket = (cert: TCertificate) => {
  const days = (new Date(cert.notAfter).getTime() - new Date(cert.notBefore).getTime()) / 864e5;
  if (days >= 200) return ">=200d";
  if (days >= 100) return "100-199d";
  if (days >= 48) return "48-99d";
  return "<=47d";
};

const periodKeys = (range = "30d") => {
  const days = { "7d": 7, "30d": 30, "6m": 180 }[range] ?? 30;
  const monthly = days > 30;
  const now = new Date();
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - days);
  if (monthly) cursor.setDate(1);
  const keys: string[] = [];
  while (cursor <= now) {
    keys.push(cursor.toISOString().slice(0, monthly ? 7 : 10));
    if (monthly) cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + 1);
  }
  return { keys, scale: monthly ? 24 : 1 };
};

const wave = (index: number, seed: number, peak: number) =>
  Math.round(((Math.sin(index * 0.6 + seed) + 1) / 2) * peak);

const signers: TSigner[] = [
  {
    id: "5b1f7c3a-8e2d-4a69-b0c4-9d6e3f2a1b85",
    projectId,
    name: "release-signer",
    description: "Signs production release artifacts",
    status: SignerStatus.Active,
    certificateId: "c56e2a18-7d9f-4b03-8e61-4a0b5c3d9f72",
    keyAlgorithm: SignerKeyAlgorithm.ECDSA_P384,
    lastSignedAt: day(-1),
    createdAt: day(-226),
    updatedAt: day(-1)
  },
  {
    id: "c3a8e041-6d7b-4f12-9e5c-2b4f8a0d6e93",
    projectId,
    name: "firmware-signer",
    description: "Signs device firmware images",
    status: SignerStatus.Active,
    keyAlgorithm: SignerKeyAlgorithm.RSA_4096,
    lastSignedAt: day(-2),
    createdAt: day(-180),
    updatedAt: day(-2)
  }
];

const signingOperations: TSigningOperation[] = signers.flatMap((signer, signerIndex) =>
  Array.from({ length: 90 }, (_, daysAgo) =>
    Array.from({ length: wave(daysAgo, signerIndex * 2, 3) }, (__, index) => ({
      id: `${signer.id.slice(0, 8)}-${daysAgo}-${index}`,
      signerId: signer.id,
      projectId,
      status:
        (daysAgo + index + signerIndex) % 9 === 0
          ? SigningOperationStatus.Failed
          : SigningOperationStatus.Success,
      signingAlgorithm:
        signer.keyAlgorithm === SignerKeyAlgorithm.RSA_4096
          ? SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_256
          : SigningAlgorithm.ECDSA_SHA_384,
      dataHash: `sha256:${(daysAgo * 7919 + index).toString(16).padStart(8, "0")}`,
      actorType: SigningActorType.Identity,
      actorId: "ci-release-bot",
      actorName: "ci-release-bot",
      createdAt: new Date(Date.now() - (daysAgo * 24 + index * 3) * 36e5).toISOString()
    }))
  ).flat()
);

const projectPermission = {
  permission: createMongoAbility<ProjectPermissionSet>([
    {
      action: ProjectPermissionCertificateActions.Read,
      subject: ProjectPermissionSub.Certificates
    }
  ]),
  memberships: [{ roles: [{ role: "admin" }] }]
};

const change = (id: string, patch: Partial<TCertificate>) => {
  store.update((certs) => certs.map((cert) => (cert.id === id ? { ...cert, ...patch } : cert)));
  return store.get().find((cert) => cert.id === id)!;
};

export const certificatesDemo: CertificatesAdapter = {
  useInstanceState: () =>
    result({
      activeProjectId: projectId,
      projects: [
        {
          id: projectId,
          name: projectId,
          slug: projectId,
          createdAt: day(-400)
        }
      ],
      isMultiInstance: false
    }),
  useCertificates: (dto) => {
    const needle = dto.search?.trim().toLowerCase();
    const statuses = asList(dto.status);
    const algorithms = asList(dto.keyAlgorithm);
    const sources = asList(dto.source);
    const direction = dto.sortOrder === "desc" ? -1 : 1;
    const sortKey = dto.sortBy === "notBefore" ? "notBefore" : "notAfter";
    const matched = store
      .use()
      .filter((cert) => dto.includeDeleted || !cert.deletedAt)
      .filter(
        (cert) =>
          !needle ||
          [cert.commonName, cert.serialNumber, cert.id, cert.altNames ?? ""].some((value) =>
            value.toLowerCase().includes(needle)
          )
      )
      .filter((cert) => !statuses.length || statuses.includes(cert.status))
      .filter((cert) => !algorithms.length || algorithms.includes(cert.keyAlgorithm ?? ""))
      .filter((cert) => !sources.length || sources.includes(cert.source ?? CertSource.Issued))
      .filter((cert) => !dto.keySizes?.length || dto.keySizes.includes(keySize(cert.keyAlgorithm)))
      .filter((cert) => !dto.caIds?.length || dto.caIds.includes(cert.caId))
      .filter((cert) => !dto.profileIds?.length || dto.profileIds.includes(cert.profileId ?? ""))
      .filter(
        (cert) =>
          !dto.enrollmentTypes?.length || dto.enrollmentTypes.includes(cert.enrollmentType ?? "")
      )
      .filter((cert) => within(cert.notAfter, dto.notAfterFrom, dto.notAfterTo))
      .filter((cert) => within(cert.notBefore, dto.notBeforeFrom, dto.notBeforeTo))
      .sort((a, b) => a[sortKey].localeCompare(b[sortKey]) * direction);
    return result({
      certificates: matched.slice(dto.offset, dto.offset + dto.limit),
      totalCount: matched.length
    });
  },
  useDashboardStats: () => {
    const certs = store.use().filter((cert) => !cert.deletedAt);
    const count = (status: CertStatus) => certs.filter((cert) => cert.status === status).length;
    const expiringSoon = certs.filter(
      (cert) =>
        cert.status === CertStatus.ACTIVE &&
        new Date(cert.notAfter).getTime() - Date.now() <= 30 * 864e5
    );
    return result({
      totals: {
        total: certs.length,
        active: count(CertStatus.ACTIVE),
        renewed: count(CertStatus.RENEWED),
        expiringSoon: expiringSoon.length,
        expired: count(CertStatus.EXPIRED),
        revoked: count(CertStatus.REVOKED)
      },
      expiringSoonNoAutoRenewal: expiringSoon.filter((cert) => !cert.renewBeforeDays).length,
      expiredNotRenewed: count(CertStatus.EXPIRED),
      distributions: {
        byEnrollmentMethod: distribution(certs, (cert) => ({
          label: cert.enrollmentType ?? "Other"
        })),
        byAlgorithm: distribution(certs, (cert) => ({ label: cert.keyAlgorithm ?? "Unknown" })),
        byCA: distribution(certs, (cert) => ({ id: cert.caId, label: cert.caName ?? "Unknown" })),
        byStatus: distribution(certs, (cert) => ({ label: cert.status }))
      },
      expirationBuckets: bucketCounts(
        ["expired", "0-7d", "8-30d", "31-60d", "61-90d", "90d+"],
        certs.filter((cert) => cert.status === CertStatus.ACTIVE).map(expirationBucket)
      ),
      validityBuckets: bucketCounts(
        [">=200d", "100-199d", "48-99d", "<=47d"],
        certs
          .filter(
            (cert) =>
              cert.status === CertStatus.ACTIVE &&
              cert.extendedKeyUsages?.includes(CertExtendedKeyUsage.SERVER_AUTH)
          )
          .map(validityBucket)
      )
    });
  },
  useActivityTrend: (_projectId, range) => {
    const { keys, scale } = periodKeys(range);
    return result({
      periods: keys.map((period, index) => ({
        period,
        issued: (1 + wave(index, 1, 4)) * scale,
        expired: wave(index, 4, 1) * scale,
        revoked: index % 9 === 4 ? scale : 0,
        renewed: wave(index, 2.5, 3) * scale
      }))
    });
  },
  usePqcTrend: (_projectId, range) => {
    const { keys, scale } = periodKeys(range);
    const pqcShare = store.use().filter((cert) => isPqcAlgorithm(cert.keyAlgorithm ?? "")).length;
    return result({
      periods: keys.map((period, index) => ({
        period,
        pqc: index > keys.length / 2 ? wave(index, 3, pqcShare + 1) * scale : 0,
        nonPqc: (1 + wave(index, 1, 3)) * scale
      }))
    });
  },
  useSigners: ({ offset = 0, limit = 25, search }) => {
    const matched = signers.filter((signer) => !search || signer.name.includes(search));
    return result({ signers: matched.slice(offset, offset + limit), totalCount: matched.length });
  },
  useSigningOperations: ({ signerId, offset = 0, limit = 25, status }) => {
    const matched = signingOperations.filter(
      (operation) => operation.signerId === signerId && (!status || operation.status === status)
    );
    return {
      data: signerId
        ? { operations: matched.slice(offset, offset + limit), totalCount: matched.length }
        : undefined,
      isPending: false,
      error: null
    };
  },
  useProjectPermission: () => result(projectPermission),
  useCertificate: (certificateId) => {
    const found = store.use().find((cert) => cert.id === certificateId);
    return {
      data: found ? { certificate: found } : undefined,
      isPending: false,
      error: found ? null : new Error("Certificate not found")
    };
  },
  useCertificateAuthorities: () => result(authorities),
  useCertificateProfiles: () =>
    result({ certificateProfiles: profiles, totalCount: profiles.length }),
  useInstallations: ({ certificateId }) => {
    const cert = store.use().find((entry) => entry.id === certificateId);
    const found =
      cert?.status === CertStatus.ACTIVE && cert.source !== CertSource.Imported
        ? installations
        : [];
    return result({ installations: found, totalCount: found.length });
  },
  useDeleteCertificate: fixtureMutation(({ id }) =>
    change(id, { deletedAt: new Date().toISOString() })
  ),
  useRevokeCertificate: fixtureMutation(({ id }) => change(id, { status: CertStatus.REVOKED }))
};
