import {
  AcmeDnsProvider,
  GoDaddyProductType,
  CaRenewalStatus,
  CaSigningConfigType,
  CaStatus,
  CaType,
  InternalCaType
} from "@app/hooks/api/ca/enums";
import type { TCaAutoRenewalConfig, TCaSigningConfig } from "@app/hooks/api/ca/queries";
import {
  DigiCertCaPurpose,
  type TCaCrl,
  type TCaCrossSignedCertificate,
  type TCertificateAuthority,
  type TInternalCertificateAuthority,
  type TUnifiedCertificateAuthority
} from "@app/hooks/api/ca/types";
import { EnrollmentType, IssuerType } from "@app/hooks/api/certificateProfiles/types";
import { CertKeyAlgorithm } from "@app/hooks/api/certificates/enums";
import type { THsmConnector } from "@app/hooks/api/hsmConnectors/types";
import { CertKeySource } from "@app/hooks/api/signers/types";

import { createFixtureStore, fixtureMutation } from "../fixture-store";
import type { CertificateAuthoritiesAdapter, CaPlan, TCaCertificateVersion } from "./contract";
import {
  bridgeCsr,
  crossSignedPem,
  issuingCrl,
  issuingPem,
  issuingPreviousCrl,
  issuingV1Pem,
  partnerRootPem,
  rootPem
} from "./demo-pems";

const projectId = "internal-pki";
const ready = <T>(data: T) => ({ data, isPending: false, error: null });
const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString();

const ROOT_ID = "1b7e9a30-5c4d-4f82-a6e3-0d9f2c8b5e71";
const ISSUING_ID = "8d2f4c61-3a7e-4b19-9f05-c6e1a2b7d438";
const BRIDGE_ID = "5f3a8c1e-2b7d-4e96-a0c4-9d1e6b3f7a25";
const LEGACY_ID = "c2e9b471-6d0a-4f3e-8b5c-1a7f9e2d4c60";

const subject = {
  organization: "Acme Corp",
  ou: "Security",
  country: "CA",
  province: "British Columbia",
  locality: "Vancouver"
};

const internal = (
  id: string,
  name: string,
  status: CaStatus,
  configuration: Partial<TInternalCertificateAuthority["configuration"]> &
    Pick<TInternalCertificateAuthority["configuration"], "type" | "commonName" | "keyAlgorithm">
): TInternalCertificateAuthority => ({
  id,
  projectId,
  type: CaType.INTERNAL,
  status,
  name,
  enableDirectIssuance: true,
  configuration: {
    ...subject,
    maxPathLength: configuration.type === InternalCaType.ROOT ? -1 : 0,
    keySource: CertKeySource.Infisical,
    disableManagedCrlDistributionPointUrl: false,
    crlDistributionPointUrls: [],
    isOcspEnabled: false,
    crlValidityDays: 7,
    ...configuration
  }
});

const dn = (commonName: string) =>
  `C=CA, ST=British Columbia, L=Vancouver, O=Acme Corp, OU=Security, CN=${commonName}`;

