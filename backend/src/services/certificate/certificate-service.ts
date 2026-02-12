/* eslint-disable no-await-in-loop */
import { ForbiddenError, subject } from "@casl/ability";
import * as x509 from "@peculiar/x509";

import { ActionProjectType } from "@app/db/schemas";
import { TCertificateAuthorityCrlDALFactory } from "@app/ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { CaCapability, CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import { caSupportsCapability } from "@app/services/certificate-authority/certificate-authority-maps";
import { TCertificateAuthoritySecretDALFactory } from "@app/services/certificate-authority/certificate-authority-secret-dal";
import { TCertificateSyncDALFactory } from "@app/services/certificate-sync/certificate-sync-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TPkiCollectionDALFactory } from "@app/services/pki-collection/pki-collection-dal";
import { TPkiCollectionItemDALFactory } from "@app/services/pki-collection/pki-collection-item-dal";
import { TPkiSyncDALFactory } from "@app/services/pki-sync/pki-sync-dal";
import { TPkiSyncQueueFactory } from "@app/services/pki-sync/pki-sync-queue";
import { triggerAutoSyncForCertificate } from "@app/services/pki-sync/pki-sync-utils";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { expandInternalCa, getCaCertChain, rebuildCaCrl } from "../certificate-authority/certificate-authority-fns";
import {
  extractCertificateFields,
  generatePkcs12FromCertificate,
  getCertificateCredentials,
  parseCertificateBody,
  revocationReasonToCrlCode,
  splitPemChain
} from "./certificate-fns";
import { TCertificateSecretDALFactory } from "./certificate-secret-dal";
import {
  CertExtendedKeyUsage,
  CertExtendedKeyUsageOIDToName,
  CertKeyUsage,
  CertStatus,
  TCertificateBasicConstraints,
  TCertificateFingerprints,
  TCertificateSubject,
  TDeleteCertDTO,
  TGetCertBodyDTO,
  TGetCertBundleDTO,
  TGetCertDTO,
  TGetCertPkcs12DTO,
  TGetCertPrivateKeyDTO,
  TImportCertDTO,
  TRevokeCertDTO
} from "./certificate-types";

