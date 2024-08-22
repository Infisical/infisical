/* eslint-disable no-bitwise */
import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import crypto, { KeyObject } from "crypto";
import ms from "ms";
import { z } from "zod";

import { TCertificateAuthorities, TCertificateTemplates } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TPkiCollectionDALFactory } from "@app/services/pki-collection/pki-collection-dal";
import { TPkiCollectionItemDALFactory } from "@app/services/pki-collection/pki-collection-item-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateAuthorityCrlDALFactory } from "../../ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { CertKeyAlgorithm, CertStatus } from "../certificate/certificate-types";
import { TCertificateTemplateDALFactory } from "../certificate-template/certificate-template-dal";
import { validateCertificateDetailsAgainstTemplate } from "../certificate-template/certificate-template-fns";
import { TCertificateAuthorityCertDALFactory } from "./certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "./certificate-authority-dal";
import {
  createDistinguishedName,
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
  certificateTemplateDAL: Pick<TCertificateTemplateDALFactory, "getById">;
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

      const serialNumber = crypto.randomBytes(32).toString("hex");

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
          })
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
            new x509.ExtendedKeyUsageExtension(["1.2.3.4.5.6.7", "2.3.4.5.6.7.8"], true),
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
          encryptedCrl
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
  const updateCaById = async ({ caId, status, actorId, actorAuthMethod, actor, actorOrgId }: TUpdateCaDTO) => {
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

    const updatedCa = await certificateAuthorityDAL.updateById(caId, { status });

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
    if (ca.activeCaCertId) throw new BadRequestError({ message: "CA already has a certificate installed" });

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
   * Note: Currently implements CA renewal with same key-pair only
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

    const serialNumber = crypto.randomBytes(32).toString("hex");

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
            new x509.ExtendedKeyUsageExtension(["1.2.3.4.5.6.7", "2.3.4.5.6.7.8"], true),
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

    const { caPrivateKey } = await getCaCredentials({
      caId: ca.id,
      certificateAuthorityDAL,
      certificateAuthoritySecretDAL,
      projectDAL,
      kmsService
    });

    const serialNumber = crypto.randomBytes(32).toString("hex");
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
        await x509.SubjectKeyIdentifierExtension.create(csrObj.publicKey)
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
   * Import certificate for (un-installed) CA with id [caId].
   * Note: Can be used to import an external certificate and certificate chain
   * to be installed into the CA.
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

    if (ca.activeCaCertId) throw new BadRequestError({ message: "CA has already imported a certificate" });

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
          version: 1,
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
    actorOrgId
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

    const { caPrivateKey } = await getCaCredentials({
      caId: ca.id,
      certificateAuthorityDAL,
      certificateAuthoritySecretDAL,
      projectDAL,
      kmsService
    });

    const extensions: x509.Extension[] = [
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment, true),
      new x509.BasicConstraintsExtension(false),
      await x509.AuthorityKeyIdentifierExtension.create(caCertObj, false),
      await x509.SubjectKeyIdentifierExtension.create(csrObj.publicKey)
    ];

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

    const serialNumber = crypto.randomBytes(32).toString("hex");
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
          notAfter: notAfterDate
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
  const signCertFromCa = async ({
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
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TSignCertFromCaDTO) => {
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

    const { caPrivateKey } = await getCaCredentials({
      caId: ca.id,
      certificateAuthorityDAL,
      certificateAuthoritySecretDAL,
      projectDAL,
      kmsService
    });

    const extensions: x509.Extension[] = [
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment, true),
      new x509.BasicConstraintsExtension(false),
      await x509.AuthorityKeyIdentifierExtension.create(caCertObj, false),
      await x509.SubjectKeyIdentifierExtension.create(csrObj.publicKey)
    ];

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
          commonName: cn,
          notBeforeDate,
          notAfterDate,
          altNames: altNamesArray.map((entry) => entry.value)
        },
        certificateTemplate
      );
    }

    const serialNumber = crypto.randomBytes(32).toString("hex");
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
          altNames,
          serialNumber,
          notBefore: notBeforeDate,
          notAfter: notAfterDate
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
      certificate: leafCert.toString("pem"),
      certificateChain: `${issuingCaCertificate}\n${caCertChain}`.trim(),
      issuingCaCertificate,
      serialNumber,
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
    signIntermediate,
    importCertToCa,
    issueCertFromCa,
    signCertFromCa
  };
};