const initialCas = (): TUnifiedCertificateAuthority[] => [
  internal(ROOT_ID, "acme-internal-root", CaStatus.ACTIVE, {
    type: InternalCaType.ROOT,
    friendlyName: "Acme Internal Root CA",
    commonName: "Acme Internal Root CA",
    dn: dn("Acme Internal Root CA"),
    keyAlgorithm: CertKeyAlgorithm.ECDSA_P384,
    serialNumber: "4673084ded60b382b9689b5fdc238714a6e54684",
    notBefore: "2026-11-15T05:27:08Z",
    notAfter: "2036-11-12T05:27:08Z",
    activeCaCertId: "root-cert-v1"
  }),
  internal(ISSUING_ID, "acme-issuing-g2", CaStatus.ACTIVE, {
    type: InternalCaType.INTERMEDIATE,
    friendlyName: "Acme Issuing CA G2",
    commonName: "Acme Issuing CA G2",
    dn: dn("Acme Issuing CA G2"),
    keyAlgorithm: CertKeyAlgorithm.ECDSA_P384,
    parentCaId: ROOT_ID,
    serialNumber: "20521f87dc5b4354ca8059814275199a994d7682",
    notBefore: "2026-11-15T05:27:08Z",
    notAfter: "2031-11-14T05:27:08Z",
    activeCaCertId: "issuing-cert-v2",
    isOcspEnabled: true,
    crlDistributionPointUrls: ["https://crl.acme.example/issuing-g2.crl"]
  }),
  internal(BRIDGE_ID, "acme-partner-bridge", CaStatus.PENDING_CERTIFICATE, {
    type: InternalCaType.INTERMEDIATE,
    friendlyName: "Acme Partner Bridge CA",
    commonName: "Acme Partner Bridge CA",
    keyAlgorithm: CertKeyAlgorithm.RSA_4096,
    keySource: CertKeySource.Hsm,
    hsmConnectorId: "7c1e4a2b-9d3f-4e6a-8b5c-2f7d9e1a3c45",
    hsmConnectorName: "luna-prod-root"
  }),
  internal(LEGACY_ID, "acme-legacy-issuing", CaStatus.DISABLED, {
    type: InternalCaType.INTERMEDIATE,
    friendlyName: "Acme Legacy Issuing CA",
    commonName: "Acme Legacy Issuing CA",
    dn: dn("Acme Legacy Issuing CA"),
    keyAlgorithm: CertKeyAlgorithm.RSA_2048,
    keySource: CertKeySource.AwsKms,
    appConnectionId: "aws-kms-prod",
    appConnectionName: "aws-kms-prod",
    region: "us-west-2",
    externalKeyId: "arn:aws:kms:us-west-2:123456789012:key/2f4e6a8c-1b3d-4f5a-9c7e-0d2b4f6a8c1e",
    parentCaId: ROOT_ID,
    serialNumber: "3a91c7e0f25b48d6a1e3c5b7d9f02468ace13579",
    notBefore: "2023-02-01T00:00:00Z",
    notAfter: day(21)
  }),
  {
    id: "a4d8e2f6-3b1c-4a59-8e7d-6c0f2b9a1d34",
    projectId,
    type: CaType.ACME,
    status: CaStatus.ACTIVE,
    name: "lets-encrypt-production",
    enableDirectIssuance: true,
    configuration: {
      dnsAppConnectionId: "aws-route53-prod",
      dnsProviderConfig: {
        provider: AcmeDnsProvider.ROUTE53,
        hostedZoneId: "Z04812343HJ7K2LMNOPQ"
      },
      directoryUrl: "https://acme-v02.api.letsencrypt.org/directory",
      accountEmail: "pki-team@acme.example"
    }
  },
  {
    id: "e7b3c9d1-5a2f-4e8b-9c6d-0f4a1b7e3d52",
    projectId,
    type: CaType.DIGICERT,
    status: CaStatus.ACTIVE,
    name: "digicert-secure-site",
    enableDirectIssuance: true,
    configuration: {
      appConnectionId: "digicert-prod",
      organizationId: 482913,
      productNameId: "ssl_plus",
      purpose: DigiCertCaPurpose.Ssl
    }
  },
  {
    id: "2c6f0a8e-4d1b-4b73-a5e9-8f3c7d1b0e46",
    projectId,
    type: CaType.AWS_PCA,
    status: CaStatus.ACTIVE,
    name: "aws-private-ca-prod",
    enableDirectIssuance: true,
    configuration: {
      appConnectionId: "aws-prod",
      certificateAuthorityArn:
        "arn:aws:acm-pca:us-east-1:123456789012:certificate-authority/9b2d4f6a-8c1e-4a3b-b5d7-e9f1a3c5b7d9",
      region: "us-east-1"
    }
  },
  {
    id: "9e1d5b3f-7c2a-4d68-b0e4-3a6c8f2d1b97",
    projectId,
    type: CaType.VENAFI_TPP,
    status: CaStatus.ACTIVE,
    name: "venafi-tpp-corp",
    enableDirectIssuance: true,
    configuration: {
      appConnectionId: "venafi-tpp-corp",
      policyDN: "\\VED\\Policy\\Certificates\\Acme\\Web"
    }
  },
  {
    id: "6b0a4e8c-2f5d-4c91-a7b3-d5e9f1c3a0b8",
    projectId,
    type: CaType.ADCS,
    status: CaStatus.DISABLED,
    name: "corp-adcs",
    enableDirectIssuance: false,
    configuration: { appConnectionId: "adcs-corp", caName: "ACME-CORP-ISSUING-CA" }
  },
  {
    id: "d3f7b1a5-9e2c-4f80-b6d4-2a8e0c6f4b13",
    projectId,
    type: CaType.GODADDY,
    status: CaStatus.ACTIVE,
    name: "godaddy-dv",
    enableDirectIssuance: true,
    configuration: { appConnectionId: "godaddy-prod", productType: GoDaddyProductType.DV_SSL }
  }
];