type TCertificateServiceFactoryDep = {
  certificateDAL: Pick<
    TCertificateDALFactory,
    "findOne" | "deleteById" | "update" | "find" | "transaction" | "create" | "findById" | "findWithFullDetails"
  >;
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
  certificateSyncDAL: Pick<TCertificateSyncDALFactory, "findPkiSyncIdsByCertificateId">;
  pkiSyncDAL: Pick<TPkiSyncDALFactory, "find">;
  pkiSyncQueue: Pick<TPkiSyncQueueFactory, "queuePkiSyncSyncCertificatesById">;
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
  permissionService,
  certificateSyncDAL,
  pkiSyncDAL,
  pkiSyncQueue
}: TCertificateServiceFactoryDep) => {
  /**
   * Return details for certificate with serial number [serialNumber]
   */
  const getCert = async ({ id, serialNumber, actorId, actorAuthMethod, actor, actorOrgId }: TGetCertDTO) => {
    // Validation: require either id or serialNumber
    if (!id && !serialNumber) {
      throw new BadRequestError({ message: "Either id or serialNumber must be provided" });
    }

    // Unified lookup - consistent response for both id and serialNumber
    const certWithDetails = await certificateDAL.findWithFullDetails(id ? { id } : { serialNumber: serialNumber! });

    if (!certWithDetails) {
      throw new NotFoundError({ message: "Certificate not found" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: certWithDetails.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Read,
      subject(ProjectPermissionSub.Certificates, {
        commonName: certWithDetails.commonName,
        altNames: certWithDetails.altNames ?? undefined,
        serialNumber: certWithDetails.serialNumber
      })
    );

    // Extract additional details from the joined result while creating clean cert object
    const { caName, profileName, ...cert } = certWithDetails;

    // Extract subject, fingerprints, and basicConstraints
    let certSubject: TCertificateSubject | undefined;
    let fingerprints: TCertificateFingerprints | undefined;
    let basicConstraints: TCertificateBasicConstraints | undefined;

    // NEW: Try to read from database columns first (avoids KMS decryption)
    // Check if any parsed field exists (indicates new certificate with stored data)
    const hasParsedData = cert.fingerprintSha256 || cert.isCA !== null;

    if (hasParsedData) {
      // Build subject from individual columns
      certSubject = {
        commonName: cert.commonName,
        organization: cert.subjectOrganization || undefined,
        organizationalUnit: cert.subjectOrganizationalUnit || undefined,
        country: cert.subjectCountry || undefined,
        state: cert.subjectState || undefined,
        locality: cert.subjectLocality || undefined
      };

      // Build fingerprints from columns
      if (cert.fingerprintSha256) {
        fingerprints = {
          sha256: cert.fingerprintSha256,
          sha1: cert.fingerprintSha1 || undefined
        };
      }

      // Build basic constraints
      if (cert.isCA !== null && cert.isCA !== undefined) {
        basicConstraints = {
          isCA: cert.isCA,
          pathLength: cert.pathLength !== null ? cert.pathLength : undefined
        };
      }
    }

    // BACKWARD COMPATIBILITY: Fallback to on-demand parsing for old certificates
    if (!hasParsedData) {
      const certBody = await certificateBodyDAL.findOne({ certId: cert.id });
      if (certBody?.encryptedCertificate) {
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

        const parsed = parseCertificateBody(decryptedCert);
        certSubject = parsed.subject;
        fingerprints = parsed.fingerprints;
        basicConstraints = parsed.basicConstraints;
      }
    }

    return {
      cert: {
        ...cert,
        subject: certSubject,
        fingerprints,
        basicConstraints,
        caName,
        profileName
      }
    };
  };

  /**
   * Get certificate private key.
   */
  const getCertPrivateKey = async ({
    id,
    serialNumber,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TGetCertPrivateKeyDTO) => {
    const cert = id ? await certificateDAL.findById(id) : await certificateDAL.findOne({ serialNumber });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: cert.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.ReadPrivateKey,
      subject(ProjectPermissionSub.Certificates, {
        commonName: cert.commonName,
        altNames: cert.altNames ?? undefined,
        serialNumber: cert.serialNumber
      })
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
  const deleteCert = async ({ id, serialNumber, actorId, actorAuthMethod, actor, actorOrgId }: TDeleteCertDTO) => {
    const cert = id ? await certificateDAL.findById(id) : await certificateDAL.findOne({ serialNumber });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: cert.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Delete,
      subject(ProjectPermissionSub.Certificates, {
        commonName: cert.commonName,
        altNames: cert.altNames ?? undefined,
        serialNumber: cert.serialNumber
      })
    );

    const deletedCert = await certificateDAL.deleteById(cert.id);

    // Trigger auto sync for PKI syncs connected to this certificate
    await triggerAutoSyncForCertificate(cert.id, {
      certificateSyncDAL,
      pkiSyncDAL,
      pkiSyncQueue
    });

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
    id,
    serialNumber,
    revocationReason,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TRevokeCertDTO) => {
    const cert = id ? await certificateDAL.findById(id) : await certificateDAL.findOne({ serialNumber });

    if (!cert.caId) {
      throw new BadRequestError({
        message: "Cannot revoke imported certificates"
      });
    }

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(cert.caId);

    // Check if the CA type supports revocation
    const caType = (ca.externalCa?.type as CaType) ?? CaType.INTERNAL;
    if (!caSupportsCapability(caType, CaCapability.REVOKE_CERTIFICATES)) {
      throw new BadRequestError({
        message: "Certificate revocation is not supported by this certificate authority type"
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Delete,
      subject(ProjectPermissionSub.Certificates, {
        commonName: cert.commonName,
        altNames: cert.altNames ?? undefined,
        serialNumber: cert.serialNumber,
        friendlyName: cert.friendlyName,
        status: cert.status
      })
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

    // Trigger auto sync for PKI syncs connected to this certificate
    await triggerAutoSyncForCertificate(cert.id, {
      certificateSyncDAL,
      pkiSyncDAL,
      pkiSyncQueue
    });

    // Note: External CA revocation handling would go here for supported CA types
    // Currently, only internal CAs and ACME CAs support revocation

    // rebuild CRL (TODO: move to interval-based cron job)
    // Only rebuild CRL for internal CAs - external CAs manage their own CRLs
    if (!ca.externalCa?.id) {
      await rebuildCaCrl({
        caId: ca.id,
        certificateAuthorityDAL,
        certificateAuthorityCrlDAL,
        certificateAuthoritySecretDAL,
        projectDAL,
        certificateDAL,
        kmsService
      });
    }

    // Return appropriate CA format based on CA type
    const caResult = ca.externalCa?.id
      ? {
          id: ca.id,
          name: ca.name,
          projectId: ca.projectId,
          status: ca.status,
          enableDirectIssuance: ca.enableDirectIssuance,
          type: ca.externalCa.type,
          externalCa: ca.externalCa
        }
      : expandInternalCa(ca);

    return { revokedAt, cert, ca: caResult };
  };

  /**
   * Return certificate body and certificate chain for certificate with
   * serial number [serialNumber]
   */
  const getCertBody = async ({ id, serialNumber, actorId, actorAuthMethod, actor, actorOrgId }: TGetCertBodyDTO) => {
    const cert = id ? await certificateDAL.findById(id) : await certificateDAL.findOne({ serialNumber });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: cert.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Read,
      subject(ProjectPermissionSub.Certificates, {
        commonName: cert.commonName,
        altNames: cert.altNames ?? undefined,
        serialNumber: cert.serialNumber
      })
    );

    const certBody = await certificateBodyDAL.findOne({ certId: cert.id });

    if (!certBody) {
      throw new NotFoundError({ message: "Certificate body not found" });
    }

    if (!certBody.encryptedCertificate) {
      throw new BadRequestError({ message: "Certificate data not available" });
    }

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
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Import,
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
      privateKey = crypto.nativeCrypto.createPrivateKey(privateKeyPem);
    } catch (err) {
      throw new BadRequestError({ message: "Invalid private key format" });
    }

    try {
      const message = Buffer.from(Buffer.alloc(32));
      const publicKey = crypto.nativeCrypto.createPublicKey(certificatePem);
      const signature = crypto.nativeCrypto.sign(null, message, privateKey);
      const isValid = crypto.nativeCrypto.verify(null, message, publicKey, signature);

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
        // Extract certificate fields for storage
        const parsedFields = extractCertificateFields(Buffer.from(certificatePem));

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
            extendedKeyUsages,
            ...parsedFields
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
  const getCertBundle = async ({
    id,
    serialNumber,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TGetCertBundleDTO) => {
    const cert = id ? await certificateDAL.findById(id) : await certificateDAL.findOne({ serialNumber });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: cert.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Read,
      subject(ProjectPermissionSub.Certificates, {
        commonName: cert.commonName,
        altNames: cert.altNames ?? undefined,
        serialNumber: cert.serialNumber,
        friendlyName: cert.friendlyName,
        status: cert.status
      })
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.ReadPrivateKey,
      subject(ProjectPermissionSub.Certificates, {
        commonName: cert.commonName,
        altNames: cert.altNames ?? undefined,
        serialNumber: cert.serialNumber,
        friendlyName: cert.friendlyName,
        status: cert.status
      })
    );

    const certBody = await certificateBodyDAL.findOne({ certId: cert.id });

    if (!certBody) {
      throw new NotFoundError({ message: "Certificate body not found" });
    }

    if (!certBody.encryptedCertificate) {
      throw new BadRequestError({ message: "Certificate data not available" });
    }

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
      serialNumber: cert.serialNumber,
      cert
    };
  };

  const getCertPkcs12 = async ({
    id,
    serialNumber,
    password,
    alias,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TGetCertPkcs12DTO) => {
    if (!password || password.trim() === "") {
      throw new BadRequestError({ message: "Password is required for PKCS12 keystore generation" });
    }

    if (password.length < 6) {
      throw new BadRequestError({
        message: "Password must be at least 6 characters long for PKCS12 keystore security"
      });
    }

    if (!alias || alias.trim() === "") {
      throw new BadRequestError({ message: "Alias is required for PKCS12 keystore generation" });
    }
    const cert = id ? await certificateDAL.findById(id) : await certificateDAL.findOne({ serialNumber });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: cert.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.ReadPrivateKey,
      subject(ProjectPermissionSub.Certificates, {
        commonName: cert.commonName,
        altNames: cert.altNames ?? undefined,
        serialNumber: cert.serialNumber,
        friendlyName: cert.friendlyName,
        status: cert.status
      })
    );

    // Get certificate bundle (certificate, chain, private key)
    const { certificate, certificateChain, privateKey } = await getCertBundle({
      id: cert.id,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    if (!privateKey) {
      throw new BadRequestError({ message: "Certificate private key is required for PKCS12 export" });
    }

    const pkcs12Data = await generatePkcs12FromCertificate({
      certificate,
      certificateChain: certificateChain || "",
      privateKey,
      password,
      alias
    });

    return {
      pkcs12Data,
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
    getCertBundle,
    getCertPkcs12
  };
};
