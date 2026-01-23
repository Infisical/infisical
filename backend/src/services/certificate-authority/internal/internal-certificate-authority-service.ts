/* eslint-disable no-nested-ternary */
/* eslint-disable no-bitwise */
import { ForbiddenError, subject } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";

import { ActionProjectType, TableName, TCertificateAuthorities, TCertificateTemplates } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionPkiTemplateActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { extractX509CertFromChain } from "@app/lib/certificates/extract-certificate";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TPkiCollectionDALFactory } from "@app/services/pki-collection/pki-collection-dal";
import { TPkiCollectionItemDALFactory } from "@app/services/pki-collection/pki-collection-item-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateAuthorityCrlDALFactory } from "../../../ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { TCertificateSecretDALFactory } from "../../certificate/certificate-secret-dal";
import {
  CertExtendedKeyUsage,
  CertExtendedKeyUsageOIDToName,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertStatus,
  TAltNameMapping
} from "../../certificate/certificate-types";
import { DEFAULT_CRL_VALIDITY_DAYS } from "../../certificate-common/certificate-constants";
import { TCertificateTemplateDALFactory } from "../../certificate-template/certificate-template-dal";
import { validateCertificateDetailsAgainstTemplate } from "../../certificate-template/certificate-template-fns";
import { TCertificateAuthorityCertDALFactory } from "../certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory, TCertificateAuthorityWithAssociatedCa } from "../certificate-authority-dal";
import { CaStatus, InternalCaType } from "../certificate-authority-enums";
import {
  createDistinguishedName,
  createSerialNumber,
  expandInternalCa,
  getCaCertChain, // TODO: consider rename
  getCaCertChains,
  getCaCredentials,
  keyAlgorithmToAlgCfg,
  parseDistinguishedName,
  signatureAlgorithmToAlgCfg
} from "../certificate-authority-fns";
import { TCertificateAuthorityQueueFactory } from "../certificate-authority-queue";
import { TCertificateAuthoritySecretDALFactory } from "../certificate-authority-secret-dal";
import { validateAndMapAltNameType } from "../certificate-authority-validators";
import { TInternalCertificateAuthorityDALFactory } from "./internal-certificate-authority-dal";
import {
  TCreateCaDTO,
  TDeleteCaDTO,
  TGetCaCertDTO,
  TGetCaCertificateTemplatesDTO,
  TGetCaCertsDTO,
  TGetCaCsrDTO,
  TGetCaDTO,
  TImportCertToCaDTO,
  TIssueCertFromCaDTO,
  TIssueCertFromCaResponse,
  TRenewCaCertDTO,
  TSignCertFromCaDTO,
  TSignIntermediateDTO,
  TUpdateCaDTO
} from "./internal-certificate-authority-types";