const cas = createFixtureStore<TUnifiedCertificateAuthority[]>(initialCas());

const certificates = createFixtureStore<Record<string, TCaCertificateVersion[]>>({
  [ROOT_ID]: [
    {
      certificate: rootPem,
      certificateChain: "",
      serialNumber: "4673084ded60b382b9689b5fdc238714a6e54684",
      version: 1
    }
  ],
  [ISSUING_ID]: [
    {
      certificate: issuingV1Pem,
      certificateChain: rootPem,
      serialNumber: "20521f87dc5b4354ca8059814275199a994d7683",
      version: 1
    },
    {
      certificate: issuingPem,
      certificateChain: rootPem,
      serialNumber: "20521f87dc5b4354ca8059814275199a994d7682",
      version: 2
    }
  ],
  [LEGACY_ID]: [
    {
      certificate: issuingV1Pem,
      certificateChain: rootPem,
      serialNumber: "3a91c7e0f25b48d6a1e3c5b7d9f02468ace13579",
      version: 1
    }
  ]
});

const crls = createFixtureStore<Record<string, TCaCrl[]>>({
  [ISSUING_ID]: [
    {
      id: "crl-issuing-1042",
      crl: issuingCrl,
      thisUpdate: day(-1),
      nextUpdate: day(6),
      crlNumber: 1042
    },
    {
      id: "crl-issuing-1041",
      crl: issuingPreviousCrl,
      thisUpdate: day(-8),
      nextUpdate: day(-1),
      crlNumber: 1041
    }
  ],
  [ROOT_ID]: [
    {
      id: "crl-root-12",
      crl: issuingPreviousCrl,
      thisUpdate: day(-3),
      nextUpdate: day(4),
      crlNumber: 12
    }
  ]
});

const crossSigned = createFixtureStore<Record<string, TCaCrossSignedCertificate | null>>({
  [ISSUING_ID]: {
    caId: ISSUING_ID,
    certificate: crossSignedPem,
    certificateChain: partnerRootPem,
    issuer: "C=US, O=Globex Trust Services, CN=Globex Partner Root R1",
    serialNumber: "6dba974bdd25441ded1c2fefcae63e767d2cb65c",
    notBefore: "2026-11-15T05:27:08Z",
    notAfter: "2028-11-14T05:27:08Z"
  }
});

const signingConfig = (caId: string, type: CaSigningConfigType, parentCaId: string | null) => ({
  id: `signing-${caId}`,
  caId,
  type,
  parentCaId,
  appConnectionId: null,
  destinationConfig: null,
  lastExternalCertificateId: null,
  createdAt: "2026-11-15T05:27:08Z",
  updatedAt: "2026-11-15T05:27:08Z"
});

