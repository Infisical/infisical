import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import { createPrivateKey, createPublicKey, sign, verify } from "crypto";

import { TCertificateAuthorityCrlDALFactory } from "@app/ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
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

import { expandInternalCa, getCaCertChain, rebuildCaCrl } from "../certificate-authority/certificate-authority-fns";
import { getCertificateCredentials, revocationReasonToCrlCode, splitPemChain } from "./certificate-fns";
import { TCertificateSecretDALFactory } from "./certificate-secret-dal";
import {
  CertExtendedKeyUsage,
  CertExtendedKeyUsageOIDToName,
  CertKeyUsage,
  CertStatus,
  TDeleteCertDTO,
  TGetCertBodyDTO,
  TGetCertBundleDTO,
  TGetCertDTO,
  TGetCertPrivateKeyDTO,
  TImportCertDTO,
  TRevokeCertDTO
} from "./certificate-types";

type TCertificateServiceFactoryDep = {
  certificateDAL: Pick<TCertificateDALFactory, "findOne" | "deleteById" | "update" | "find" | "transaction" | "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "findOne" | "create">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne" | "create">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById" | "findByIdWithAssociatedCa">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findById">;
  certificateAuthorityCrlDAL: Pick<TCertificateAuthorityCrlDALFactory, "update">;
  certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "findOne">;
  pkiCollectionDAL: Pick<TPkiCollectionDALFactory, "findById">;
  pkiCollectionItemDAL: Pick<TPkiCollectionItemDALFactory, "create">;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug" | "findOne" | "updateById" | "findById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TCertificateServiceFactory = ReturnType<typeof certificateServiceFactory>;

export const certificateServiceFactory = ({
  certificateDAL,
  certificateSecretDAL,
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
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Read,
      ProjectPermissionSub.Certificates
    );

    return {
      cert
    };
  };

  /**
   * Get certificate private key.
   */
  const getCertPrivateKey = async ({
    serialNumber,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TGetCertPrivateKeyDTO) => {
    const cert = await certificateDAL.findOne({ serialNumber });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: cert.projectId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.ReadPrivateKey,
      ProjectPermissionSub.Certificates
    );

    const { certPrivateKey } = await getCertificateCredentials({
      certId: cert.id,
      projectId: cert.projectId,
      certificateSecretDAL,
      projectDAL,
      kmsService
    });

    return {
      cert,
      certPrivateKey
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
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Delete,
      ProjectPermissionSub.Certificates
    );

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
      throw new BadRequestError({
        message: "Cannot revoke imported certificates"
      });
    }

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(cert.caId);

    if (ca.externalCa?.id) {
      throw new BadRequestError({
        message: "Cannot revoke external certificates"
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Delete,
      ProjectPermissionSub.Certificates
    );

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

    return { revokedAt, cert, ca: expandInternalCa(ca) };
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
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Read,
      ProjectPermissionSub.Certificates
    );

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

    // On newer certs the certBody.encryptedCertificateChain column will always exist.
    // Older certs will have a caCertId which will be used as a fallback mechanism for structuring the chain.
    if (certBody.encryptedCertificateChain) {
      const decryptedCertChain = await kmsDecryptor({
        cipherTextBlob: certBody.encryptedCertificateChain
      });
      certificateChain = decryptedCertChain.toString();
    } else if (cert.caCertId) {
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
    const projectId = project.id;

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Create,
      ProjectPermissionSub.Certificates
    );

    // Check PKI collection
    if (collectionId) {
      const pkiCollection = await pkiCollectionDAL.findById(collectionId);
      if (!pkiCollection) throw new NotFoundError({ message: "PKI collection not found" });
      if (pkiCollection.projectId !== projectId) throw new BadRequestError({ message: "Invalid PKI collection" });
    }

    const leafCert = new x509.X509Certificate(certificatePem);

    // Verify the certificate chain
    const chainCerts = splitPemChain(chainPem).map((pem) => new x509.X509Certificate(pem));

    // Remove leaf cert from the chain if it's present
    if (chainCerts[0].equal(leafCert)) {
      chainCerts.splice(0, 1);
    }

    if (chainCerts.length === 0) {
      throw new BadRequestError({
        message: "Certificate chain must contain at least one issuer certificate"
      });
    }

    // Verify leaf certificate is signed by the first certificate in the chain
    const isLeafVerified = await leafCert.verify({ publicKey: chainCerts[0].publicKey }).catch(() => false);
    if (!isLeafVerified) {
      throw new BadRequestError({ message: "Leaf certificate verification against chain failed" });
    }

    // Verify the entire chain of trust
    const verificationPromises = chainCerts.slice(0, -1).map(async (currentCert, index) => {
      const issuerCert = chainCerts[index + 1];
      return currentCert.verify({ publicKey: issuerCert.publicKey }).catch(() => false);
    });

    const verificationResults = await Promise.all(verificationPromises);

    if (verificationResults.some((result) => !result)) {
      throw new BadRequestError({
        message: "Certificate chain verification failed: broken trust chain"
      });
    }

    // Verify private key matches the certificate
    let privateKey;
    try {
      privateKey = createPrivateKey(privateKeyPem);
    } catch (err) {
      throw new BadRequestError({ message: "Invalid private key format" });
    }

    try {
      const message = Buffer.from(Buffer.alloc(32));
      const publicKey = createPublicKey(certificatePem);
      const signature = sign(null, message, privateKey);
      const isValid = verify(null, message, publicKey, signature);

      if (!isValid) {
        throw new BadRequestError({ message: "Private key does not match certificate" });
      }
    } catch (err) {
      if (err instanceof BadRequestError) {
        throw err;
      }
      throw new BadRequestError({ message: "Error verifying private key against certificate" });
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

    const { cipherTextBlob: encryptedPrivateKey } = await kmsEncryptor({
      plainText: Buffer.from(privateKeyPem)
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

    const { cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
      plainText: Buffer.from(chainPem)
    });

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
            encryptedCertificate,
            encryptedCertificateChain
          },
          tx
        );

        await certificateSecretDAL.create(
          {
            certId: txCert.id,
            encryptedPrivateKey
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
      } catch (error) {
        // @ts-expect-error We're expecting a database error
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (error?.error?.code === "23505") {
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

  /**
   * Return certificate body and certificate chain for certificate with
   * serial number [serialNumber]
   */
  const getCertBundle = async ({ serialNumber, actorId, actorAuthMethod, actor, actorOrgId }: TGetCertBundleDTO) => {
    const cert = await certificateDAL.findOne({ serialNumber });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: cert.projectId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Read,
      ProjectPermissionSub.Certificates
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.ReadPrivateKey,
      ProjectPermissionSub.Certificates
    );

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
    const certificate = certObj.toString("pem");

    let certificateChain = null;

    // On newer certs the certBody.encryptedCertificateChain column will always exist.
    // Older certs will have a caCertId which will be used as a fallback mechanism for structuring the chain.
    if (certBody.encryptedCertificateChain) {
      const decryptedCertChain = await kmsDecryptor({
        cipherTextBlob: certBody.encryptedCertificateChain
      });
      certificateChain = decryptedCertChain.toString();
    } else if (cert.caCertId) {
      const { caCert, caCertChain } = await getCaCertChain({
        caCertId: cert.caCertId,
        certificateAuthorityDAL,
        certificateAuthorityCertDAL,
        projectDAL,
        kmsService
      });

      certificateChain = `${caCert}\n${caCertChain}`.trim();
    }

    let privateKey: string | null = null;
    try {
      const { certPrivateKey } = await getCertificateCredentials({
        certId: cert.id,
        projectId: cert.projectId,
        certificateSecretDAL,
        projectDAL,
        kmsService
      });
      privateKey = certPrivateKey;
    } catch (e) {
      // Skip NotFound errors but throw all others
      if (!(e instanceof NotFoundError)) {
        throw e;
      }
    }

    return {
      certificate,
      certificateChain,
      privateKey,
      serialNumber,
      cert
    };
  };

  return {
    getCert,
    getCertPrivateKey,
    deleteCert,
    revokeCert,
    getCertBody,
    importCert,
    getCertBundle
  };
};