type TInternalCertificateAuthorityServiceFactoryDep = {
  certificateAuthorityDAL: Pick<
    TCertificateAuthorityDALFactory,
    | "transaction"
    | "create"
    | "findById"
    | "updateById"
    | "deleteById"
    | "findOne"
    | "findByIdWithAssociatedCa"
    | "findWithAssociatedCa"
  >;
  internalCertificateAuthorityDAL: Pick<
    TInternalCertificateAuthorityDALFactory,
    "transaction" | "create" | "findById" | "updateById" | "deleteById" | "findOne" | "update"
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
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  pkiCollectionDAL: Pick<TPkiCollectionDALFactory, "findById">;
  pkiCollectionItemDAL: Pick<TPkiCollectionItemDALFactory, "create">;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug" | "findOne" | "updateById" | "findById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TInternalCertificateAuthorityServiceFactory = ReturnType<typeof internalCertificateAuthorityServiceFactory>;

export const internalCertificateAuthorityServiceFactory = ({
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  certificateAuthoritySecretDAL,
  certificateAuthorityCrlDAL,
  certificateTemplateDAL,
  certificateDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  pkiCollectionDAL,
  pkiCollectionItemDAL,
  internalCertificateAuthorityDAL,
  projectDAL,
  kmsService,
  permissionService
}: TInternalCertificateAuthorityServiceFactoryDep) => {
  const $checkSignature = (caKeyAlg: string, requestedKeyType: string, signatureAlgorithm?: string) => {
    const isRsaCa = caKeyAlg.startsWith("RSA");
    const isEcdsaCa = caKeyAlg.startsWith("EC") || caKeyAlg.startsWith("ECDSA");

    // eslint-disable-next-line no-nested-ternary
    const caSupports = isRsaCa ? "RSA" : isEcdsaCa ? "ECDSA" : "unknown";

    const isRequestValid = (requestedKeyType === "RSA" && isRsaCa) || (requestedKeyType === "ECDSA" && isEcdsaCa);

    if (!isRequestValid) {
      throw new BadRequestError({
        message: `Requested signature algorithm ${signatureAlgorithm} is not compatible with CA key algorithm ${caKeyAlg}. CA can only sign with ${caSupports}-based signature algorithms.`
      });
    }
  };

  /**
   * Validates CA path length constraints and creates the BasicConstraints extension.
   * This handles both policy-level validation and issuing CA hierarchy validation.
   */
  const $createBasicConstraintsExtension = ({
    basicConstraints,
    pathLength,
    caCertObj
  }: {
    basicConstraints?: { isCA: boolean; pathLength?: number } | null;
    pathLength?: number | null;
    caCertObj: x509.X509Certificate;
  }): x509.BasicConstraintsExtension => {
    const shouldIssueCaCertificate = basicConstraints !== undefined && basicConstraints !== null;

    if (!shouldIssueCaCertificate) {
      return new x509.BasicConstraintsExtension(false);
    }

    // Validate against policy's maxPathLength
    const policyMaxPathLength = basicConstraints.pathLength;
    if (policyMaxPathLength !== undefined && policyMaxPathLength !== null && policyMaxPathLength !== -1) {
      if (pathLength === undefined || pathLength === null) {
        throw new BadRequestError({
          message: `Path length is required when issuing CA certificates because the policy only allows a maximum path length of ${policyMaxPathLength}.`
        });
      }
      if (pathLength > policyMaxPathLength) {
        throw new BadRequestError({
          message: `Path length (${pathLength}) exceeds policy's maximum allowed path length (${policyMaxPathLength})`
        });
      }
    }

    // Validate against issuing CA's BasicConstraints
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const issuingCaBasicConstraints = caCertObj.getExtension("2.5.29.19") as x509.BasicConstraintsExtension | null;

    if (issuingCaBasicConstraints) {
      const issuingCaPathLength = issuingCaBasicConstraints.pathLength;

      if (issuingCaPathLength === 0) {
        throw new BadRequestError({
          message: "Issuing CA cannot issue subordinate CA certificates (path length is 0)"
        });
      }

      if (issuingCaPathLength !== undefined && pathLength !== undefined && pathLength !== null) {
        if (pathLength >= issuingCaPathLength) {
          throw new BadRequestError({
            message: `Path length (${pathLength}) must be less than issuing CA's path length (${issuingCaPathLength})`
          });
        }
      }

      const effectivePathLength =
        pathLength !== undefined && pathLength !== null
          ? pathLength
          : issuingCaPathLength !== undefined
            ? issuingCaPathLength - 1
            : undefined;

      return new x509.BasicConstraintsExtension(true, effectivePathLength, true);
    }

    const effectivePathLength = pathLength !== undefined && pathLength !== null ? pathLength : undefined;
    return new x509.BasicConstraintsExtension(true, effectivePathLength, true);
  };

  const createCa = async ({
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
    name,
    ...dto
  }: TCreateCaDTO) => {
    let projectId: string;
    if (!dto.isInternal) {
      const project = await projectDAL.findProjectBySlug(dto.projectSlug, dto.actorOrgId);
      if (!project) throw new NotFoundError({ message: `Project with slug '${dto.projectSlug}' not found` });
      projectId = project.id;

      const { permission } = await permissionService.getProjectPermission({
        actor: dto.actor,
        actorId: dto.actorId,
        projectId,
        actorAuthMethod: dto.actorAuthMethod,
        actorOrgId: dto.actorOrgId,
        actionProjectType: ActionProjectType.CertificateManager
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionCertificateAuthorityActions.Create,
        subject(ProjectPermissionSub.CertificateAuthorities, { name: commonName })
      );
    } else {
      projectId = dto.projectId;
    }

    const dn = createDistinguishedName({
      commonName,
      organization,
      ou,
      country,
      province,
      locality
    });

    const alg = keyAlgorithmToAlgCfg(keyAlgorithm);
    const keys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);

    const newCa = await certificateAuthorityDAL.transaction(async (tx) => {
      const notBeforeDate = notBefore ? new Date(notBefore) : new Date();

      // if undefined, set [notAfterDate] to 10 years from now
      const notAfterDate = notAfter
        ? new Date(notAfter)
        : new Date(new Date().setFullYear(new Date().getFullYear() + 10));

      const serialNumber = createSerialNumber();

      const ca = await certificateAuthorityDAL.create(
        {
          projectId,
          name: name || slugify(`${(friendlyName || dn).slice(0, 16)}-${alphaNumericNanoId(8)}`),
          status: type === InternalCaType.ROOT ? CaStatus.ACTIVE : CaStatus.PENDING_CERTIFICATE,
          enableDirectIssuance: false
        },
        tx
      );

      const internalCa = await internalCertificateAuthorityDAL.create(
        {
          caId: ca.id,
          type,
          organization,
          ou,
          country,
          province,
          locality,
          friendlyName: friendlyName || dn,
          commonName,
          dn,
          keyAlgorithm,
          ...(type === InternalCaType.ROOT && {
            maxPathLength,
            notBefore: notBeforeDate,
            notAfter: notAfterDate,
            serialNumber
          })
        },
        tx
      );

      const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
        projectId,
        projectDAL,
        kmsService
      });
      const kmsEncryptor = await kmsService.encryptWithKmsKey({
        kmsId: certificateManagerKmsId
      });

      // https://nodejs.org/api/crypto.html#static-method-keyobjectfromkey
      const skObj = crypto.nativeCrypto.KeyObject.from(keys.privateKey);

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

      if (type === InternalCaType.ROOT) {
        // note: create self-signed cert only applicable for root CA
        const cert = await x509.X509CertificateGenerator.createSelfSigned({
          name: dn,
          serialNumber,
          notBefore: notBeforeDate,
          notAfter: notAfterDate,
          signingAlgorithm: alg,
          keys,
          extensions: [
            new x509.BasicConstraintsExtension(
              true,
              maxPathLength === -1 || maxPathLength === null ? undefined : maxPathLength,
              true
            ),
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

        await internalCertificateAuthorityDAL.updateById(
          internalCa.id,
          {
            activeCaCertId: caCert.id
          },
          tx
        );
      }

      // create empty CRL
      const thisUpdate = new Date();
      const nextUpdate = new Date(thisUpdate);
      nextUpdate.setDate(nextUpdate.getDate() + DEFAULT_CRL_VALIDITY_DAYS);

      const crl = await x509.X509CrlGenerator.create({
        issuer: internalCa.dn,
        thisUpdate,
        nextUpdate,
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

      return certificateAuthorityDAL.findByIdWithAssociatedCa(ca.id, tx);
    });

    return expandInternalCa(newCa);
  };

  /**
   * Return CA with id [caId]
   */
  const getCaById = async ({ caId, actorId, actorAuthMethod, actor, actorOrgId }: TGetCaDTO) => {
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

    return expandInternalCa(ca);
  };

  /**
   * Update CA with id [caId].
   * Note: Used to enable/disable CA
   */
  const updateCaById = async ({ caId, status, name, ...dto }: TUpdateCaDTO) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca.internalCa) throw new NotFoundError({ message: `CA with ID '${caId}' not found` });

    if (!dto.isInternal) {
      const { permission } = await permissionService.getProjectPermission({
        actor: dto.actor,
        actorId: dto.actorId,
        projectId: ca.projectId,
        actorAuthMethod: dto.actorAuthMethod,
        actorOrgId: dto.actorOrgId,
        actionProjectType: ActionProjectType.CertificateManager
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionCertificateAuthorityActions.Edit,
        subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })
      );
    }

    const updatedCa = await certificateAuthorityDAL.transaction(async (tx) => {
      if (status !== undefined || name !== undefined) {
        await certificateAuthorityDAL.updateById(ca.id, { status, name }, tx);
      }

      return certificateAuthorityDAL.findByIdWithAssociatedCa(caId, tx);
    });

    return expandInternalCa(updatedCa);
  };

  /**
   * Delete CA with id [caId]
   */
  const deleteCaById = async ({ caId, actorId, actorAuthMethod, actor, actorOrgId }: TDeleteCaDTO) => {
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
      ProjectPermissionCertificateAuthorityActions.Delete,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })
    );

    await certificateAuthorityDAL.deleteById(ca.id);

    return expandInternalCa(ca);
  };

  /**
   * Return certificate signing request (CSR) made with CA with id [caId]
   */
  const getCaCsr = async ({ caId, actorId, actorAuthMethod, actor, actorOrgId }: TGetCaCsrDTO) => {
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
      ProjectPermissionCertificateAuthorityActions.Create,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })
    );

    if (ca.internalCa.type === InternalCaType.ROOT)
      throw new BadRequestError({ message: "Root CA cannot generate CSR" });

    const { caPrivateKey, caPublicKey } = await getCaCredentials({
      caId,
      certificateAuthorityDAL,
      certificateAuthoritySecretDAL,
      projectDAL,
      kmsService
    });

    const alg = keyAlgorithmToAlgCfg(ca.internalCa.keyAlgorithm as CertKeyAlgorithm);

    const csrObj = await x509.Pkcs10CertificateRequestGenerator.create({
      name: ca.internalCa.dn,
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
      ca: expandInternalCa(ca)
    };
  };

  /**
   * Renew certificate for CA with id [caId]
   * Note 1: This CA renewal method is only applicable to CAs with internal parent CAs
   * Note 2: Currently implements CA renewal with same key-pair only
   */
  const renewCaCert = async ({ caId, notAfter, actorId, actorAuthMethod, actor, actorOrgId }: TRenewCaCertDTO) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca.internalCa) throw new NotFoundError({ message: `CA with ID '${caId}' not found` });

    if (!ca.internalCa.activeCaCertId)
      throw new BadRequestError({ message: "CA does not have a certificate installed" });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateAuthorityActions.Renew,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })
    );

    if (ca.status === CaStatus.DISABLED) throw new BadRequestError({ message: "CA is disabled" });

    // get latest CA certificate
    const caCert = await certificateAuthorityCertDAL.findById(ca.internalCa.activeCaCertId);

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

    const alg = keyAlgorithmToAlgCfg(ca.internalCa.keyAlgorithm as CertKeyAlgorithm);

    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });
    const decryptedCaCert = await kmsDecryptor({
      cipherTextBlob: caCert.encryptedCertificate
    });

    const caCertObj = new x509.X509Certificate(decryptedCaCert);

    let certificate = "";
    let certificateChain = "";

    switch (ca.internalCa.type) {
      case InternalCaType.ROOT: {
        if (new Date(notAfter) <= new Date(caCertObj.notAfter)) {
          throw new BadRequestError({
            message:
              "New Root CA certificate must have notAfter date that is greater than the current certificate notAfter date"
          });
        }

        const notBeforeDate = new Date();
        const cert = await x509.X509CertificateGenerator.createSelfSigned({
          name: ca.internalCa.dn,
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
              ca.internalCa.maxPathLength === -1 || !ca.internalCa.maxPathLength
                ? undefined
                : ca.internalCa.maxPathLength,
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

        await internalCertificateAuthorityDAL.transaction(async (tx) => {
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

          await internalCertificateAuthorityDAL.update(
            {
              caId: ca.id
            },
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
      case InternalCaType.INTERMEDIATE: {
        if (!ca.internalCa.parentCaId) {
          // TODO: look into optimal way to support renewal of intermediate CA with external parent CA
          throw new BadRequestError({
            message: "Failed to renew intermediate CA certificate with external parent CA"
          });
        }

        const parentCa = await certificateAuthorityDAL.findByIdWithAssociatedCa(ca.internalCa.parentCaId);
        const { caPrivateKey: parentCaPrivateKey } = await getCaCredentials({
          caId: parentCa.id,
          certificateAuthorityDAL,
          certificateAuthoritySecretDAL,
          projectDAL,
          kmsService
        });

        if (!parentCa.internalCa) {
          throw new BadRequestError({ message: "Parent CA not found" });
        }

        // get latest parent CA certificate
        if (!parentCa.internalCa.activeCaCertId)
          throw new BadRequestError({ message: "Parent CA does not have a certificate installed" });

        const parentCaCert = await certificateAuthorityCertDAL.findById(parentCa.internalCa.activeCaCertId);

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
          name: ca.internalCa.dn,
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
              ca.internalCa.maxPathLength === -1 || !ca.internalCa.maxPathLength
                ? undefined
                : ca.internalCa.maxPathLength,
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
          caCertId: parentCa.internalCa.activeCaCertId,
          certificateAuthorityDAL,
          certificateAuthorityCertDAL,
          projectDAL,
          kmsService
        });

        certificateChain = `${parentCaCertificate}\n${parentCaCertChain}`.trim();

        const { cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
          plainText: Buffer.from(certificateChain)
        });

        await internalCertificateAuthorityDAL.transaction(async (tx) => {
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

          await internalCertificateAuthorityDAL.update(
            {
              caId: ca.id
            },
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
      ca: {
        ...ca,
        ...ca.internalCa
      }
    };
  };

  const getCaCerts = async ({ caId, actorId, actorAuthMethod, actor, actorOrgId }: TGetCaCertsDTO) => {
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

    const caCertChains = await getCaCertChains({
      caId,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      projectDAL,
      kmsService
    });

    return {
      ca: expandInternalCa(ca),
      caCerts: caCertChains
    };
  };

  /**
   * Return current certificate and certificate chain for CA
   */
  const getCaCert = async ({ caId, actorId, actorAuthMethod, actor, actorOrgId }: TGetCaCertDTO) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca.internalCa) throw new NotFoundError({ message: `CA with ID '${caId}' not found` });
    if (!ca.internalCa.activeCaCertId)
      throw new BadRequestError({ message: "CA does not have a certificate installed" });

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

    const { caCert, caCertChain, serialNumber } = await getCaCertChain({
      caCertId: ca.internalCa.activeCaCertId,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      projectDAL,
      kmsService
    });

    return {
      certificate: caCert,
      certificateChain: caCertChain,
      serialNumber,
      ca: expandInternalCa(ca)
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
      throw new NotFoundError({ message: `Ca certificate with ID '${caCertId}' not found for CA with ID '${caId}'` });
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
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca.internalCa) throw new NotFoundError({ message: "CA not found" });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateAuthorityActions.SignIntermediate,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })
    );

    if (ca.status === CaStatus.DISABLED) throw new BadRequestError({ message: "CA is disabled" });
    if (!ca.internalCa.activeCaCertId)
      throw new BadRequestError({ message: "CA does not have a certificate installed" });

    const caCert = await certificateAuthorityCertDAL.findById(ca.internalCa.activeCaCertId);

    if (ca.internalCa.notAfter && new Date() > new Date(ca.internalCa.notAfter)) {
      throw new BadRequestError({ message: "CA is expired" });
    }

    const alg = keyAlgorithmToAlgCfg(ca.internalCa.keyAlgorithm as CertKeyAlgorithm);

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
    const distributionPointUrl = `${appCfg.SITE_URL}/api/v1/cert-manager/crl/${caCrl.id}/der`;

    const caIssuerUrl = `${appCfg.SITE_URL}/api/v1/cert-manager/ca/internal/${ca.id}/certificates/${caCert.id}/der`;
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
      caCertId: ca.internalCa.activeCaCertId,
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
      ca: expandInternalCa(ca)
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
      ProjectPermissionCertificateAuthorityActions.Create,
      subject(ProjectPermissionSub.CertificateAuthorities, { name: ca.name })
    );

    if (ca.internalCa.parentCaId) {
      /**
       * re-evaluate in the future if we should allow users to import a new CA certificate for an intermediate
       * CA chained to an internal parent CA. Doing so would allow users to re-chain the CA to a different
       * internal CA.
       */
      throw new BadRequestError({
        message: "Cannot import certificate to intermediate CA chained to internal parent CA"
      });
    }

    const caCert = ca.internalCa.activeCaCertId
      ? await certificateAuthorityCertDAL.findById(ca.internalCa.activeCaCertId)
      : undefined;

    const certObj = new x509.X509Certificate(certificate);
    const maxPathLength = certObj.getExtension(x509.BasicConstraintsExtension)?.pathLength;

    // validate imported certificate and certificate chain
    const certificates = extractX509CertFromChain(certificateChain)?.map((cert) => new x509.X509Certificate(cert));

    if (!certificates) throw new BadRequestError({ message: "Failed to parse certificate chain" });

    const chain = new x509.X509ChainBuilder({
      certificates
    });

    const chainItems = await chain.build(certObj);

    // chain.build() implicitly verifies the chain
    if (chainItems.length !== certificates.length + 1)
      throw new BadRequestError({ message: "Invalid certificate chain" });

    const parentCertObj = chainItems[1];
    const parentSerialNumber = parentCertObj.serialNumber;

    const [parentCa] = await certificateAuthorityDAL.findWithAssociatedCa({
      [`${TableName.CertificateAuthority}.projectId` as "projectId"]: ca.projectId,
      [`${TableName.InternalCertificateAuthority}.serialNumber` as "serialNumber"]: parentSerialNumber
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

    const isCaAndCertPublicKeySame = Buffer.from(
      await crypto.nativeCrypto.subtle.exportKey("spki", caPublicKey)
    ).equals(Buffer.from(certObj.publicKey.rawData));

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

      await certificateAuthorityDAL.updateById(ca.id, {
        status: CaStatus.ACTIVE
      });

      await internalCertificateAuthorityDAL.update(
        {
          caId: ca.id
        },
        {
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

    return { ca: expandInternalCa(ca) };
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
    extendedKeyUsages,
    signatureAlgorithm,
    keyAlgorithm,
    isFromProfile,
    internal = false,
    basicConstraints,
    pathLength,
    organization,
    country,
    state,
    locality,
    ou,
    tx
  }: TIssueCertFromCaDTO): Promise<TIssueCertFromCaResponse> => {
    let ca: TCertificateAuthorityWithAssociatedCa | undefined;
    let certificateTemplate: TCertificateTemplates | undefined;
    let collectionId = pkiCollectionId;

    if (caId) {
      ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    } else if (certificateTemplateId) {
      certificateTemplate = await certificateTemplateDAL.getById(certificateTemplateId);
      if (!certificateTemplate) {
        throw new NotFoundError({
          message: `Certificate template with ID '${certificateTemplateId}' not found`
        });
      }

      if (!collectionId) {
        collectionId = certificateTemplate.pkiCollectionId as string;
      }
      ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(certificateTemplate.caId);
    }

    if (!ca) {
      throw new NotFoundError({ message: `Internal CA with ID '${caId}' not found` });
    }

    if (!ca?.internalCa?.id) {
      throw new NotFoundError({ message: `Internal CA with ID '${caId}' not found` });
    }

    if (!internal) {
      if (!actor || !actorId || !actorAuthMethod || !actorOrgId) {
        throw new BadRequestError({ message: "Actor is required" });
      }
      const { permission } = await permissionService.getProjectPermission({
        actor,
        actorId,
        projectId: ca.projectId,
        actorAuthMethod,
        actorOrgId,
        actionProjectType: ActionProjectType.CertificateManager
      });

      if (isFromProfile) {
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionCertificateProfileActions.IssueCert,
          ProjectPermissionSub.CertificateProfiles
        );
      } else {
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionCertificateActions.Create,
          ProjectPermissionSub.Certificates
        );
      }
    }

    if (ca.status !== CaStatus.ACTIVE) throw new BadRequestError({ message: "CA is not active" });
    if (!ca.internalCa.activeCaCertId)
      throw new BadRequestError({ message: "CA does not have a certificate installed" });
    if (!isFromProfile && !ca.enableDirectIssuance && !certificateTemplate) {
      throw new BadRequestError({ message: "Certificate template or subscriber is required for issuance" });
    }

    const caCert = await certificateAuthorityCertDAL.findById(ca.internalCa.activeCaCertId);

    if (ca.internalCa.notAfter && new Date() > new Date(ca.internalCa.notAfter)) {
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

    const effectiveKeyAlgorithm =
      (keyAlgorithm as CertKeyAlgorithm) || (ca.internalCa.keyAlgorithm as CertKeyAlgorithm);
    const keyGenAlg = keyAlgorithmToAlgCfg(effectiveKeyAlgorithm);
    const leafKeys = await crypto.nativeCrypto.subtle.generateKey(keyGenAlg, true, ["sign", "verify"]);

    if (signatureAlgorithm && ca.internalCa.keyAlgorithm) {
      $checkSignature(ca.internalCa.keyAlgorithm, signatureAlgorithm.split("-")[0], signatureAlgorithm);
    }

    // Determine signing algorithm for certificate signing
    const signingAlg = signatureAlgorithm
      ? signatureAlgorithmToAlgCfg(signatureAlgorithm, ca.internalCa.keyAlgorithm as CertKeyAlgorithm)
      : keyAlgorithmToAlgCfg(ca.internalCa.keyAlgorithm as CertKeyAlgorithm);

    const leafDn = createDistinguishedName({
      commonName,
      organization,
      ou,
      country,
      province: state,
      locality
    });

    const csrObj = await x509.Pkcs10CertificateRequestGenerator.create({
      name: leafDn,
      keys: leafKeys,
      signingAlgorithm: keyGenAlg,
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
      kmsService,
      signatureAlgorithm: signingAlg
    });

    const caCrl = await certificateAuthorityCrlDAL.findOne({ caSecretId: caSecret.id });
    const appCfg = getConfig();

    const distributionPointUrl = `${appCfg.SITE_URL}/api/v1/cert-manager/crl/${caCrl.id}/der`;
    const caIssuerUrl = `${appCfg.SITE_URL}/api/v1/cert-manager/ca/internal/${ca.id}/certificates/${caCert.id}/der`;

    const basicConstraintsExtension = $createBasicConstraintsExtension({
      basicConstraints,
      pathLength,
      caCertObj
    });

    const extensions: x509.Extension[] = [
      basicConstraintsExtension,
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
      selectedKeyUsages = isFromProfile ? [] : [CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT];
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

    let altNamesArray: TAltNameMapping[] = [];

    if (altNames) {
      altNamesArray = altNames
        .split(",")
        .map((name) => name.trim())
        .map((altName): TAltNameMapping => {
          const altNameType = validateAndMapAltNameType(altName);
          if (!altNameType) {
            throw new Error(`Invalid altName: ${altName}`);
          }
          return altNameType;
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
      signingAlgorithm: signingAlg,
      extensions
    });

    const skLeafObj = crypto.nativeCrypto.KeyObject.from(leafKeys.privateKey);
    const skLeaf = skLeafObj.export({ format: "pem", type: "pkcs8" }) as string;

    const kmsEncryptor = await kmsService.encryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });
    const { cipherTextBlob: encryptedCertificate } = await kmsEncryptor({
      plainText: Buffer.from(new Uint8Array(leafCert.rawData))
    });
    const { cipherTextBlob: encryptedPrivateKey } = await kmsEncryptor({
      plainText: Buffer.from(skLeaf)
    });

    const { caCert: issuingCaCertificate, caCertChain } = await getCaCertChain({
      caCertId: caCert.id,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      projectDAL,
      kmsService
    });

    const certificateChainPem = `${issuingCaCertificate}\n${caCertChain}`.trim();

    const { cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
      plainText: Buffer.from(certificateChainPem)
    });

    const executeIssueCertOperations = async (transaction: Knex) => {
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
          extendedKeyUsages: selectedExtendedKeyUsages,
          projectId: ca!.projectId,
          keyAlgorithm: effectiveKeyAlgorithm,
          signatureAlgorithm: signatureAlgorithm || ca!.internalCa!.keyAlgorithm
        },
        transaction
      );

      await certificateBodyDAL.create(
        {
          certId: cert.id,
          encryptedCertificate,
          encryptedCertificateChain
        },
        transaction
      );

      await certificateSecretDAL.create(
        {
          certId: cert.id,
          encryptedPrivateKey
        },
        transaction
      );

      if (collectionId) {
        await pkiCollectionItemDAL.create(
          {
            pkiCollectionId: collectionId,
            certId: cert.id
          },
          transaction
        );
      }

      return cert;
    };

    let cert;
    if (tx) {
      cert = await executeIssueCertOperations(tx);
    } else {
      cert = await certificateDAL.transaction(executeIssueCertOperations);
    }

    return {
      certificate: leafCert.toString("pem"),
      certificateChain: certificateChainPem,
      issuingCaCertificate,
      privateKey: skLeaf,
      serialNumber,
      certificateId: cert.id,
      commonName,
      ca: expandInternalCa(ca)
    };
  };

  /**
   * Return new leaf certificate issued by CA with id [caId].
   * Note: CSR is generated externally and submitted to Infisical.
   */
  const signCertFromCa = async (dto: TSignCertFromCaDTO) => {
    const appCfg = getConfig();
    let ca: TCertificateAuthorityWithAssociatedCa | undefined;
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
      extendedKeyUsages,
      signatureAlgorithm,
      keyAlgorithm,
      basicConstraints,
      pathLength,
      tx
    } = dto;

    let collectionId = pkiCollectionId;

    if (caId) {
      ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId, tx);
    } else if (certificateTemplateId) {
      certificateTemplate = await certificateTemplateDAL.getById(certificateTemplateId, tx);
      if (!certificateTemplate) {
        throw new NotFoundError({
          message: `Certificate template with ID '${certificateTemplateId}' not found`
        });
      }

      collectionId = certificateTemplate.pkiCollectionId as string;
      ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(certificateTemplate.caId, tx);
    }

    if (!ca) {
      throw new NotFoundError({ message: `Internal CA with ID '${caId}' not found` });
    }

    if (!ca?.internalCa?.id) {
      throw new NotFoundError({ message: `Internal CA with ID '${caId}' not found` });
    }

    if (!dto.isInternal) {
      const { permission } = await permissionService.getProjectPermission({
        actor: dto.actor,
        actorId: dto.actorId,
        projectId: ca.projectId,
        actorAuthMethod: dto.actorAuthMethod,
        actorOrgId: dto.actorOrgId,
        actionProjectType: ActionProjectType.CertificateManager
      });

      if (dto.isFromProfile && dto.profileId) {
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionCertificateProfileActions.IssueCert,
          ProjectPermissionSub.CertificateProfiles
        );
      } else {
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionCertificateActions.Create,
          ProjectPermissionSub.Certificates
        );
      }
    }

    if (ca.status !== CaStatus.ACTIVE) throw new BadRequestError({ message: "CA is not active" });
    if (!ca.internalCa.activeCaCertId)
      throw new BadRequestError({ message: "CA does not have a certificate installed" });
    if (!dto.isFromProfile && !ca.enableDirectIssuance && !certificateTemplate) {
      throw new BadRequestError({ message: "Certificate template or subscriber is required for issuance" });
    }

    const caCert = await certificateAuthorityCertDAL.findById(ca.internalCa.activeCaCertId);

    if (ca.internalCa.notAfter && new Date() > new Date(ca.internalCa.notAfter)) {
      throw new BadRequestError({ message: "CA is expired" });
    }

    // check PKI collection
    if (pkiCollectionId) {
      const pkiCollection = await pkiCollectionDAL.findById(pkiCollectionId, tx);
      if (!pkiCollection) throw new NotFoundError({ message: `PKI collection with ID '${pkiCollectionId}' not found` });
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

    if (signatureAlgorithm && ca.internalCa.keyAlgorithm) {
      $checkSignature(ca.internalCa.keyAlgorithm, signatureAlgorithm.split("-")[0], signatureAlgorithm);
    }

    const effectiveKeyAlgorithm = (keyAlgorithm || ca.internalCa.keyAlgorithm) as CertKeyAlgorithm;
    const alg = signatureAlgorithm
      ? signatureAlgorithmToAlgCfg(signatureAlgorithm, effectiveKeyAlgorithm)
      : keyAlgorithmToAlgCfg(ca.internalCa.keyAlgorithm as CertKeyAlgorithm);

    const csrObj = new x509.Pkcs10CertificateRequest(csr);

    const dn = parseDistinguishedName(csrObj.subject);
    const cn = (commonName || dn.commonName) ?? "";

    const { caPrivateKey, caSecret } = await getCaCredentials({
      caId: ca.id,
      certificateAuthorityDAL,
      certificateAuthoritySecretDAL,
      projectDAL,
      kmsService,
      signatureAlgorithm: alg
    });

    const caCrl = await certificateAuthorityCrlDAL.findOne({ caSecretId: caSecret.id });
    const distributionPointUrl = `${appCfg.SITE_URL}/api/v1/cert-manager/crl/${caCrl.id}/der`;

    const caIssuerUrl = `${appCfg.SITE_URL}/api/v1/cert-manager/ca/internal/${ca.id}/certificates/${caCert.id}/der`;

    const basicConstraintsExtension = $createBasicConstraintsExtension({
      basicConstraints,
      pathLength,
      caCertObj
    });

    const extensions: x509.Extension[] = [
      basicConstraintsExtension,
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
        selectedKeyUsages = dto.isFromProfile ? [] : [CertKeyUsage.DIGITAL_SIGNATURE, CertKeyUsage.KEY_ENCIPHERMENT];
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
    let altNamesArray: TAltNameMapping[] = [];

    if (altNames) {
      altNamesArray = altNames
        .split(",")
        .map((name) => name.trim())
        .map((altName): TAltNameMapping => {
          const altNameType = validateAndMapAltNameType(altName);
          if (!altNameType) {
            throw new Error(`Invalid altName: ${altName}`);
          }
          return altNameType;
        });

      const altNamesExtension = new x509.SubjectAlternativeNameExtension(altNamesArray, false);
      extensions.push(altNamesExtension);
    } else {
      // attempt to read from CSR if altNames is not explicitly provided
      const sanExtension = csrObj.extensions.find((ext) => ext.type === "2.5.29.17");
      if (sanExtension) {
        const sanNames = new x509.GeneralNames(sanExtension.value);

        altNamesArray = sanNames.items
          .filter(
            (value) => value.type === "email" || value.type === "dns" || value.type === "url" || value.type === "ip"
          )
          .map((name): TAltNameMapping => {
            const altNameType = validateAndMapAltNameType(name.value);
            if (!altNameType) {
              throw new Error(`Invalid altName from CSR: ${name.value}`);
            }
            return altNameType;
          });

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

    const { caCert: issuingCaCertificate, caCertChain } = await getCaCertChain({
      caCertId: ca.internalCa.activeCaCertId,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      projectDAL,
      kmsService
    });

    const certificateChainPem = `${issuingCaCertificate}\n${caCertChain}`.trim();

    const { cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
      plainText: Buffer.from(certificateChainPem)
    });

    const createSignedCert = async (transaction: Knex) => {
      const newCert = await certificateDAL.create(
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
          extendedKeyUsages: selectedExtendedKeyUsages,
          projectId: ca!.projectId,
          keyAlgorithm: keyAlgorithm || ca!.internalCa!.keyAlgorithm,
          signatureAlgorithm: signatureAlgorithm || ca!.internalCa!.keyAlgorithm
        },
        transaction
      );

      await certificateBodyDAL.create(
        {
          certId: newCert.id,
          encryptedCertificate,
          encryptedCertificateChain
        },
        transaction
      );

      if (collectionId) {
        await pkiCollectionItemDAL.create(
          {
            pkiCollectionId: collectionId,
            certId: newCert.id
          },
          transaction
        );
      }

      return newCert;
    };

    let cert;
    if (tx) {
      cert = await createSignedCert(tx);
    } else {
      cert = await certificateDAL.transaction(createSignedCert);
    }

    return {
      certificate: leafCert,
      certificateChain: certificateChainPem,
      issuingCaCertificate,
      serialNumber,
      certificateId: cert.id,
      ca: expandInternalCa(ca),
      commonName: cn
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
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca?.internalCa?.id) throw new NotFoundError({ message: `Internal CA with ID '${caId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    const certificateTemplates = await certificateTemplateDAL.find({ caId });

    return {
      certificateTemplates: certificateTemplates.filter((el) =>
        permission.can(
          ProjectPermissionPkiTemplateActions.Read,
          subject(ProjectPermissionSub.CertificateTemplates, { name: el.name })
        )
      ),
      ca: expandInternalCa(ca)
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