const signingConfigs = createFixtureStore<Record<string, TCaSigningConfig | null>>({
  [ISSUING_ID]: signingConfig(ISSUING_ID, CaSigningConfigType.INTERNAL, ROOT_ID),
  [LEGACY_ID]: signingConfig(LEGACY_ID, CaSigningConfigType.MANUAL, null)
});

const autoRenewals = createFixtureStore<Record<string, TCaAutoRenewalConfig>>({
  [ISSUING_ID]: {
    autoRenewalEnabled: true,
    autoRenewalDaysBeforeExpiry: 30,
    lastRenewalStatus: CaRenewalStatus.SUCCESS,
    lastRenewalMessage: null,
    lastRenewalAt: day(-12)
  }
});

const noRenewal: TCaAutoRenewalConfig = {
  autoRenewalEnabled: false,
  autoRenewalDaysBeforeExpiry: null,
  lastRenewalStatus: null,
  lastRenewalMessage: null,
  lastRenewalAt: null
};

const hsmConnectors: THsmConnector[] = [
  {
    id: "7c1e4a2b-9d3f-4e6a-8b5c-2f7d9e1a3c45",
    name: "luna-prod-root",
    description: "Signs the offline root and issuing CAs",
    projectId,
    gatewayId: null,
    gatewayPoolId: "hsm-pool-north-america",
    slotLabel: "pki-root-prod",
    keyNamePrefix: "infisical-",
    createdAt: "2026-07-08T18:30:00Z",
    updatedAt: "2026-07-08T18:30:00Z"
  },
  {
    id: "2a9f6c3d-5e1b-4c8a-9f2e-6d4b8a0c1e73",
    name: "fortanix-eu",
    description: "EU data residency keys",
    projectId,
    gatewayId: "hsm-gateway-frankfurt",
    gatewayPoolId: null,
    slotLabel: "eu-issuing",
    keyNamePrefix: "infisical-",
    createdAt: "2026-08-21T09:05:00Z",
    updatedAt: "2026-08-21T09:05:00Z"
  }
];

const plan: CaPlan = {
  caCrl: true,
  pkiOcsp: true,
  pkiPqc: true,
  pkiCrossSignedCa: true,
  pkiExternalIntermediateCa: true,
  pkiEnterpriseCaIntegrations: true,
  hsm: true,
  pkiAwsKmsSigning: true
};

const connection = (id: string, name = id) => ({ id, name, projectId });

const named = <T>(entries: T[]) => ready(entries);

const byId = (caId: string) => cas.get().find((ca) => ca.id === caId);

const internalById = (caId: string) => byId(caId) as TInternalCertificateAuthority | undefined;

const toProjectCa = (ca: TInternalCertificateAuthority): TCertificateAuthority => ({
  id: ca.id,
  parentCaId: ca.configuration.parentCaId,
  projectId: ca.projectId,
  type: ca.configuration.type,
  status: ca.status,
  friendlyName: ca.configuration.friendlyName ?? ca.name,
  organization: ca.configuration.organization,
  ou: ca.configuration.ou,
  country: ca.configuration.country,
  province: ca.configuration.province,
  locality: ca.configuration.locality,
  commonName: ca.configuration.commonName,
  dn: ca.configuration.dn ?? "",
  maxPathLength: ca.configuration.maxPathLength,
  notAfter: ca.configuration.notAfter,
  notBefore: ca.configuration.notBefore,
  keyAlgorithm: ca.configuration.keyAlgorithm,
  requireTemplateForIssuance: false,
  activeCaCertId: ca.configuration.activeCaCertId,
  createdAt: "2026-11-15T05:27:08Z",
  updatedAt: "2026-11-15T05:27:08Z"
});

const patchInternal = (
  caId: string,
  change: Partial<TInternalCertificateAuthority["configuration"]>,
  status?: CaStatus
) =>
  cas.update((entries) =>
    entries.map((ca) =>
      ca.id === caId && ca.type === CaType.INTERNAL
        ? { ...ca, status: status ?? ca.status, configuration: { ...ca.configuration, ...change } }
        : ca
    )
  );

