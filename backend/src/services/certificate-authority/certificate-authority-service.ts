/* eslint-disable no-bitwise */
import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import crypto, { KeyObject } from "crypto";
import ms from "ms";
import { z } from "zod";

import { TCertificateAuthorities, TCertificateTemplates } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TPkiCollectionDALFactory } from "@app/services/pki-collection/pki-collection-dal";
import { TPkiCollectionItemDALFactory } from "@app/services/pki-collection/pki-collection-item-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateAuthorityCrlDALFactory } from "../../ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import {
  CertExtendedKeyUsage,
  CertExtendedKeyUsageOIDToName,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertStatus
} from "../certificate/certificate-types";
import { TCertificateTemplateDALFactory } from "../certificate-template/certificate-template-dal";
import { validateCertificateDetailsAgainstTemplate } from "../certificate-template/certificate-template-fns";
import { TCertificateAuthorityCertDALFactory } from "./certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "./certificate-authority-dal";
import {
  createDistinguishedName,
  createSerialNumber,
  getCaCertChain, // TODO: consider rename
  getCaCertChains,
  getCaCredentials,
  keyAlgorithmToAlgCfg,
  parseDistinguishedName
} from "./certificate-authority-fns";
import { TCertificateAuthorityQueueFactory } from "./certificate-authority-queue";
import { TCertificateAuthoritySecretDALFactory } from "./certificate-authority-secret-dal";
import {
  CaStatus,
  CaType,
  TCreateCaDTO,
  TDeleteCaDTO,
  TGetCaCertDTO,
  TGetCaCertificateTemplatesDTO,
  TGetCaCertsDTO,
  TGetCaCsrDTO,
  TGetCaDTO,
  TImportCertToCaDTO,
  TIssueCertFromCaDTO,
  TRenewCaCertDTO,
  TSignCertFromCaDTO,
  TSignIntermediateDTO,
  TUpdateCaDTO
} from "./certificate-authority-types";
import { hostnameRegex } from "./certificate-authority-validators";

