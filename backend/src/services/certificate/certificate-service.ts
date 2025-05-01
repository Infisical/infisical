import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import { createPrivateKey, createPublicKey, sign, verify } from "crypto";

import { ActionProjectType, ProjectType } from "@app/db/schemas";
import { TCertificateAuthorityCrlDALFactory } from "@app/ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { TCertificateAuthoritySecretDALFactory } from "@app/services/certificate-authority/certificate-authority-secret-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TPkiCollectionDALFactory } from "@app/services/pki-collection/pki-collection-dal";
import { TPkiCollectionItemDALFactory } from "@app/services/pki-collection/pki-collection-item-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { getCaCertChain, rebuildCaCrl } from "../certificate-authority/certificate-authority-fns";
import { revocationReasonToCrlCode, splitPemChain } from "./certificate-fns";
import {
  CertExtendedKeyUsage,
  CertExtendedKeyUsageOIDToName,
  CertKeyUsage,
  CertStatus,
  TDeleteCertDTO,
  TGetCertBodyDTO,
  TGetCertDTO,
  TImportCertDTO,
  TRevokeCertDTO
} from "./certificate-types";

type TCertificateServiceFactoryDep = {
  certificateDAL: Pick<TCertificateDALFactory, "findOne" | "deleteById" | "update" | "find" | "transaction" | "create">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne" | "create">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findById">;
  certificateAuthorityCrlDAL: Pick<TCertificateAuthorityCrlDALFactory, "update">;
  certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "findOne">;
  pkiCollectionDAL: Pick<TPkiCollectionDALFactory, "findById">;
  pkiCollectionItemDAL: Pick<TPkiCollectionItemDALFactory, "create">;
  projectDAL: Pick<
    TProjectDALFactory,
    "findProjectBySlug" | "findOne" | "updateById" | "findById" | "transaction" | "getProjectFromSplitId"
  >;
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TCertificateServiceFactory = ReturnType<typeof certificateServiceFactory>;

export const certificateServiceFactory = ({
  certificateDAL,
  certificateBodyDAL,
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  certificateAuthorityCrlDAL,
  certificateAuthoritySecretDAL,
  pkiCollectionDAL,
  pkiCollectionItemDAL,
  projectDAL,
  kmsService,
  permissionService
}: TCertificateServiceFactoryDep) => {
  /**
   * Return details for certificate with serial number [serialNumber]
   */
  const getCert = async ({ serialNumber, actorId, actorAuthMethod, actor, actorOrgId }: TGetCertDTO) => {
    const cert = await certificateDAL.findOne({ serialNumber });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: cert.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Certificates);

    return {
      cert
    };
  };

  /**
   * Delete certificate with serial number [serialNumber]
   */
  const deleteCert = async ({ serialNumber, actorId, actorAuthMethod, actor, actorOrgId }: TDeleteCertDTO) => {
    const cert = await certificateDAL.findOne({ serialNumber });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: cert.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Certificates);

    const deletedCert = await certificateDAL.deleteById(cert.id);

    return {
      deletedCert
    };
  };

  /**
   * Revoke certificate with serial number [serialNumber].
   * Note: Revoking a certificate adds it to the certificate revocation list (CRL)
   * of its issuing CA
   */
  const revokeCert = async ({
    serialNumber,
    revocationReason,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TRevokeCertDTO) => {
    const cert = await certificateDAL.findOne({ serialNumber });

    if (!cert.caId) {
      throw new Error("Cannot revoke external certificates");
    }

    const ca = await certificateAuthorityDAL.findById(cert.caId);

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Certificates);

    if (cert.status === CertStatus.REVOKED) throw new Error("Certificate already revoked");

    const revokedAt = new Date();
    await certificateDAL.update(
      {
        id: cert.id
      },
      {
        status: CertStatus.REVOKED,
        revokedAt,
        revocationReason: revocationReasonToCrlCode(revocationReason)
      }
    );

    // rebuild CRL (TODO: move to interval-based cron job)
    await rebuildCaCrl({
      caId: ca.id,
      certificateAuthorityDAL,
      certificateAuthorityCrlDAL,
      certificateAuthoritySecretDAL,
      projectDAL,
      certificateDAL,
      kmsService
    });

    return { revokedAt, cert, ca };
  };

  /**
   * Return certificate body and certificate chain for certificate with
   * serial number [serialNumber]
   */
  const getCertBody = async ({ serialNumber, actorId, actorAuthMethod, actor, actorOrgId }: TGetCertBodyDTO) => {
    const cert = await certificateDAL.findOne({ serialNumber });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: cert.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Certificates);

    const certBody = await certificateBodyDAL.findOne({ certId: cert.id });

    const certificateManagerKeyId = await getProjectKmsCertificateKeyId({
      projectId: cert.projectId,
      projectDAL,
      kmsService
    });

    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: certificateManagerKeyId
    });
    const decryptedCert = await kmsDecryptor({
      cipherTextBlob: certBody.encryptedCertificate
    });

    const certObj = new x509.X509Certificate(decryptedCert);

    let certificateChain = null;

    // TODO(andrey): Update this to get certificateChain straight from the certificate body after the "store cert chain on cert body" PR gets merged
    if (cert.caCertId) {
      const { caCert, caCertChain } = await getCaCertChain({
        caCertId: cert.caCertId,
        certificateAuthorityDAL,
        certificateAuthorityCertDAL,
        projectDAL,
        kmsService
      });

      certificateChain = `${caCert}\n${caCertChain}`.trim();
    }

    return {
      certificate: certObj.toString("pem"),
      certificateChain,
      serialNumber: certObj.serialNumber,
      cert
    };
  };

  /**
   * Import certificate
   */
  const importCert = async ({
    projectSlug,
    pkiCollectionId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    friendlyName,
    certificatePem,
    chainPem,
    privateKeyPem
  }: TImportCertDTO) => {
    const collectionId = pkiCollectionId;

    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });
    let projectId = project.id;

    const certManagerProjectFromSplit = await projectDAL.getProjectFromSplitId(
      projectId,
      ProjectType.CertificateManager
    );
    if (certManagerProjectFromSplit) {
      projectId = certManagerProjectFromSplit.id;
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Certificates);

    // Check PKI collection
    if (collectionId) {
      const pkiCollection = await pkiCollectionDAL.findById(collectionId);
      if (!pkiCollection) throw new NotFoundError({ message: "PKI collection not found" });
      if (pkiCollection.projectId !== projectId) throw new BadRequestError({ message: "Invalid PKI collection" });
    }

    const leafCert = new x509.X509Certificate(certificatePem);

    // Verify the certificate chain
    const chainCerts = splitPemChain(chainPem).map((pem) => new x509.X509Certificate(pem));
    if (chainCerts.length === 0) {
      throw new BadRequestError({
        message: "Certificate chain must contain at least one issuer certificate"
      });
    }

    const chainValidationPromises = chainCerts.map((issuerCert) =>
      leafCert.verify({ publicKey: issuerCert.publicKey }).catch(() => false)
    );

    const results = await Promise.all(chainValidationPromises);

    if (!results.some((result) => result === true)) {
      throw new BadRequestError({ message: "Certificate chain verification failed" });
    }

    // Verify private key matches the certificate
    try {
      const message = Buffer.from("certificate-verification-test");

      const privateKey = createPrivateKey(privateKeyPem);
      const publicKey = createPublicKey(certificatePem);

      const signature = sign(null, message, privateKey);
      const isValid = verify(null, message, publicKey, signature);

      if (!isValid) {
        throw new BadRequestError({ message: "Private key does not match certificate" });
      }
    } catch (err) {
      throw new BadRequestError({ message: "Invalid private key format" });
    }

    // Get certificate attributes
    const commonName = Array.from(leafCert.subjectName.getField("CN")?.values() || [])[0] || "";

    let altNames: undefined | string;
    const sanExtension = leafCert.extensions.find((ext) => ext.type === "2.5.29.17");
    if (sanExtension) {
      const sanNames = new x509.GeneralNames(sanExtension.value);
      altNames = sanNames.items.map((name) => name.value).join(", ");
    }

    const { serialNumber, notBefore, notAfter } = leafCert;

    // Encrypt certificate for storage
    const certificateManagerKeyId = await getProjectKmsCertificateKeyId({
      projectId,
      projectDAL,
      kmsService
    });
    const kmsEncryptor = await kmsService.encryptWithKmsKey({
      kmsId: certificateManagerKeyId
    });

    const { cipherTextBlob: encryptedCertificate } = await kmsEncryptor({
      plainText: Buffer.from(certificatePem)
    });

    // Extract Key Usage
    const keyUsagesExt = leafCert.getExtension("2.5.29.15") as x509.KeyUsagesExtension;

    let keyUsages: CertKeyUsage[] = [];
    if (keyUsagesExt) {
      keyUsages = Object.values(CertKeyUsage).filter(
        // eslint-disable-next-line no-bitwise
        (keyUsage) => (x509.KeyUsageFlags[keyUsage] & keyUsagesExt.usages) !== 0
      );
    }

    // Extract Extended Key Usage
    const extKeyUsageExt = leafCert.getExtension("2.5.29.37") as x509.ExtendedKeyUsageExtension;
    let extendedKeyUsages: CertExtendedKeyUsage[] = [];
    if (extKeyUsageExt) {
      extendedKeyUsages = extKeyUsageExt.usages.map((ekuOid) => CertExtendedKeyUsageOIDToName[ekuOid as string]);
    }

    const cert = await certificateDAL.transaction(async (tx) => {
      try {
        const txCert = await certificateDAL.create(
          {
            status: CertStatus.ACTIVE,
            friendlyName: friendlyName || commonName,
            commonName,
            altNames,
            serialNumber,
            notBefore,
            notAfter,
            projectId,
            keyUsages,
            extendedKeyUsages
          },
          tx
        );

        await certificateBodyDAL.create(
          {
            certId: txCert.id,
            encryptedCertificate
          },
          tx
        );

        if (collectionId) {
          await pkiCollectionItemDAL.create(
            {
              pkiCollectionId: collectionId,
              certId: txCert.id
            },
            tx
          );
        }

        return txCert;
      } catch (error: unknown) {
        if (
          typeof error === "object" &&
          error !== null &&
          "error" in error &&
          error.error &&
          typeof error.error === "object" &&
          "code" in error.error &&
          error.error.code === "23505"
        ) {
          throw new BadRequestError({ message: "Certificate serial already exists in your project" });
        }
        throw error;
      }
    });

    return {
      certificate: certificatePem,
      certificateChain: chainPem,
      privateKey: privateKeyPem,
      serialNumber,
      cert
    };
  };

  return {
    getCert,
    deleteCert,
    revokeCert,
    getCertBody,
    importCert
  };
};