const pemsFor = (caId: string) =>
  internalById(caId)?.configuration.type === InternalCaType.ROOT
    ? { certificate: rootPem, certificateChain: "" }
    : { certificate: issuingPem, certificateChain: rootPem };

const appendCertificate = (caId: string) => {
  const entry = {
    ...pemsFor(caId),
    serialNumber: crypto.randomUUID().replace(/-/g, ""),
    version: (certificates.get()[caId] ?? []).length + 1
  };
  certificates.update((all) => ({ ...all, [caId]: [...(all[caId] ?? []), entry] }));
  return entry;
};

const activate = (
  caId: string,
  entry: TCaCertificateVersion,
  validity: { notBefore?: string; notAfter: string },
  maxPathLength?: number
) => {
  const ca = internalById(caId);
  patchInternal(
    caId,
    {
      dn: dn(ca?.configuration.commonName ?? ""),
      serialNumber: entry.serialNumber,
      activeCaCertId: `${caId}-cert-v${entry.version}`,
      notBefore: validity.notBefore ?? new Date().toISOString(),
      notAfter: validity.notAfter,
      maxPathLength: maxPathLength ?? ca?.configuration.maxPathLength
    },
    CaStatus.ACTIVE
  );
};

const install = (caId: string, maxPathLength?: number) => {
  activate(caId, appendCertificate(caId), { notAfter: day(365 * 3) }, maxPathLength);
  return { message: "Certificate installed", caId };
};