type TCertificateAuthorityServiceFactoryDep = {
  certificateAuthorityDAL: Pick<
    TCertificateAuthorityDALFactory,
    "transaction" | "create" | "findById" | "updateById" | "deleteById" | "findOne"
  >;
  certificateAuthorityCertDAL: Pick<
    TCertificateAuthorityCertDALFactory,
    "create" | "findOne" | "transaction" | "find" | "findById"
  >;
  certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "create" | "findOne">;
  certificateAuthorityCrlDAL: Pick<TCertificateAuthorityCrlDALFactory, "create" | "findOne" | "update">;
  certificateTemplateDAL: Pick<TCertificateTemplateDALFactory, "getById" | "find">;
  certificateAuthorityQueue: TCertificateAuthorityQueueFactory; // TODO: Pick
  certificateDAL: Pick<TCertificateDALFactory, "transaction" | "create" | "find">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  pkiCollectionDAL: Pick<TPkiCollectionDALFactory, "findById">;
  pkiCollectionItemDAL: Pick<TPkiCollectionItemDALFactory, "create">;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug" | "findOne" | "updateById" | "findById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TCertificateAuthorityServiceFactory = ReturnType<typeof certificateAuthorityServiceFactory>;

export const certificateAuthorityServiceFactory = ({
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  certificateAuthoritySecretDAL,
  certificateAuthorityCrlDAL,
  certificateTemplateDAL,
  certificateDAL,
  certificateBodyDAL,
  pkiCollectionDAL,
  pkiCollectionItemDAL,
  projectDAL,
  kmsService,
  permissionService
}: TCertificateAuthorityServiceFactoryDep) => {
  /**
   * Generates new root or intermediate CA
   */
  const createCa = async ({
    projectSlug,
    type,
    friendlyName,
    commonName,
    organization,
    ou,
    country,
    province,
    locality,
    notBefore,
    notAfter,
    maxPathLength,
    keyAlgorithm,
    requireTemplateForIssuance,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TCreateCaDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) throw new BadRequestError({ message: "Project not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.CertificateAuthorities
    );

    const dn = createDistinguishedName({
      commonName,
      organization,
      ou,
      country,
      province,
      locality
    });

    const alg = keyAlgorithmToAlgCfg(keyAlgorithm);
    const keys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);

    const newCa = await certificateAuthorityDAL.transaction(async (tx) => {
      const notBeforeDate = notBefore ? new Date(notBefore) : new Date();

      // if undefined, set [notAfterDate] to 10 years from now
      const notAfterDate = notAfter
        ? new Date(notAfter)
        : new Date(new Date().setFullYear(new Date().getFullYear() + 10));

      const serialNumber = createSerialNumber();

      const ca = await certificateAuthorityDAL.create(
        {
          projectId: project.id,
          type,
          organization,
          ou,
          country,
          province,
          locality,
          friendlyName: friendlyName || dn,
          commonName,
          status: type === CaType.ROOT ? CaStatus.ACTIVE : CaStatus.PENDING_CERTIFICATE,
          dn,
          keyAlgorithm,
          ...(type === CaType.ROOT && {
            maxPathLength,
            notBefore: notBeforeDate,
            notAfter: notAfterDate,
            serialNumber
          }),
          requireTemplateForIssuance
        },
        tx
      );

      const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
        projectId: project.id,
        projectDAL,
        kmsService
      });
      const kmsEncryptor = await kmsService.encryptWithKmsKey({
        kmsId: certificateManagerKmsId
      });

      // https://nodejs.org/api/crypto.html#static-method-keyobjectfromkey
      const skObj = KeyObject.from(keys.privateKey);

      const { cipherTextBlob: encryptedPrivateKey } = await kmsEncryptor({
        plainText: skObj.export({
          type: "pkcs8",
          format: "der"
        })
      });

      const caSecret = await certificateAuthoritySecretDAL.create(
        {
          caId: ca.id,
          encryptedPrivateKey
        },
        tx
      );

      if (type === CaType.ROOT) {
        // note: create self-signed cert only applicable for root CA
        const cert = await x509.X509CertificateGenerator.createSelfSigned({
          name: dn,
          serialNumber,
          notBefore: notBeforeDate,
          notAfter: notAfterDate,
          signingAlgorithm: alg,
          keys,
          extensions: [
            new x509.BasicConstraintsExtension(true, maxPathLength === -1 ? undefined : maxPathLength, true),
            // eslint-disable-next-line no-bitwise
            new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
            await x509.SubjectKeyIdentifierExtension.create(keys.publicKey)
          ]
        });

        const { cipherTextBlob: encryptedCertificate } = await kmsEncryptor({
          plainText: Buffer.from(new Uint8Array(cert.rawData))
        });

        const { cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
          plainText: Buffer.alloc(0)
        });

        const caCert = await certificateAuthorityCertDAL.create(
          {
            caId: ca.id,
            encryptedCertificate,
            encryptedCertificateChain,
            version: 1,
            caSecretId: caSecret.id
          },
          tx
        );

        await certificateAuthorityDAL.updateById(
          ca.id,
          {
            activeCaCertId: caCert.id
          },
          tx
        );
      }

      // create empty CRL
      const crl = await x509.X509CrlGenerator.create({
        issuer: ca.dn,
        thisUpdate: new Date(),
        nextUpdate: new Date("2025/12/12"), // TODO: change
        entries: [],
        signingAlgorithm: alg,
        signingKey: keys.privateKey
      });

      const { cipherTextBlob: encryptedCrl } = await kmsEncryptor({
        plainText: Buffer.from(new Uint8Array(crl.rawData))
      });

      await certificateAuthorityCrlDAL.create(
        {
          caId: ca.id,
          encryptedCrl,
          caSecretId: caSecret.id
        },
        tx
      );

      return ca;
    });

    return newCa;
  };

  /**
   * Return CA with id [caId]
   */
  const getCaById = async ({ caId, actorId, actorAuthMethod, actor, actorOrgId }: TGetCaDTO) => {
    const ca = await certificateAuthorityDAL.findById(caId);
    if (!ca) throw new BadRequestError({ message: "CA not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      ca.projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.CertificateAuthorities
    );

    return ca;
  };

  /**
   * Update CA with id [caId].
   * Note: Used to enable/disable CA
   */
  const updateCaById = async ({
    caId,
    status,
    requireTemplateForIssuance,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateCaDTO) => {
    const ca = await certificateAuthorityDAL.findById(caId);
    if (!ca) throw new BadRequestError({ message: "CA not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      ca.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      ProjectPermissionSub.CertificateAuthorities
    );

    const updatedCa = await certificateAuthorityDAL.updateById(caId, { status, requireTemplateForIssuance });

    return updatedCa;
  };

  /**
   * Delete CA with id [caId]
   */
  const deleteCaById = async ({ caId, actorId, actorAuthMethod, actor, actorOrgId }: TDeleteCaDTO) => {
    const ca = await certificateAuthorityDAL.findById(caId);
    if (!ca) throw new BadRequestError({ message: "CA not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      ca.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.CertificateAuthorities
    );

    const deletedCa = await certificateAuthorityDAL.deleteById(caId);

    return deletedCa;
  };

  /**
   * Return certificate signing request (CSR) made with CA with id [caId]
   */
  const getCaCsr = async ({ caId, actorId, actorAuthMethod, actor, actorOrgId }: TGetCaCsrDTO) => {
    const ca = await certificateAuthorityDAL.findById(caId);
    if (!ca) throw new BadRequestError({ message: "CA not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      ca.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.CertificateAuthorities
    );

    if (ca.type === CaType.ROOT) throw new BadRequestError({ message: "Root CA cannot generate CSR" });

    const { caPrivateKey, caPublicKey } = await getCaCredentials({
      caId,
      certificateAuthorityDAL,
      certificateAuthoritySecretDAL,
      projectDAL,
      kmsService
    });

    const alg = keyAlgorithmToAlgCfg(ca.keyAlgorithm as CertKeyAlgorithm);

    const csrObj = await x509.Pkcs10CertificateRequestGenerator.create({
      name: ca.dn,
      keys: {
        privateKey: caPrivateKey,
        publicKey: caPublicKey
      },
      signingAlgorithm: alg,
      extensions: [
        // eslint-disable-next-line no-bitwise
        new x509.KeyUsagesExtension(
          x509.KeyUsageFlags.keyCertSign |
            x509.KeyUsageFlags.cRLSign |
            x509.KeyUsageFlags.digitalSignature |
            x509.KeyUsageFlags.keyEncipherment
        )
      ],
      attributes: [new x509.ChallengePasswordAttribute("password")]
    });

    return {
      csr: csrObj.toString("pem"),
      ca
    };
  };

  /**
   * Renew certificate for CA with id [caId]
   * Note 1: This CA renewal method is only applicable to CAs with internal parent CAs
   * Note 2: Currently implements CA renewal with same key-pair only
   */
  const renewCaCert = async ({ caId, notAfter, actorId, actorAuthMethod, actor, actorOrgId }: TRenewCaCertDTO) => {
    const ca = await certificateAuthorityDAL.findById(caId);
    if (!ca) throw new BadRequestError({ message: "CA not found" });

    if (!ca.activeCaCertId) throw new BadRequestError({ message: "CA does not have a certificate installed" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      ca.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.CertificateAuthorities
    );

    if (ca.status === CaStatus.DISABLED) throw new BadRequestError({ message: "CA is disabled" });

    // get latest CA certificate
    const caCert = await certificateAuthorityCertDAL.findById(ca.activeCaCertId);

    const serialNumber = createSerialNumber();

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });

    const kmsEncryptor = await kmsService.encryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });

    const { caPrivateKey, caPublicKey, caSecret } = await getCaCredentials({
      caId: ca.id,
      certificateAuthorityDAL,
      certificateAuthoritySecretDAL,
      projectDAL,
      kmsService
    });

    const alg = keyAlgorithmToAlgCfg(ca.keyAlgorithm as CertKeyAlgorithm);

    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });
    const decryptedCaCert = await kmsDecryptor({
      cipherTextBlob: caCert.encryptedCertificate
    });

    const caCertObj = new x509.X509Certificate(decryptedCaCert);

    let certificate = "";
    let certificateChain = "";

    switch (ca.type) {
      case CaType.ROOT: {
        if (new Date(notAfter) <= new Date(caCertObj.notAfter)) {
          throw new BadRequestError({
            message:
              "New Root CA certificate must have notAfter date that is greater than the current certificate notAfter date"
          });
        }

        const notBeforeDate = new Date();
        const cert = await x509.X509CertificateGenerator.createSelfSigned({
          name: ca.dn,
          serialNumber,
          notBefore: notBeforeDate,
          notAfter: new Date(notAfter),
          signingAlgorithm: alg,
          keys: {
            privateKey: caPrivateKey,
            publicKey: caPublicKey
          },
          extensions: [
            new x509.BasicConstraintsExtension(
              true,
              ca.maxPathLength === -1 || !ca.maxPathLength ? undefined : ca.maxPathLength,
              true
            ),
            // eslint-disable-next-line no-bitwise
            new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
            await x509.SubjectKeyIdentifierExtension.create(caPublicKey)
          ]
        });

        const { cipherTextBlob: encryptedCertificate } = await kmsEncryptor({
          plainText: Buffer.from(new Uint8Array(cert.rawData))
        });

        const { cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
          plainText: Buffer.alloc(0)
        });

        await certificateAuthorityDAL.transaction(async (tx) => {
          const newCaCert = await certificateAuthorityCertDAL.create(
            {
              caId: ca.id,
              encryptedCertificate,
              encryptedCertificateChain,
              version: caCert.version + 1,
              caSecretId: caSecret.id
            },
            tx
          );

          await certificateAuthorityDAL.updateById(
            ca.id,
            {
              activeCaCertId: newCaCert.id,
              notBefore: notBeforeDate,
              notAfter: new Date(notAfter)
            },
            tx
          );
        });

        certificate = cert.toString("pem");
        break;
      }
      case CaType.INTERMEDIATE: {
        if (!ca.parentCaId) {
          // TODO: look into optimal way to support renewal of intermediate CA with external parent CA
          throw new BadRequestError({
            message: "Failed to renew intermediate CA certificate with external parent CA"
          });
        }

        const parentCa = await certificateAuthorityDAL.findById(ca.parentCaId);
        const { caPrivateKey: parentCaPrivateKey } = await getCaCredentials({
          caId: parentCa.id,
          certificateAuthorityDAL,
          certificateAuthoritySecretDAL,
          projectDAL,
          kmsService
        });

        // get latest parent CA certificate
        if (!parentCa.activeCaCertId)
          throw new BadRequestError({ message: "Parent CA does not have a certificate installed" });
        const parentCaCert = await certificateAuthorityCertDAL.findById(parentCa.activeCaCertId);

        const decryptedParentCaCert = await kmsDecryptor({
          cipherTextBlob: parentCaCert.encryptedCertificate
        });

        const parentCaCertObj = new x509.X509Certificate(decryptedParentCaCert);

        if (new Date(notAfter) <= new Date(caCertObj.notAfter)) {
          throw new BadRequestError({
            message:
              "New Intermediate CA certificate must have notAfter date that is greater than the current certificate notAfter date"
          });
        }

        if (new Date(notAfter) > new Date(parentCaCertObj.notAfter)) {
          throw new BadRequestError({
            message:
              "New Intermediate CA certificate must have notAfter date that is equal to or smaller than the notAfter date of the parent CA certificate current certificate notAfter date"
          });
        }

        const csrObj = await x509.Pkcs10CertificateRequestGenerator.create({
          name: ca.dn,
          keys: {
            privateKey: caPrivateKey,
            publicKey: caPublicKey
          },
          signingAlgorithm: alg,
          extensions: [
            // eslint-disable-next-line no-bitwise
            new x509.KeyUsagesExtension(
              x509.KeyUsageFlags.keyCertSign |
                x509.KeyUsageFlags.cRLSign |
                x509.KeyUsageFlags.digitalSignature |
                x509.KeyUsageFlags.keyEncipherment
            )
          ],
          attributes: [new x509.ChallengePasswordAttribute("password")]
        });

        const notBeforeDate = new Date();
        const intermediateCert = await x509.X509CertificateGenerator.create({
          serialNumber,
          subject: csrObj.subject,
          issuer: parentCaCertObj.subject,
          notBefore: notBeforeDate,
          notAfter: new Date(notAfter),
          signingKey: parentCaPrivateKey,
          publicKey: csrObj.publicKey,
          signingAlgorithm: alg,
          extensions: [
            new x509.KeyUsagesExtension(
              x509.KeyUsageFlags.keyCertSign |
                x509.KeyUsageFlags.cRLSign |
                x509.KeyUsageFlags.digitalSignature |
                x509.KeyUsageFlags.keyEncipherment,
              true
            ),
            new x509.BasicConstraintsExtension(
              true,
              ca.maxPathLength === -1 || !ca.maxPathLength ? undefined : ca.maxPathLength,
              true
            ),
            await x509.AuthorityKeyIdentifierExtension.create(parentCaCertObj, false),
            await x509.SubjectKeyIdentifierExtension.create(csrObj.publicKey)
          ]
        });

        const { cipherTextBlob: encryptedCertificate } = await kmsEncryptor({
          plainText: Buffer.from(new Uint8Array(intermediateCert.rawData))
        });

        const { caCert: parentCaCertificate, caCertChain: parentCaCertChain } = await getCaCertChain({
          caCertId: parentCa.activeCaCertId,
          certificateAuthorityDAL,
          certificateAuthorityCertDAL,
          projectDAL,
          kmsService
        });

        certificateChain = `${parentCaCertificate}\n${parentCaCertChain}`.trim();

        const { cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
          plainText: Buffer.from(certificateChain)
        });

        await certificateAuthorityDAL.transaction(async (tx) => {
          const newCaCert = await certificateAuthorityCertDAL.create(
            {
              caId: ca.id,
              encryptedCertificate,
              encryptedCertificateChain,
              version: caCert.version + 1,
              caSecretId: caSecret.id
            },
            tx
          );

          await certificateAuthorityDAL.updateById(
            ca.id,
            {
              activeCaCertId: newCaCert.id,
              notBefore: notBeforeDate,
              notAfter: new Date(notAfter)
            },
            tx
          );
        });

        certificate = intermediateCert.toString("pem");
        break;
      }
      default: {
        throw new BadRequestError({
          message: "Unrecognized CA type"
        });
      }
    }

    return {
      certificate,
      certificateChain,
      serialNumber,
      ca
    };
  };

  const getCaCerts = async ({ caId, actorId, actorAuthMethod, actor, actorOrgId }: TGetCaCertsDTO) => {
    const ca = await certificateAuthorityDAL.findById(caId);
    if (!ca) throw new BadRequestError({ message: "CA not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      ca.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.CertificateAuthorities
    );

    const caCertChains = await getCaCertChains({
      caId,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      projectDAL,
      kmsService
    });

    return {
      ca,
      caCerts: caCertChains
    };
  };

  /**
   * Return current certificate and certificate chain for CA
   */
  const getCaCert = async ({ caId, actorId, actorAuthMethod, actor, actorOrgId }: TGetCaCertDTO) => {
    const ca = await certificateAuthorityDAL.findById(caId);
    if (!ca) throw new BadRequestError({ message: "CA not found" });
    if (!ca.activeCaCertId) throw new BadRequestError({ message: "CA does not have a certificate installed" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      ca.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.CertificateAuthorities
    );

    const { caCert, caCertChain, serialNumber } = await getCaCertChain({
      caCertId: ca.activeCaCertId,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      projectDAL,
      kmsService
    });

    return {
      certificate: caCert,
      certificateChain: caCertChain,
      serialNumber,
      ca
    };
  };

  /**
   * Return CA certificate object by ID
   */
  const getCaCertById = async ({ caId, caCertId }: { caId: string; caCertId: string }) => {
    const caCert = await certificateAuthorityCertDAL.findOne({
      caId,
      id: caCertId
    });

    if (!caCert) {
      throw new NotFoundError({ message: "CA certificate not found" });
    }

    const ca = await certificateAuthorityDAL.findById(caId);
    const keyId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });

    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: keyId
    });

    const decryptedCaCert = await kmsDecryptor({
      cipherTextBlob: caCert.encryptedCertificate
    });

    const caCertObj = new x509.X509Certificate(decryptedCaCert);

    return caCertObj;
  };

  /**
   * Issue certificate to be imported back in for intermediate CA
   */
  const signIntermediate = async ({
    caId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    csr,
    notBefore,
    notAfter,
    maxPathLength
  }: TSignIntermediateDTO) => {
    const appCfg = getConfig();
    const ca = await certificateAuthorityDAL.findById(caId);
    if (!ca) throw new BadRequestError({ message: "CA not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      ca.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.CertificateAuthorities
    );

    if (ca.status === CaStatus.DISABLED) throw new BadRequestError({ message: "CA is disabled" });
    if (!ca.activeCaCertId) throw new BadRequestError({ message: "CA does not have a certificate installed" });

    const caCert = await certificateAuthorityCertDAL.findById(ca.activeCaCertId);

    if (ca.notAfter && new Date() > new Date(ca.notAfter)) {
      throw new BadRequestError({ message: "CA is expired" });
    }

    const alg = keyAlgorithmToAlgCfg(ca.keyAlgorithm as CertKeyAlgorithm);

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });
    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });

    const decryptedCaCert = await kmsDecryptor({
      cipherTextBlob: caCert.encryptedCertificate
    });

    const caCertObj = new x509.X509Certificate(decryptedCaCert);
    const csrObj = new x509.Pkcs10CertificateRequest(csr);

    // check path length constraint
    const caPathLength = caCertObj.getExtension(x509.BasicConstraintsExtension)?.pathLength;
    if (caPathLength !== undefined) {
      if (caPathLength === 0)
        throw new BadRequestError({
          message: "Failed to issue intermediate certificate due to CA path length constraint"
        });
      if (maxPathLength >= caPathLength || (maxPathLength === -1 && caPathLength !== -1))
        throw new BadRequestError({
          message: "The requested path length constraint exceeds the CA's allowed path length"
        });
    }

    const notBeforeDate = notBefore ? new Date(notBefore) : new Date();
    const notAfterDate = new Date(notAfter);

    const caCertNotBeforeDate = new Date(caCertObj.notBefore);
    const caCertNotAfterDate = new Date(caCertObj.notAfter);

    // check not before constraint
    if (notBeforeDate < caCertNotBeforeDate) {
      throw new BadRequestError({ message: "notBefore date is before CA certificate's notBefore date" });
    }

    if (notBeforeDate > notAfterDate) throw new BadRequestError({ message: "notBefore date is after notAfter date" });

    // check not after constraint
    if (notAfterDate > caCertNotAfterDate) {
      throw new BadRequestError({ message: "notAfter date is after CA certificate's notAfter date" });
    }

    const { caPrivateKey, caSecret } = await getCaCredentials({
      caId: ca.id,
      certificateAuthorityDAL,
      certificateAuthoritySecretDAL,
      projectDAL,
      kmsService
    });

    const serialNumber = createSerialNumber();

    const caCrl = await certificateAuthorityCrlDAL.findOne({ caSecretId: caSecret.id });
    const distributionPointUrl = `${appCfg.SITE_URL}/api/v1/pki/crl/${caCrl.id}/der`;

    const caIssuerUrl = `${appCfg.SITE_URL}/api/v1/pki/ca/${ca.id}/certificates/${caCert.id}/der`;
    const intermediateCert = await x509.X509CertificateGenerator.create({
      serialNumber,
      subject: csrObj.subject,
      issuer: caCertObj.subject,
      notBefore: notBeforeDate,
      notAfter: notAfterDate,
      signingKey: caPrivateKey,
      publicKey: csrObj.publicKey,
      signingAlgorithm: alg,
      extensions: [
        new x509.KeyUsagesExtension(
          x509.KeyUsageFlags.keyCertSign |
            x509.KeyUsageFlags.cRLSign |
            x509.KeyUsageFlags.digitalSignature |
            x509.KeyUsageFlags.keyEncipherment,
          true
        ),
        new x509.BasicConstraintsExtension(true, maxPathLength === -1 ? undefined : maxPathLength, true),
        await x509.AuthorityKeyIdentifierExtension.create(caCertObj, false),
        await x509.SubjectKeyIdentifierExtension.create(csrObj.publicKey),
        new x509.CRLDistributionPointsExtension([distributionPointUrl]),
        new x509.AuthorityInfoAccessExtension({
          caIssuers: new x509.GeneralName("url", caIssuerUrl)
        })
      ]
    });

    const { caCert: issuingCaCertificate, caCertChain } = await getCaCertChain({
      caCertId: ca.activeCaCertId,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      projectDAL,
      kmsService
    });

    return {
      certificate: intermediateCert.toString("pem"),
      issuingCaCertificate,
      certificateChain: `${issuingCaCertificate}\n${caCertChain}`.trim(),
      serialNumber: intermediateCert.serialNumber,
      ca
    };
  };

  /**
   * Import certificate for CA with id [caId].
   * Note: Can be used to import an external certificate and certificate chain
   * to be into an installed or uninstalled CA.
   */
  const importCertToCa = async ({
    caId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    certificate,
    certificateChain
  }: TImportCertToCaDTO) => {
    const ca = await certificateAuthorityDAL.findById(caId);
    if (!ca) throw new BadRequestError({ message: "CA not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      ca.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.CertificateAuthorities
    );

    if (ca.parentCaId) {
      /**
       * re-evaluate in the future if we should allow users to import a new CA certificate for an intermediate
       * CA chained to an internal parent CA. Doing so would allow users to re-chain the CA to a different
       * internal CA.
       */
      throw new BadRequestError({
        message: "Cannot import certificate to intermediate CA chained to internal parent CA"
      });
    }

    const caCert = ca.activeCaCertId ? await certificateAuthorityCertDAL.findById(ca.activeCaCertId) : undefined;

    const certObj = new x509.X509Certificate(certificate);
    const maxPathLength = certObj.getExtension(x509.BasicConstraintsExtension)?.pathLength;

    // validate imported certificate and certificate chain
    const certificates = certificateChain
      .match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)
      ?.map((cert) => new x509.X509Certificate(cert));

    if (!certificates) throw new BadRequestError({ message: "Failed to parse certificate chain" });

    const chain = new x509.X509ChainBuilder({
      certificates
    });

    const chainItems = await chain.build(certObj);

    // chain.build() implicitly verifies the chain
    if (chainItems.length !== certificates.length + 1)
      throw new BadRequestError({ message: "Invalid certificate chain" });

    const parentCertObj = chainItems[1];
    const parentCertSubject = parentCertObj.subject;

    const parentCa = await certificateAuthorityDAL.findOne({
      projectId: ca.projectId,
      dn: parentCertSubject
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
      plainText: Buffer.from(new Uint8Array(certObj.rawData))
    });

    const { cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
      plainText: Buffer.from(certificateChain)
    });

    // TODO: validate that latest key-pair of CA is used to sign the certificate
    // once renewal with new key pair is supported
    const { caSecret, caPublicKey } = await getCaCredentials({
      caId: ca.id,
      certificateAuthorityDAL,
      certificateAuthoritySecretDAL,
      projectDAL,
      kmsService
    });

    const isCaAndCertPublicKeySame = Buffer.from(await crypto.subtle.exportKey("spki", caPublicKey)).equals(
      Buffer.from(certObj.publicKey.rawData)
    );

    if (!isCaAndCertPublicKeySame) {
      throw new BadRequestError({ message: "CA and certificate public key do not match" });
    }

    await certificateAuthorityCertDAL.transaction(async (tx) => {
      const newCaCert = await certificateAuthorityCertDAL.create(
        {
          caId: ca.id,
          encryptedCertificate,
          encryptedCertificateChain,
          version: caCert ? caCert.version + 1 : 1,
          caSecretId: caSecret.id
        },
        tx
      );

      await certificateAuthorityDAL.updateById(
        ca.id,
        {
          status: CaStatus.ACTIVE,
          maxPathLength: maxPathLength === undefined ? -1 : maxPathLength,
          notBefore: new Date(certObj.notBefore),
          notAfter: new Date(certObj.notAfter),
          serialNumber: certObj.serialNumber,
          parentCaId: parentCa?.id,
          activeCaCertId: newCaCert.id
        },
        tx
      );
    });

    return { ca };
  };

  /**
   * Return new leaf certificate issued by CA with id [caId] and private key.
   * Note: private key and CSR are generated within Infisical.
   */
  const issueCertFromCa = async ({
    caId,
    certificateTemplateId,
    pkiCollectionId,
    friendlyName,
    commonName,
    altNames,
    ttl,
    notBefore,
    notAfter,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    keyUsages,
    extendedKeyUsages
  }: TIssueCertFromCaDTO) => {
    let ca: TCertificateAuthorities | undefined;
    let certificateTemplate: TCertificateTemplates | undefined;
    let collectionId = pkiCollectionId;

    if (caId) {
      ca = await certificateAuthorityDAL.findById(caId);
    } else if (certificateTemplateId) {
      certificateTemplate = await certificateTemplateDAL.getById(certificateTemplateId);
      if (!certificateTemplate) {
        throw new NotFoundError({
          message: "Certificate template not found"
        });
      }

      collectionId = certificateTemplate.pkiCollectionId as string;
      ca = await certificateAuthorityDAL.findById(certificateTemplate.caId);
    }

    if (!ca) {
      throw new BadRequestError({ message: "CA not found" });
    }

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      ca.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Certificates);

    if (ca.status === CaStatus.DISABLED) throw new BadRequestError({ message: "CA is disabled" });
    if (!ca.activeCaCertId) throw new BadRequestError({ message: "CA does not have a certificate installed" });
    if (ca.requireTemplateForIssuance && !certificateTemplate) {
      throw new BadRequestError({ message: "Certificate template is required for issuance" });
    }
    const caCert = await certificateAuthorityCertDAL.findById(ca.activeCaCertId);

    if (ca.notAfter && new Date() > new Date(ca.notAfter)) {
      throw new BadRequestError({ message: "CA is expired" });
    }

    // check PKI collection
    if (collectionId) {
      const pkiCollection = await pkiCollectionDAL.findById(collectionId);
      if (!pkiCollection) throw new NotFoundError({ message: "PKI collection not found" });
      if (pkiCollection.projectId !== ca.projectId) throw new BadRequestError({ message: "Invalid PKI collection" });
    }

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });
    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });

    const decryptedCaCert = await kmsDecryptor({
      cipherTextBlob: caCert.encryptedCertificate
    });

    const caCertObj = new x509.X509Certificate(decryptedCaCert);

    const notBeforeDate = notBefore ? new Date(notBefore) : new Date();

    let notAfterDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1));
    if (notAfter) {
      notAfterDate = new Date(notAfter);
    } else if (ttl) {
      notAfterDate = new Date(new Date().getTime() + ms(ttl));
    }

    const caCertNotBeforeDate = new Date(caCertObj.notBefore);
    const caCertNotAfterDate = new Date(caCertObj.notAfter);

    // check not before constraint
    if (notBeforeDate < caCertNotBeforeDate) {
      throw new BadRequestError({ message: "notBefore date is before CA certificate's notBefore date" });
    }

    if (notBeforeDate > notAfterDate) throw new BadRequestError({ message: "notBefore date is after notAfter date" });

    // check not after constraint
    if (notAfterDate > caCertNotAfterDate) {
      throw new BadRequestError({ message: "notAfter date is after CA certificate's notAfter date" });
    }

    const alg = keyAlgorithmToAlgCfg(ca.keyAlgorithm as CertKeyAlgorithm);
    const leafKeys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);

    const csrObj = await x509.Pkcs10CertificateRequestGenerator.create({
      name: `CN=${commonName}`,
      keys: leafKeys,
      signingAlgorithm: alg,
      extensions: [
        // eslint-disable-next-line no-bitwise
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment)
      ],
      attributes: [new x509.ChallengePasswordAttribute("password")]
    });

    const { caPrivateKey, caSecret } = await getCaCredentials({
      caId: ca.id,
      certificateAuthorityDAL,
      certificateAuthoritySecretDAL,
      projectDAL,
      kmsService
    });

    const caCrl = await certificateAuthorityCrlDAL.findOne({ caSecretId: caSecret.id });
    const appCfg = getConfig();

    const distributionPointUrl = `${appCfg.SITE_URL}/api/v1/pki/crl/${caCrl.id}/der`;
    const caIssuerUrl = `${appCfg.SITE_URL}/api/v1/pki/ca/${ca.id}/certificates/${caCert.id}/der`;

    const extensions: x509.Extension[] = [
      new x509.BasicConstraintsExtension(false),
      new x509.CRLDistributionPointsExtension([distributionPointUrl]),
      await x509.AuthorityKeyIdentifierExtension.create(caCertObj, false),
      await x509.SubjectKeyIdentifierExtension.create(csrObj.publicKey),
      new x509.AuthorityInfoAccessExtension({
        caIssuers: new x509.GeneralName("url", caIssuerUrl)
      }),
      new x509.CertificatePolicyExtension(["2.5.29.32.0"]) // anyPolicy
    ];

    // handle key usages
    let selectedKeyUsages: CertKeyUsage[] = keyUsages ?? [];
    if (keyUsages === undefined && !certificateTemplate) {
      selectedKeyUsages = [CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT];
    }

    if (keyUsages === undefined && certificateTemplate) {
      selectedKeyUsages = (certificateTemplate.keyUsages ?? []) as CertKeyUsage[];
    }

    if (keyUsages?.length && certificateTemplate) {
      const validKeyUsages = certificateTemplate.keyUsages || [];
      if (keyUsages.some((keyUsage) => !validKeyUsages.includes(keyUsage))) {
        throw new BadRequestError({
          message: "Invalid key usage value based on template policy"
        });
      }
      selectedKeyUsages = keyUsages;
    }

    const keyUsagesBitValue = selectedKeyUsages.reduce((accum, keyUsage) => accum | x509.KeyUsageFlags[keyUsage], 0);
    if (keyUsagesBitValue) {
      extensions.push(new x509.KeyUsagesExtension(keyUsagesBitValue, true));
    }

    // handle extended key usages
    let selectedExtendedKeyUsages: CertExtendedKeyUsage[] = extendedKeyUsages ?? [];
    if (extendedKeyUsages === undefined && certificateTemplate) {
      selectedExtendedKeyUsages = (certificateTemplate.extendedKeyUsages ?? []) as CertExtendedKeyUsage[];
    }

    if (extendedKeyUsages?.length && certificateTemplate) {
      const validExtendedKeyUsages = certificateTemplate.extendedKeyUsages || [];
      if (extendedKeyUsages.some((eku) => !validExtendedKeyUsages.includes(eku))) {
        throw new BadRequestError({
          message: "Invalid extended key usage value based on template policy"
        });
      }
      selectedExtendedKeyUsages = extendedKeyUsages;
    }

    if (selectedExtendedKeyUsages.length) {
      extensions.push(
        new x509.ExtendedKeyUsageExtension(
          selectedExtendedKeyUsages.map((eku) => x509.ExtendedKeyUsage[eku]),
          true
        )
      );
    }

    let altNamesArray: {
      type: "email" | "dns";
      value: string;
    }[] = [];

    if (altNames) {
      altNamesArray = altNames
        .split(",")
        .map((name) => name.trim())
        .map((altName) => {
          // check if the altName is a valid email
          if (z.string().email().safeParse(altName).success) {
            return {
              type: "email",
              value: altName
            };
          }

          // check if the altName is a valid hostname
          if (hostnameRegex.test(altName)) {
            return {
              type: "dns",
              value: altName
            };
          }

          // If altName is neither a valid email nor a valid hostname, throw an error or handle it accordingly
          throw new Error(`Invalid altName: ${altName}`);
        });

      const altNamesExtension = new x509.SubjectAlternativeNameExtension(altNamesArray, false);
      extensions.push(altNamesExtension);
    }

    if (certificateTemplate) {
      validateCertificateDetailsAgainstTemplate(
        {
          commonName,
          notBeforeDate,
          notAfterDate,
          altNames: altNamesArray.map((entry) => entry.value)
        },
        certificateTemplate
      );
    }

    const serialNumber = createSerialNumber();
    const leafCert = await x509.X509CertificateGenerator.create({
      serialNumber,
      subject: csrObj.subject,
      issuer: caCertObj.subject,
      notBefore: notBeforeDate,
      notAfter: notAfterDate,
      signingKey: caPrivateKey,
      publicKey: csrObj.publicKey,
      signingAlgorithm: alg,
      extensions
    });

    const skLeafObj = KeyObject.from(leafKeys.privateKey);
    const skLeaf = skLeafObj.export({ format: "pem", type: "pkcs8" }) as string;

    const kmsEncryptor = await kmsService.encryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });
    const { cipherTextBlob: encryptedCertificate } = await kmsEncryptor({
      plainText: Buffer.from(new Uint8Array(leafCert.rawData))
    });

    await certificateDAL.transaction(async (tx) => {
      const cert = await certificateDAL.create(
        {
          caId: (ca as TCertificateAuthorities).id,
          caCertId: caCert.id,
          certificateTemplateId: certificateTemplate?.id,
          status: CertStatus.ACTIVE,
          friendlyName: friendlyName || commonName,
          commonName,
          altNames,
          serialNumber,
          notBefore: notBeforeDate,
          notAfter: notAfterDate,
          keyUsages: selectedKeyUsages,
          extendedKeyUsages: selectedExtendedKeyUsages
        },
        tx
      );

      await certificateBodyDAL.create(
        {
          certId: cert.id,
          encryptedCertificate
        },
        tx
      );

      if (collectionId) {
        await pkiCollectionItemDAL.create(
          {
            pkiCollectionId: collectionId,
            certId: cert.id
          },
          tx
        );
      }

      return cert;
    });

    const { caCert: issuingCaCertificate, caCertChain } = await getCaCertChain({
      caCertId: caCert.id,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      projectDAL,
      kmsService
    });

    return {
      certificate: leafCert.toString("pem"),
      certificateChain: `${issuingCaCertificate}\n${caCertChain}`.trim(),
      issuingCaCertificate,
      privateKey: skLeaf,
      serialNumber,
      ca
    };
  };

  /**
   * Return new leaf certificate issued by CA with id [caId].
   * Note: CSR is generated externally and submitted to Infisical.
   */
  const signCertFromCa = async (dto: TSignCertFromCaDTO) => {
    const appCfg = getConfig();
    let ca: TCertificateAuthorities | undefined;
    let certificateTemplate: TCertificateTemplates | undefined;

    const {
      caId,
      certificateTemplateId,
      csr,
      pkiCollectionId,
      friendlyName,
      commonName,
      altNames,
      ttl,
      notBefore,
      notAfter,
      keyUsages,
      extendedKeyUsages
    } = dto;

    let collectionId = pkiCollectionId;

    if (caId) {
      ca = await certificateAuthorityDAL.findById(caId);
    } else if (certificateTemplateId) {
      certificateTemplate = await certificateTemplateDAL.getById(certificateTemplateId);
      if (!certificateTemplate) {
        throw new NotFoundError({
          message: "Certificate template not found"
        });
      }

      collectionId = certificateTemplate.pkiCollectionId as string;
      ca = await certificateAuthorityDAL.findById(certificateTemplate.caId);
    }

    if (!ca) {
      throw new BadRequestError({ message: "CA not found" });
    }

    if (!dto.isInternal) {
      const { permission } = await permissionService.getProjectPermission(
        dto.actor,
        dto.actorId,
        ca.projectId,
        dto.actorAuthMethod,
        dto.actorOrgId
      );

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Create,
        ProjectPermissionSub.Certificates
      );
    }

    if (ca.status === CaStatus.DISABLED) throw new BadRequestError({ message: "CA is disabled" });
    if (!ca.activeCaCertId) throw new BadRequestError({ message: "CA does not have a certificate installed" });
    if (ca.requireTemplateForIssuance && !certificateTemplate) {
      throw new BadRequestError({ message: "Certificate template is required for issuance" });
    }

    const caCert = await certificateAuthorityCertDAL.findById(ca.activeCaCertId);

    if (ca.notAfter && new Date() > new Date(ca.notAfter)) {
      throw new BadRequestError({ message: "CA is expired" });
    }

    // check PKI collection
    if (pkiCollectionId) {
      const pkiCollection = await pkiCollectionDAL.findById(pkiCollectionId);
      if (!pkiCollection) throw new NotFoundError({ message: "PKI collection not found" });
      if (pkiCollection.projectId !== ca.projectId) throw new BadRequestError({ message: "Invalid PKI collection" });
    }

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });

    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });

    const decryptedCaCert = await kmsDecryptor({
      cipherTextBlob: caCert.encryptedCertificate
    });

    const caCertObj = new x509.X509Certificate(decryptedCaCert);

    const notBeforeDate = notBefore ? new Date(notBefore) : new Date();

    let notAfterDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1));
    if (notAfter) {
      notAfterDate = new Date(notAfter);
    } else if (ttl) {
      notAfterDate = new Date(new Date().getTime() + ms(ttl));
    } else if (certificateTemplate?.ttl) {
      notAfterDate = new Date(new Date().getTime() + ms(certificateTemplate.ttl));
    }

    const caCertNotBeforeDate = new Date(caCertObj.notBefore);
    const caCertNotAfterDate = new Date(caCertObj.notAfter);

    // check not before constraint
    if (notBeforeDate < caCertNotBeforeDate) {
      throw new BadRequestError({ message: "notBefore date is before CA certificate's notBefore date" });
    }

    if (notBeforeDate > notAfterDate) throw new BadRequestError({ message: "notBefore date is after notAfter date" });

    // check not after constraint
    if (notAfterDate > caCertNotAfterDate) {
      throw new BadRequestError({ message: "notAfter date is after CA certificate's notAfter date" });
    }

    const alg = keyAlgorithmToAlgCfg(ca.keyAlgorithm as CertKeyAlgorithm);

    const csrObj = new x509.Pkcs10CertificateRequest(csr);

    const dn = parseDistinguishedName(csrObj.subject);
    const cn = commonName || dn.commonName;

    if (!cn)
      throw new BadRequestError({
        message: "A common name (CN) is required in the CSR or as a parameter to this endpoint"
      });

    const { caPrivateKey, caSecret } = await getCaCredentials({
      caId: ca.id,
      certificateAuthorityDAL,
      certificateAuthoritySecretDAL,
      projectDAL,
      kmsService
    });

    const caCrl = await certificateAuthorityCrlDAL.findOne({ caSecretId: caSecret.id });
    const distributionPointUrl = `${appCfg.SITE_URL}/api/v1/pki/crl/${caCrl.id}/der`;

    const caIssuerUrl = `${appCfg.SITE_URL}/api/v1/pki/ca/${ca.id}/certificates/${caCert.id}/der`;
    const extensions: x509.Extension[] = [
      new x509.BasicConstraintsExtension(false),
      await x509.AuthorityKeyIdentifierExtension.create(caCertObj, false),
      await x509.SubjectKeyIdentifierExtension.create(csrObj.publicKey),
      new x509.CRLDistributionPointsExtension([distributionPointUrl]),
      new x509.AuthorityInfoAccessExtension({
        caIssuers: new x509.GeneralName("url", caIssuerUrl)
      }),
      new x509.CertificatePolicyExtension(["2.5.29.32.0"]) // anyPolicy
    ];

    // handle key usages
    const csrKeyUsageExtension = csrObj.getExtension("2.5.29.15") as x509.KeyUsagesExtension;
    let csrKeyUsages: CertKeyUsage[] = [];
    if (csrKeyUsageExtension) {
      csrKeyUsages = Object.values(CertKeyUsage).filter(
        (keyUsage) => (x509.KeyUsageFlags[keyUsage] & csrKeyUsageExtension.usages) !== 0
      );
    }

    let selectedKeyUsages: CertKeyUsage[] = keyUsages ?? [];
    if (keyUsages === undefined && !certificateTemplate) {
      if (csrKeyUsageExtension) {
        selectedKeyUsages = csrKeyUsages;
      } else {
        selectedKeyUsages = [CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT];
      }
    }

    if (keyUsages === undefined && certificateTemplate) {
      if (csrKeyUsageExtension) {
        const validKeyUsages = certificateTemplate.keyUsages || [];
        if (csrKeyUsages.some((keyUsage) => !validKeyUsages.includes(keyUsage))) {
          throw new BadRequestError({
            message: "Invalid key usage value based on template policy"
          });
        }
        selectedKeyUsages = csrKeyUsages;
      } else {
        selectedKeyUsages = (certificateTemplate.keyUsages ?? []) as CertKeyUsage[];
      }
    }

    if (keyUsages?.length && certificateTemplate) {
      const validKeyUsages = certificateTemplate.keyUsages || [];
      if (keyUsages.some((keyUsage) => !validKeyUsages.includes(keyUsage))) {
        throw new BadRequestError({
          message: "Invalid key usage value based on template policy"
        });
      }
      selectedKeyUsages = keyUsages;
    }

    const keyUsagesBitValue = selectedKeyUsages.reduce((accum, keyUsage) => accum | x509.KeyUsageFlags[keyUsage], 0);
    if (keyUsagesBitValue) {
      extensions.push(new x509.KeyUsagesExtension(keyUsagesBitValue, true));
    }

    // handle extended key usages
    const csrExtendedKeyUsageExtension = csrObj.getExtension("2.5.29.37") as x509.ExtendedKeyUsageExtension;
    let csrExtendedKeyUsages: CertExtendedKeyUsage[] = [];
    if (csrExtendedKeyUsageExtension) {
      csrExtendedKeyUsages = csrExtendedKeyUsageExtension.usages.map(
        (ekuOid) => CertExtendedKeyUsageOIDToName[ekuOid as string]
      );
    }

    let selectedExtendedKeyUsages: CertExtendedKeyUsage[] = extendedKeyUsages ?? [];
    if (extendedKeyUsages === undefined && !certificateTemplate && csrExtendedKeyUsageExtension) {
      selectedExtendedKeyUsages = csrExtendedKeyUsages;
    }

    if (extendedKeyUsages === undefined && certificateTemplate) {
      if (csrExtendedKeyUsageExtension) {
        const validExtendedKeyUsages = certificateTemplate.extendedKeyUsages || [];
        if (csrExtendedKeyUsages.some((eku) => !validExtendedKeyUsages.includes(eku))) {
          throw new BadRequestError({
            message: "Invalid extended key usage value based on template policy"
          });
        }
        selectedExtendedKeyUsages = csrExtendedKeyUsages;
      } else {
        selectedExtendedKeyUsages = (certificateTemplate.extendedKeyUsages ?? []) as CertExtendedKeyUsage[];
      }
    }

    if (extendedKeyUsages?.length && certificateTemplate) {
      const validExtendedKeyUsages = certificateTemplate.extendedKeyUsages || [];
      if (extendedKeyUsages.some((keyUsage) => !validExtendedKeyUsages.includes(keyUsage))) {
        throw new BadRequestError({
          message: "Invalid extended key usage value based on template policy"
        });
      }
      selectedExtendedKeyUsages = extendedKeyUsages;
    }

    if (selectedExtendedKeyUsages.length) {
      extensions.push(
        new x509.ExtendedKeyUsageExtension(
          selectedExtendedKeyUsages.map((eku) => x509.ExtendedKeyUsage[eku]),
          true
        )
      );
    }

    let altNamesFromCsr: string = "";
    let altNamesArray: {
      type: "email" | "dns";
      value: string;
    }[] = [];
    if (altNames) {
      altNamesArray = altNames
        .split(",")
        .map((name) => name.trim())
        .map((altName) => {
          // check if the altName is a valid email
          if (z.string().email().safeParse(altName).success) {
            return {
              type: "email",
              value: altName
            };
          }

          // check if the altName is a valid hostname
          if (hostnameRegex.test(altName)) {
            return {
              type: "dns",
              value: altName
            };
          }

          // If altName is neither a valid email nor a valid hostname, throw an error or handle it accordingly
          throw new Error(`Invalid altName: ${altName}`);
        });
    } else {
      // attempt to read from CSR if altNames is not explicitly provided
      const sanExtension = csrObj.extensions.find((ext) => ext.type === "2.5.29.17");
      if (sanExtension) {
        const sanNames = new x509.GeneralNames(sanExtension.value);

        altNamesArray = sanNames.items
          .filter((value) => value.type === "email" || value.type === "dns")
          .map((name) => ({
            type: name.type as "email" | "dns",
            value: name.value
          }));

        altNamesFromCsr = sanNames.items.map((item) => item.value).join(",");
      }
    }

    if (altNamesArray.length) {
      const altNamesExtension = new x509.SubjectAlternativeNameExtension(altNamesArray, false);
      extensions.push(altNamesExtension);
    }

    if (certificateTemplate) {
      validateCertificateDetailsAgainstTemplate(
        {
          commonName: cn,
          notBeforeDate,
          notAfterDate,
          altNames: altNamesArray.map((entry) => entry.value)
        },
        certificateTemplate
      );
    }

    const serialNumber = createSerialNumber();
    const leafCert = await x509.X509CertificateGenerator.create({
      serialNumber,
      subject: csrObj.subject,
      issuer: caCertObj.subject,
      notBefore: notBeforeDate,
      notAfter: notAfterDate,
      signingKey: caPrivateKey,
      publicKey: csrObj.publicKey,
      signingAlgorithm: alg,
      extensions
    });

    const kmsEncryptor = await kmsService.encryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });
    const { cipherTextBlob: encryptedCertificate } = await kmsEncryptor({
      plainText: Buffer.from(new Uint8Array(leafCert.rawData))
    });

    await certificateDAL.transaction(async (tx) => {
      const cert = await certificateDAL.create(
        {
          caId: (ca as TCertificateAuthorities).id,
          caCertId: caCert.id,
          certificateTemplateId: certificateTemplate?.id,
          status: CertStatus.ACTIVE,
          friendlyName: friendlyName || csrObj.subject,
          commonName: cn,
          altNames: altNamesFromCsr || altNames,
          serialNumber,
          notBefore: notBeforeDate,
          notAfter: notAfterDate,
          keyUsages: selectedKeyUsages,
          extendedKeyUsages: selectedExtendedKeyUsages
        },
        tx
      );

      await certificateBodyDAL.create(
        {
          certId: cert.id,
          encryptedCertificate
        },
        tx
      );

      if (collectionId) {
        await pkiCollectionItemDAL.create(
          {
            pkiCollectionId: collectionId,
            certId: cert.id
          },
          tx
        );
      }

      return cert;
    });

    const { caCert: issuingCaCertificate, caCertChain } = await getCaCertChain({
      caCertId: ca.activeCaCertId,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      projectDAL,
      kmsService
    });

    return {
      certificate: leafCert,
      certificateChain: `${issuingCaCertificate}\n${caCertChain}`.trim(),
      issuingCaCertificate,
      serialNumber,
      ca
    };
  };

  /**
   * Return list of certificate templates for CA with id [caId].
   */
  const getCaCertificateTemplates = async ({
    caId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TGetCaCertificateTemplatesDTO) => {
    const ca = await certificateAuthorityDAL.findById(caId);
    if (!ca) throw new BadRequestError({ message: "CA not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      ca.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.CertificateTemplates
    );

    const certificateTemplates = await certificateTemplateDAL.find({ caId });

    return {
      certificateTemplates,
      ca
    };
  };

  return {
    createCa,
    getCaById,
    updateCaById,
    deleteCaById,
    getCaCsr,
    renewCaCert,
    getCaCerts,
    getCaCert,
    getCaCertById,
    signIntermediate,
    importCertToCa,
    issueCertFromCa,
    signCertFromCa,
    getCaCertificateTemplates
  };
};
