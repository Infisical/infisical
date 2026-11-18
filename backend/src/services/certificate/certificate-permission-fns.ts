import { MongoAbility, subject } from "@casl/ability";

import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import {
  ResourcePermissionCertificateActions,
  ResourcePermissionSub,
  TResourceAbility
} from "@app/ee/services/permission/resource-permission";

type TCertificateSubjectFields = {
  commonName?: string | null;
  altNames?: string | null;
  serialNumber?: string | null;
  friendlyName?: string | null;
  status?: string | null;
};

type TCertificateMetadata = { key: string; value: string }[];

const splitAltNames = (altNames?: string | null) => altNames?.split(",").map((s) => s.trim());

// Subject for the certificate read check in getCert and getCertBody
export const buildCertificateReadSubject = (cert: TCertificateSubjectFields, metadata: TCertificateMetadata) =>
  subject(ProjectPermissionSub.Certificates, {
    commonName: cert.commonName ?? undefined,
    altNames: splitAltNames(cert.altNames),
    serialNumber: cert.serialNumber ?? undefined,
    metadata
  });

// Subject for the checks in getCertBundle and getCertPkcs12
export const buildCertificateBundleSubject = (cert: TCertificateSubjectFields, metadata: TCertificateMetadata) =>
  subject(ProjectPermissionSub.Certificates, {
    commonName: cert.commonName ?? undefined,
    altNames: splitAltNames(cert.altNames),
    serialNumber: cert.serialNumber ?? undefined,
    friendlyName: cert.friendlyName ?? undefined,
    status: cert.status ?? undefined,
    metadata
  });

// Certificates assigned to an application take their private-key access from the application only
export const canReadCertificatePrivateKey = ({
  applicationId,
  projectPermission,
  applicationPermission,
  certSubject
}: {
  applicationId?: string | null;
  projectPermission: MongoAbility<ProjectPermissionSet>;
  applicationPermission?: TResourceAbility | null;
  certSubject: ReturnType<typeof buildCertificateReadSubject> | ReturnType<typeof buildCertificateBundleSubject>;
}) =>
  applicationId
    ? Boolean(
        applicationPermission?.can(
          ResourcePermissionCertificateActions.ReadPrivateKey,
          ResourcePermissionSub.Certificates
        )
      )
    : projectPermission.can(ProjectPermissionCertificateActions.ReadPrivateKey, certSubject);