export const certificateAuthoritiesDemo: CertificateAuthoritiesAdapter = {
  useCasByType: (type) => ready(cas.use().filter((ca) => ca.type === type)),
  useExternalCas: () => ready(cas.use().filter((ca) => ca.type !== CaType.INTERNAL)),
  useProjectCas: ({ status }) =>
    ready(
      cas
        .use()
        .filter((ca): ca is TInternalCertificateAuthority => ca.type === CaType.INTERNAL)
        .filter((ca) => !status || ca.status === status)
        .map(toProjectCa)
    ),
  useCa: ({ caId }) => {
    const entries = cas.use();
    const ca = entries.find((entry) => entry.id === caId);
    return {
      data: ca,
      isPending: false,
      error: ca ? null : new Error("Certificate authority not found")
    };
  },
  useInternalCa: (caId) =>
    ready(cas.use().find((ca) => ca.id === caId) as TInternalCertificateAuthority | undefined),
  useCaCerts: (caId) => ready(certificates.use()[caId] ?? []),
  useCaCert: (caId) => {
    const current = (certificates.use()[caId] ?? []).at(-1);
    return ready(
      current
        ? {
            certificate: current.certificate,
            certificateChain: current.certificateChain,
            serialNumber: current.serialNumber
          }
        : undefined
    );
  },
  useCaCsr: (caId) => ready(byId(caId) ? bridgeCsr : undefined),
  useCaCrls: (caId) => ready(crls.use()[caId] ?? []),
  useCaCrossSignedCert: (caId) => ready(crossSigned.use()[caId] ?? null),
  useCaSigningConfig: (caId) => ready(signingConfigs.use()[caId] ?? null),
  useCaAutoRenewal: (caId) => ready(autoRenewals.use()[caId] ?? noRenewal),
  useCaQuota: () => {
    const entries = cas.use();
    return ready({
      certificateAuthorities: { used: entries.length, limit: null },
      internalCertificateAuthorities: {
        used: entries.filter((ca) => ca.type === CaType.INTERNAL).length,
        limit: null
      }
    });
  },
  useCaPlan: () => ready(plan),
  useCertificateProfile: ({ profileId }) =>
    ready(
      profileId
        ? {
            id: profileId,
            projectId,
            caId: ISSUING_ID,
            certificatePolicyId: "policy-tls-server",
            slug: "tls-server",
            enrollmentType: EnrollmentType.API,
            issuerType: IssuerType.CA,
            createdAt: "2025-09-01T00:00:00Z",
            updatedAt: "2025-09-01T00:00:00Z"
          }
        : undefined
    ),
  useHsmConnectors: () => ready(hsmConnectors),
  useAvailableConnections: (app) =>
    named([connection(`${app}-prod`), connection(`${app}-staging`)]),
  useVenafiApplications: () =>
    named([
      { id: "venafi-app-web", name: "Acme Web Platform" },
      { id: "venafi-app-iot", name: "Acme IoT Fleet" }
    ]),
  useVenafiIssuingTemplates: () =>
    named([
      { id: "venafi-tpl-subca", name: "Subordinate CA 5y" },
      { id: "venafi-tpl-subca-short", name: "Subordinate CA 1y" }
    ]),
  useAzureAdcsTemplates: () => named(["SubCA", "AcmeSubordinateCA"]),
  useAdcsTemplates: () => named([{ name: "SubCA" }, { name: "AcmeSubordinateCA" }]),
  useDigiCertOrganizations: () =>
    named([{ id: 482913, name: "Acme Corp", displayName: "Acme Corp", status: "active" }]),
  useDigiCertProducts: () =>
    named([
      { nameId: "ssl_plus", name: "Standard SSL", type: "ssl_certificate", validationType: "ov" },
      { nameId: "ssl_ev_plus", name: "EV SSL", type: "ssl_certificate", validationType: "ev" },
      {
        nameId: "code_signing",
        name: "Code Signing",
        type: "code_signing_certificate",
        validationType: "ov"
      }
    ]),
  useDigiCertOrgValidation: () => ready({ isValidated: true }),
  useGcpCloudDnsProjects: () => named([{ id: "acme-prod-dns", name: "Acme Production DNS" }]),
  useGcpCloudDnsZones: () =>
    named([{ id: "acme-example", name: "acme-example", dnsName: "acme.example." }]),
  useCloudflareZones: () => named([{ id: "cf-zone-acme", name: "acme.example" }]),
  useDnsMadeEasyZones: () => named([{ id: "dme-zone-acme", name: "acme.example" }]),
  useAzureDnsZones: () =>
    named([
      {
        id: "/subscriptions/0000/resourceGroups/dns/providers/Microsoft.Network/dnszones/acme.example",
        name: "acme.example"
      }
    ]),
  usePowerDnsZones: () => named([{ id: "acme.example.", name: "acme.example." }]),
  useUltraDnsZones: () => named([{ id: "acme.example.", name: "acme.example." }]),
  useCreateCa: fixtureMutation((dto) => {
    const created = {
      ...dto,
      id: crypto.randomUUID(),
      projectId,
      enableDirectIssuance: true
    } as TUnifiedCertificateAuthority;
    if (created.type !== CaType.INTERNAL) {
      cas.update((entries) => [...entries, created]);
      return created;
    }
    const isRoot = created.configuration.type === InternalCaType.ROOT;
    cas.update((entries) => [
      ...entries,
      { ...created, status: isRoot ? CaStatus.ACTIVE : CaStatus.PENDING_CERTIFICATE }
    ]);
    if (isRoot)
      activate(created.id, appendCertificate(created.id), {
        notAfter: new Date(created.configuration.notAfter ?? day(3650)).toISOString()
      });
    return byId(created.id) as TUnifiedCertificateAuthority;
  }),
  useUpdateCa: fixtureMutation((dto) => {
    cas.update((entries) =>
      entries.map((ca) =>
        ca.id === dto.id
          ? ({
              ...ca,
              ...dto,
              configuration: { ...ca.configuration, ...(dto.configuration ?? {}) }
            } as TUnifiedCertificateAuthority)
          : ca
      )
    );
    return byId(dto.id) as TUnifiedCertificateAuthority;
  }),
  useDeleteCa: fixtureMutation(({ id }) => {
    const removed = byId(id) as TUnifiedCertificateAuthority;
    cas.update((entries) => entries.filter((ca) => ca.id !== id));
    return removed;
  }),
  useSignIntermediate: fixtureMutation(() => ({
    certificate: issuingPem,
    certificateChain: rootPem,
    issuingCaCertificate: rootPem,
    serialNumber: crypto.randomUUID().replace(/-/g, "")
  })),
  useImportCaCertificate: fixtureMutation(({ caId }) => install(caId)),
  useImportCaCrossSignedCert: fixtureMutation(({ caId, certificate, certificateChain }) => {
    const entry = {
      caId,
      certificate,
      certificateChain,
      issuer: "C=US, O=Globex Trust Services, CN=Globex Partner Root R1",
      serialNumber: crypto.randomUUID().replace(/-/g, ""),
      notBefore: new Date().toISOString(),
      notAfter: day(730)
    };
    crossSigned.update((current) => ({ ...current, [caId]: entry }));
    return entry;
  }),
  useDeleteCaCrossSignedCert: fixtureMutation(({ caId }) => {
    crossSigned.update((current) => ({ ...current, [caId]: null }));
    return { caId };
  }),
  useRenewCa: fixtureMutation(({ caId, notAfter }) => {
    const next = appendCertificate(caId);
    activate(caId, next, { notAfter });
    return {
      certificate: next.certificate,
      certificateChain: next.certificateChain,
      serialNumber: next.serialNumber,
      projectId
    };
  }),
  useRegenerateCaCrl: fixtureMutation(({ caId }) => {
    const current = crls.get()[caId] ?? [];
    const crl = {
      id: crypto.randomUUID(),
      crl: issuingCrl,
      thisUpdate: new Date().toISOString(),
      nextUpdate: day(7),
      crlNumber: (current[0]?.crlNumber ?? 0) + 1
    };
    crls.update((all) => ({ ...all, [caId]: [crl, ...current] }));
    return { crl };
  }),
  useInstallCaCertificateVenafi: fixtureMutation(({ caId, maxPathLength }) =>
    install(caId, maxPathLength)
  ),
  useInstallCaCertificateAdcs: fixtureMutation(({ caId, maxPathLength }) =>
    install(caId, maxPathLength)
  ),
  useInstallCaCertificateAdcsNative: fixtureMutation(({ caId, maxPathLength }) =>
    install(caId, maxPathLength)
  ),
  useCreateCaSigningConfig: fixtureMutation(
    ({ caId, type, parentCaId, appConnectionId, destinationConfig }) => {
      const entry = {
        ...signingConfig(caId, type as CaSigningConfigType, parentCaId ?? null),
        appConnectionId: appConnectionId ?? null,
        destinationConfig: destinationConfig ?? null
      };
      signingConfigs.update((all) => ({ ...all, [caId]: entry }));
      return entry;
    }
  ),
  useUpdateCaSigningConfig: fixtureMutation(({ caId, ...change }) => {
    signingConfigs.update((all) => {
      const current = all[caId];
      return current
        ? { ...all, [caId]: { ...current, ...change, updatedAt: new Date().toISOString() } }
        : all;
    });
    return signingConfigs.get()[caId];
  }),
  useUpdateCaAutoRenewal: fixtureMutation(
    ({ caId, autoRenewalEnabled, autoRenewalDaysBeforeExpiry }) => {
      const current = autoRenewals.get()[caId] ?? noRenewal;
      const next = {
        ...current,
        autoRenewalEnabled: autoRenewalEnabled ?? current.autoRenewalEnabled,
        autoRenewalDaysBeforeExpiry:
          autoRenewalDaysBeforeExpiry ?? current.autoRenewalDaysBeforeExpiry
      };
      autoRenewals.update((all) => ({ ...all, [caId]: next }));
      return next;
    }
  ),
  useGenerateCaCertificate: fixtureMutation(({ caId, notBefore, notAfter, maxPathLength }) => {
    const version = appendCertificate(caId);
    activate(caId, version, { notBefore, notAfter }, maxPathLength);
    return {
      certificate: version.certificate,
      certificateChain: version.certificateChain,
      serialNumber: version.serialNumber
    };
  })
};
