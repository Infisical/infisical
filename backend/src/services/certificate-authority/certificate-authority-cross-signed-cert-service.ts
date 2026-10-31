import { ForbiddenError, subject } from "@casl/ability";
import * as x509 from "@peculiar/x509";

import { ActionProjectType, TCertificateAuthorityCrossSignedCerts } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateAuthorityCertDALFactory } from "./certificate-authority-cert-dal";
import { TCertificateAuthorityCrossSignedCertDALFactory } from "./certificate-authority-cross-signed-cert-dal";
import {
  TDeleteCaCrossSignedCertDTO,
  TGetCaCrossSignedCertDTO,
  TImportCaCrossSignedCertDTO
} from "./certificate-authority-cross-signed-cert-types";
import { TCertificateAuthorityDALFactory } from "./certificate-authority-dal";
import { CaStatus } from "./certificate-authority-enums";
import {
  expandInternalCa,
  getCaCertChain,
  getPublicKeyFingerprint,
  validateCrossSignedCertificate
} from "./certificate-authority-fns";

type TCertificateAuthorityCrossSignedCertServiceFactoryDep = {
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa" | "findById">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findById">;
  certificateAuthorityCrossSignedCertDAL: Pick<
    TCertificateAuthorityCrossSignedCertDALFactory,
    "findOne" | "findByCaIdForUpdate" | "upsert" | "delete" | "transaction"
  >;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
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
  permissionService
}: TCertificateAuthorityCrossSignedCertServiceFactoryDep) => {
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
    const decryptedCertificateChain = crossSignedCert.encryptedCertificateChain
      ? await kmsDecryptor({ cipherTextBlob: crossSignedCert.encryptedCertificateChain })
      : null;

    return {
      caId: crossSignedCert.caId,
      certificate: new x509.X509Certificate(decryptedCertificate).toString("pem"),
      certificateChain: decryptedCertificateChain ? decryptedCertificateChain.toString("utf-8") : null,
      issuer: crossSignedCert.issuer,
      serialNumber: crossSignedCert.serialNumber,
      notBefore: crossSignedCert.notBefore,
      notAfter: crossSignedCert.notAfter
    };
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
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca.internalCa) throw new NotFoundError({ message: `CA with ID '${caId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateAuthorityActions.IssueCACertificate,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })
    );

    if (ca.status !== CaStatus.ACTIVE || !ca.internalCa.activeCaCertId) {
      throw new BadRequestError({
        message: `CA '${ca.name}' is not active. Install its certificate and enable it before importing a cross-signed certificate.`
      });
    }

    const { caCert } = await getCaCertChain({
      caCertId: ca.internalCa.activeCaCertId,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      projectDAL,
      kmsService
    });

    const { crossSignedCertObj, crossSignedCertChainPem } = await validateCrossSignedCertificate({
      caCertificate: caCert,
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
    const encryptedCertificateChain = crossSignedCertChainPem
      ? (await kmsEncryptor({ plainText: Buffer.from(crossSignedCertChainPem) })).cipherTextBlob
      : null;

    const { replacedCrossSignedCert, crossSignedCert } = await certificateAuthorityCrossSignedCertDAL.transaction(
      async (tx) => {
        const existingCrossSignedCert = await certificateAuthorityCrossSignedCertDAL.findByCaIdForUpdate(ca.id, tx);

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
              notAfter: crossSignedCertObj.notAfter
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
      crossSignedCertificate: await $decryptCaCrossSignedCert(ca.projectId, crossSignedCert)
    };
  };

  const getCaCrossSignedCert = async ({
    caId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetCaCrossSignedCertDTO) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca.internalCa) throw new NotFoundError({ message: `CA with ID '${caId}' not found` });

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
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca.internalCa) throw new NotFoundError({ message: `CA with ID '${caId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateAuthorityActions.IssueCACertificate,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })
    );

    const [deletedCrossSignedCert] = await certificateAuthorityCrossSignedCertDAL.transaction((tx) =>
      certificateAuthorityCrossSignedCertDAL.delete({ caId: ca.id }, tx)
    );
    if (!deletedCrossSignedCert) {
      throw new NotFoundError({ message: `CA '${ca.name}' has no cross-signed certificate` });
    }

    const crossSignedCertificate = await $decryptCaCrossSignedCert(ca.projectId, deletedCrossSignedCert);

    return {
      ca: expandInternalCa(ca),
      crossSignedCertificate
    };
  };

  return {
    importCaCrossSignedCert,
    getCaCrossSignedCert,
    deleteCaCrossSignedCert
  };
};
