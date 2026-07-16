import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";

import { AccessScope, ProjectMembershipRole, ProjectType, ProjectVersion, TProjects } from "@app/db/schemas";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import {
  ALGORITHM_FAMILIES,
  CertExtendedKeyUsageType,
  CertKeyUsageType,
  CertPolicyState,
  CertSubjectAlternativeNameType,
  CertSubjectAttributeType
} from "@app/services/certificate-common/certificate-constants";
import { TCertificatePolicyDALFactory } from "@app/services/certificate-policy/certificate-policy-dal";
import { TCertificatePolicyInsert } from "@app/services/certificate-policy/certificate-policy-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

type TBootstrapDeps = {
  projectDAL: Pick<TProjectDALFactory, "create" | "findOne">;
  membershipDAL: Pick<TMembershipDALFactory, "create">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create">;
  certificatePolicyDAL: Pick<TCertificatePolicyDALFactory, "create">;
};

type TBootstrapInput = {
  orgId: string;
  adminUserIds?: string[];
  adminIdentityIds?: string[];
};

const PRESET_POLICIES: Omit<TCertificatePolicyInsert, "projectId">[] = [
  {
    name: "tls-server-certificate",
    description: "Standard TLS/SSL server certificate for HTTPS services and API endpoints.",
    subject: [{ type: CertSubjectAttributeType.COMMON_NAME, allowed: ["*"] }],
    sans: [
      { type: CertSubjectAlternativeNameType.DNS_NAME, allowed: ["*"] },
      { type: CertSubjectAlternativeNameType.IP_ADDRESS, allowed: ["*"] }
    ],
    keyUsages: {
      required: [CertKeyUsageType.DIGITAL_SIGNATURE],
      allowed: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT]
    },
    extendedKeyUsages: {
      required: [CertExtendedKeyUsageType.SERVER_AUTH],
      allowed: [CertExtendedKeyUsageType.SERVER_AUTH]
    },
    algorithms: {
      signature: [...ALGORITHM_FAMILIES.ECDSA.signature],
      keyAlgorithm: [...ALGORITHM_FAMILIES.ECDSA.key]
    },
    validity: { max: "365d" }
  },
  {
    name: "tls-client-certificate",
    description: "Client certificate for mutual TLS authentication and API access.",
    subject: [{ type: CertSubjectAttributeType.COMMON_NAME, allowed: ["*"] }],
    sans: [
      { type: CertSubjectAlternativeNameType.EMAIL, allowed: ["*"] },
      { type: CertSubjectAlternativeNameType.DNS_NAME, allowed: ["*"] }
    ],
    keyUsages: {
      required: [CertKeyUsageType.DIGITAL_SIGNATURE],
      allowed: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_AGREEMENT]
    },
    extendedKeyUsages: {
      required: [CertExtendedKeyUsageType.CLIENT_AUTH],
      allowed: [CertExtendedKeyUsageType.CLIENT_AUTH]
    },
    algorithms: {
      signature: [...ALGORITHM_FAMILIES.ECDSA.signature],
      keyAlgorithm: [...ALGORITHM_FAMILIES.ECDSA.key]
    },
    validity: { max: "365d" }
  },
  {
    name: "code-signing-certificate",
    description: "Certificate for signing software, executables, and packages. Requires hardware security modules.",
    subject: [{ type: CertSubjectAttributeType.COMMON_NAME, allowed: ["*"] }],
    sans: [{ type: CertSubjectAlternativeNameType.EMAIL, allowed: ["*"] }],
    keyUsages: {
      required: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.NON_REPUDIATION],
      allowed: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.NON_REPUDIATION]
    },
    extendedKeyUsages: {
      required: [CertExtendedKeyUsageType.CODE_SIGNING],
      allowed: [CertExtendedKeyUsageType.CODE_SIGNING, CertExtendedKeyUsageType.TIME_STAMPING]
    },
    algorithms: {
      signature: [...ALGORITHM_FAMILIES.RSA.signature],
      keyAlgorithm: [...ALGORITHM_FAMILIES.RSA.key]
    },
    validity: { max: "365d" }
  },
  {
    name: "device-certificate",
    description: "Certificate for IoT devices and embedded systems authentication. IEEE 802.1AR compliant.",
    subject: [{ type: CertSubjectAttributeType.COMMON_NAME, allowed: ["*"] }],
    sans: [
      { type: CertSubjectAlternativeNameType.DNS_NAME, allowed: ["*"] },
      { type: CertSubjectAlternativeNameType.IP_ADDRESS, allowed: ["*"] }
    ],
    keyUsages: {
      required: [CertKeyUsageType.DIGITAL_SIGNATURE],
      allowed: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_AGREEMENT]
    },
    extendedKeyUsages: {
      required: [CertExtendedKeyUsageType.CLIENT_AUTH],
      allowed: [CertExtendedKeyUsageType.CLIENT_AUTH, CertExtendedKeyUsageType.SERVER_AUTH]
    },
    algorithms: {
      signature: [...ALGORITHM_FAMILIES.ECDSA.signature],
      keyAlgorithm: [...ALGORITHM_FAMILIES.ECDSA.key]
    },
    validity: { max: "365d" }
  },
  {
    name: "user-certificate",
    description: "Personal certificate for user authentication and email signing. FIPS 201 PIV compliant.",
    subject: [{ type: CertSubjectAttributeType.COMMON_NAME, allowed: ["*"] }],
    sans: [{ type: CertSubjectAlternativeNameType.EMAIL, allowed: ["*"] }],
    keyUsages: {
      required: [CertKeyUsageType.DIGITAL_SIGNATURE],
      allowed: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT, CertKeyUsageType.KEY_AGREEMENT]
    },
    extendedKeyUsages: {
      required: [CertExtendedKeyUsageType.CLIENT_AUTH, CertExtendedKeyUsageType.EMAIL_PROTECTION],
      allowed: [CertExtendedKeyUsageType.CLIENT_AUTH, CertExtendedKeyUsageType.EMAIL_PROTECTION]
    },
    algorithms: {
      signature: [...ALGORITHM_FAMILIES.ECDSA.signature],
      keyAlgorithm: [...ALGORITHM_FAMILIES.ECDSA.key]
    },
    validity: { max: "365d" }
  },
  {
    name: "email-protection-certificate",
    description: "S/MIME certificate for email encryption and digital signing. RFC 8550 compliant.",
    subject: [{ type: CertSubjectAttributeType.COMMON_NAME, allowed: ["*"] }],
    sans: [{ type: CertSubjectAlternativeNameType.EMAIL, allowed: ["*"] }],
    keyUsages: {
      required: [CertKeyUsageType.DIGITAL_SIGNATURE],
      allowed: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT, CertKeyUsageType.KEY_AGREEMENT]
    },
    extendedKeyUsages: {
      required: [CertExtendedKeyUsageType.EMAIL_PROTECTION],
      allowed: [CertExtendedKeyUsageType.EMAIL_PROTECTION]
    },
    algorithms: {
      signature: [...ALGORITHM_FAMILIES.RSA.signature],
      keyAlgorithm: [...ALGORITHM_FAMILIES.RSA.key]
    },
    validity: { max: "365d" }
  },
  {
    name: "dual-purpose-server-certificate",
    description: "Certificate for services requiring both server and client authentication capabilities",
    subject: [{ type: CertSubjectAttributeType.COMMON_NAME, allowed: ["*"] }],
    sans: [
      { type: CertSubjectAlternativeNameType.DNS_NAME, allowed: ["*"] },
      { type: CertSubjectAlternativeNameType.IP_ADDRESS, allowed: ["*"] }
    ],
    keyUsages: {
      required: [CertKeyUsageType.DIGITAL_SIGNATURE],
      allowed: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT, CertKeyUsageType.KEY_AGREEMENT]
    },
    extendedKeyUsages: {
      required: [CertExtendedKeyUsageType.SERVER_AUTH, CertExtendedKeyUsageType.CLIENT_AUTH],
      allowed: [CertExtendedKeyUsageType.SERVER_AUTH, CertExtendedKeyUsageType.CLIENT_AUTH]
    },
    algorithms: {
      signature: [...ALGORITHM_FAMILIES.ECDSA.signature],
      keyAlgorithm: [...ALGORITHM_FAMILIES.ECDSA.key]
    },
    validity: { max: "365d" }
  },
  {
    name: "intermediate-ca-certificate",
    description:
      "Certificate for intermediate Certificate Authorities. Allows signing end-entity certificates and CRLs.",
    subject: [
      { type: CertSubjectAttributeType.COMMON_NAME, allowed: ["*"] },
      { type: CertSubjectAttributeType.ORGANIZATION, allowed: ["*"] }
    ],
    sans: [],
    keyUsages: {
      required: [CertKeyUsageType.KEY_CERT_SIGN, CertKeyUsageType.CRL_SIGN],
      allowed: [CertKeyUsageType.KEY_CERT_SIGN, CertKeyUsageType.CRL_SIGN, CertKeyUsageType.DIGITAL_SIGNATURE]
    },
    extendedKeyUsages: {
      required: [],
      allowed: [CertExtendedKeyUsageType.OCSP_SIGNING]
    },
    algorithms: {
      signature: [...ALGORITHM_FAMILIES.RSA.signature, ...ALGORITHM_FAMILIES.ECDSA.signature],
      keyAlgorithm: [...ALGORITHM_FAMILIES.RSA.key, ...ALGORITHM_FAMILIES.ECDSA.key]
    },
    validity: { max: "10y" },
    basicConstraints: {
      isCA: CertPolicyState.REQUIRED,
      maxPathLength: 0
    }
  }
];

