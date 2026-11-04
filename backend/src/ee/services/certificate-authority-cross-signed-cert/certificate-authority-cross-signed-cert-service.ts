import { ForbiddenError, MongoAbility, subject } from "@casl/ability";
import * as x509 from "@peculiar/x509";

import { ActionProjectType, TCertificateAuthorityCrossSignedCerts } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { CaStatus } from "@app/services/certificate-authority/certificate-authority-enums";
import {
  expandInternalCa,
  getCaCertChain,
  getPublicKeyFingerprint
} from "@app/services/certificate-authority/certificate-authority-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateAuthorityCrossSignedCertDALFactory } from "./certificate-authority-cross-signed-cert-dal";
import { validateCrossSignedCertificate } from "./certificate-authority-cross-signed-cert-fns";
import {
  TDeleteCaCrossSignedCertDTO,
  TGetCaCrossSignedCertDTO,
  TImportCaCrossSignedCertDTO
} from "./certificate-authority-cross-signed-cert-types";

type TCertificateAuthorityCrossSignedCertServiceFactoryDep = {
  certificateAuthorityDAL: Pick<
    TCertificateAuthorityDALFactory,
    "findByIdWithAssociatedCa" | "findById" | "findMaxSubCaDepth"
  >;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findById">;
  certificateAuthorityCrossSignedCertDAL: Pick<
    TCertificateAuthorityCrossSignedCertDALFactory,
    "findOne" | "findByCaIdForUpdate" | "upsert" | "delete" | "transaction"
  >;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TCertificateAuthorityCrossSignedCertServiceFactory = ReturnType<
  typeof certificateAuthorityCrossSignedCertServiceFactory
>;

export const certificateAuthorityCrossSignedCertServiceFactory = ({
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  certificateAuthorityCrossSignedCertDAL,
  projectDAL,
  kmsService,
  permissionService,
  licenseService
}: TCertificateAuthorityCrossSignedCertServiceFactoryDep) => {
  const $toCrossSignedCertMetadata = (crossSignedCert: TCertificateAuthorityCrossSignedCerts) => ({
    caId: crossSignedCert.caId,
    issuer: crossSignedCert.issuer,
    serialNumber: crossSignedCert.serialNumber,
    notBefore: crossSignedCert.notBefore,
    notAfter: crossSignedCert.notAfter
  });

  const $decryptCaCrossSignedCert = async (
    projectId: string,
    crossSignedCert: TCertificateAuthorityCrossSignedCerts
  ) => {
    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId,
      projectDAL,
      kmsService
    });
    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });

    const decryptedCertificate = await kmsDecryptor({ cipherTextBlob: crossSignedCert.encryptedCertificate });
    const decryptedCertificateChain = await kmsDecryptor({ cipherTextBlob: crossSignedCert.encryptedCertificateChain });

    return {
      ...$toCrossSignedCertMetadata(crossSignedCert),
      certificate: new x509.X509Certificate(decryptedCertificate).toString("pem"),
      certificateChain: decryptedCertificateChain.toString("utf-8")
    };
  };

  const $getInternalCaInActorOrg = async (caId: string, actorOrgId: string) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    const project = ca.internalCa?.id ? await projectDAL.findById(ca.projectId) : undefined;
    if (!ca.internalCa?.id || project?.orgId !== actorOrgId) {
      throw new NotFoundError({ message: `CA with ID '${caId}' not found` });
    }
    return { ...ca, internalCa: ca.internalCa };
  };

  const $assertCanManageCrossSignedCert = (permission: MongoAbility<ProjectPermissionSet>, caName: string) => {
    const caSubject = subject(ProjectPermissionSub.CertificateAuthorities, { name: caName });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateAuthorityActions.IssueCACertificate,
      caSubject
    );
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCertificateAuthorityActions.Edit, caSubject);
  };

  const importCaCrossSignedCert = async ({
    caId,
    certificate,
    certificateChain,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TImportCaCrossSignedCertDTO) => {
    const ca = await $getInternalCaInActorOrg(caId, actorOrgId);

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    $assertCanManageCrossSignedCert(permission, ca.name);

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.pkiCrossSignedCa) {
      throw new BadRequestError({
        message:
          "Failed to import a cross-signed certificate due to plan restriction. Upgrade plan to use cross-signed CA certificates."
      });
    }

    if (ca.status !== CaStatus.ACTIVE || !ca.internalCa.activeCaCertId) {
      throw new BadRequestError({
        message: `CA '${ca.name}' is not active. Install its certificate and enable it before importing a cross-signed certificate.`
      });
    }

    const { caCert, caCertChain } = await getCaCertChain({
      caCertId: ca.internalCa.activeCaCertId,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      projectDAL,
      kmsService
    });

    const subCaDepth = await certificateAuthorityDAL.findMaxSubCaDepth(ca.id);

    const { crossSignedCertObj, crossSignedCertChainPem, maxPathLength } = await validateCrossSignedCertificate({
      caCertificate: caCert,
      caCertificateChain: caCertChain,
      subCaDepth,
      certificate,
      certificateChain
    });

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });
    const kmsEncryptor = await kmsService.encryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });

    const { cipherTextBlob: encryptedCertificate } = await kmsEncryptor({
      plainText: Buffer.from(new Uint8Array(crossSignedCertObj.rawData))
    });
    const { cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
      plainText: Buffer.from(crossSignedCertChainPem)
    });

    const { replacedCrossSignedCert, crossSignedCert } = await certificateAuthorityCrossSignedCertDAL.transaction(
      async (tx) => {
        const existingCrossSignedCert = await certificateAuthorityCrossSignedCertDAL.findByCaIdForUpdate(ca.id, tx);

        if (maxPathLength !== null && (await certificateAuthorityDAL.findMaxSubCaDepth(ca.id, tx)) > maxPathLength) {
          throw new BadRequestError({
            message:
              "This certificate allows fewer CA levels below it than the CAs under this CA need. Have the old CA keep the path length from the CSR."
          });
        }

        const [upsertedCrossSignedCert] = await certificateAuthorityCrossSignedCertDAL.upsert(
          [
            {
              caId: ca.id,
              encryptedCertificate,
              encryptedCertificateChain,
              issuer: crossSignedCertObj.issuer,
              serialNumber: crossSignedCertObj.serialNumber,
              publicKeyFingerprint: getPublicKeyFingerprint(crossSignedCertObj),
              notBefore: crossSignedCertObj.notBefore,
              notAfter: crossSignedCertObj.notAfter,
              maxPathLength
            }
          ],
          "caId",
          tx
        );

        return {
          replacedCrossSignedCert: existingCrossSignedCert,
          crossSignedCert: upsertedCrossSignedCert
        };
      }
    );

    return {
      ca: expandInternalCa(ca),
      replacedSerialNumber: replacedCrossSignedCert?.serialNumber,
      crossSignedCertificate: {
        ...$toCrossSignedCertMetadata(crossSignedCert),
        certificate: crossSignedCertObj.toString("pem"),
        certificateChain: crossSignedCertChainPem
      }
    };
  };

  const getCaCrossSignedCert = async ({
    caId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetCaCrossSignedCertDTO) => {
    const ca = await $getInternalCaInActorOrg(caId, actorOrgId);

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateAuthorityActions.Read,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })
    );

    const crossSignedCert = await certificateAuthorityCrossSignedCertDAL.findOne({ caId: ca.id });

    return {
      ca: expandInternalCa(ca),
      crossSignedCertificate: crossSignedCert ? await $decryptCaCrossSignedCert(ca.projectId, crossSignedCert) : null
    };
  };

  const deleteCaCrossSignedCert = async ({
    caId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDeleteCaCrossSignedCertDTO) => {
    const ca = await $getInternalCaInActorOrg(caId, actorOrgId);

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    $assertCanManageCrossSignedCert(permission, ca.name);

    const [deletedCrossSignedCert] = await certificateAuthorityCrossSignedCertDAL.transaction((tx) =>
      certificateAuthorityCrossSignedCertDAL.delete({ caId: ca.id }, tx)
    );
    if (!deletedCrossSignedCert) {
      throw new NotFoundError({ message: `CA '${ca.name}' has no cross-signed certificate` });
    }

    return {
      ca: expandInternalCa(ca),
      crossSignedCertificate: $toCrossSignedCertMetadata(deletedCrossSignedCert)
    };
  };

  return {
    importCaCrossSignedCert,
    getCaCrossSignedCert,
    deleteCaCrossSignedCert
  };
};