export const bootstrapCertManagerProject = async (
  { orgId, adminUserIds = [], adminIdentityIds = [] }: TBootstrapInput,
  { projectDAL, membershipDAL, membershipRoleDAL, certificatePolicyDAL }: TBootstrapDeps,
  tx: Knex
): Promise<{ project: TProjects; created: boolean }> => {
  const existing = await projectDAL.findOne({ orgId, type: ProjectType.CertificateManager }, tx);
  if (existing) {
    return { project: existing, created: false };
  }

  const slug = slugify(`cert-manager-${alphaNumericNanoId(4)}`);

  const project = await projectDAL.create(
    {
      name: "Certificate Manager",
      slug,
      type: ProjectType.CertificateManager,
      orgId,
      version: ProjectVersion.V3,
      pitVersionLimit: 10
    },
    tx
  );

  for (const userId of adminUserIds) {
    // eslint-disable-next-line no-await-in-loop
    const membership = await membershipDAL.create(
      {
        scope: AccessScope.Project,
        scopeOrgId: orgId,
        scopeProjectId: project.id,
        actorUserId: userId,
        isActive: true
      },
      tx
    );

    // eslint-disable-next-line no-await-in-loop
    await membershipRoleDAL.create(
      {
        membershipId: membership.id,
        role: ProjectMembershipRole.Admin
      },
      tx
    );
  }

  for (const identityId of adminIdentityIds) {
    // eslint-disable-next-line no-await-in-loop
    const membership = await membershipDAL.create(
      {
        scope: AccessScope.Project,
        scopeOrgId: orgId,
        scopeProjectId: project.id,
        actorIdentityId: identityId,
        isActive: true
      },
      tx
    );

    // eslint-disable-next-line no-await-in-loop
    await membershipRoleDAL.create(
      {
        membershipId: membership.id,
        role: ProjectMembershipRole.Admin
      },
      tx
    );
  }

  for (const preset of PRESET_POLICIES) {
    // eslint-disable-next-line no-await-in-loop
    await certificatePolicyDAL.create({ ...preset, projectId: project.id }, tx);
  }

  return { project, created: true };
};
