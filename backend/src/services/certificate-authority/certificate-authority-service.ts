/* eslint-disable no-bitwise */
import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import crypto, { KeyObject } from "crypto";
import ms from "ms";
import { z } from "zod";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateAuthorityCrlDALFactory } from "../../ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { CertKeyAlgorithm, CertStatus } from "../certificate/certificate-types";
import { TCertificateAuthorityCertDALFactory } from "./certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "./certificate-authority-dal";
import {
  createDistinguishedName,
  getCaCertChain,
  getCaCredentials,
  keyAlgorithmToAlgCfg
} from "./certificate-authority-fns";
import { TCertificateAuthorityQueueFactory } from "./certificate-authority-queue";
import { TCertificateAuthoritySecretDALFactory } from "./certificate-authority-secret-dal";
import {
  CaStatus,
  CaType,
  TCreateCaDTO,
  TDeleteCaDTO,
  TGetCaCertDTO,
  TGetCaCsrDTO,
  TGetCaDTO,
  TImportCertToCaDTO,
  TIssueCertFromCaDTO,
  TSignIntermediateDTO,
  TUpdateCaDTO
} from "./certificate-authority-types";
import { hostnameRegex } from "./certificate-authority-validators";

type TCertificateAuthorityServiceFactoryDep = {
  certificateAuthorityDAL: Pick<
    TCertificateAuthorityDALFactory,
    "transaction" | "create" | "findById" | "updateById" | "deleteById" | "findOne"
  >;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "create" | "findOne" | "transaction">;
  certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "create" | "findOne">;
  certificateAuthorityCrlDAL: Pick<TCertificateAuthorityCrlDALFactory, "create" | "findOne" | "update">;
  certificateAuthorityQueue: TCertificateAuthorityQueueFactory; // TODO: Pick
  certificateDAL: Pick<TCertificateDALFactory, "transaction" | "create" | "find">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
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
  certificateDAL,
  certificateBodyDAL,
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

        const { cipherTextBlob: encryptedCertificate } = kmsEncryptor({
          plainText: Buffer.from(new Uint8Array(cert.rawData))
        });

        const { cipherTextBlob: encryptedCertificateChain } = kmsEncryptor({
          plainText: Buffer.alloc(0)
        });

        await certificateAuthorityCertDAL.create(
          {
            caId: ca.id,
            encryptedCertificate,
            encryptedCertificateChain
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

      const { cipherTextBlob: encryptedCrl } = kmsEncryptor({
        plainText: Buffer.from(new Uint8Array(crl.rawData))
      });

      await certificateAuthorityCrlDAL.create(
        {
          caId: ca.id,
          encryptedCrl
        },
        tx
      );

      // https://nodejs.org/api/crypto.html#static-method-keyobjectfromkey
      const skObj = KeyObject.from(keys.privateKey);

      const { cipherTextBlob: encryptedPrivateKey } = kmsEncryptor({
        plainText: skObj.export({
          type: "pkcs8",
          format: "der"
        })
      });

      await certificateAuthoritySecretDAL.create(
        {
          caId: ca.id,
          encryptedPrivateKey
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

    const caCert = await certificateAuthorityCertDAL.findOne({ caId: ca.id });
    if (caCert) throw new BadRequestError({ message: "CA already has a certificate installed" });

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
   * Return certificate and certificate chain for CA
   */
  const getCaCert = async ({ caId, actorId, actorAuthMethod, actor, actorOrgId }: TGetCaCertDTO) => {
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

    const { caCert, caCertChain, serialNumber } = await getCaCertChain({
      caId,
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

    const alg = keyAlgorithmToAlgCfg(ca.keyAlgorithm as CertKeyAlgorithm);

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });
    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });

    const caCert = await certificateAuthorityCertDAL.findOne({ caId: ca.id });
    const decryptedCaCert = kmsDecryptor({
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
      caId,
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

    const caCert = await certificateAuthorityCertDAL.findOne({ caId: ca.id });
    if (caCert) throw new BadRequestError({ message: "CA has already imported a certificate" });

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

    const { cipherTextBlob: encryptedCertificate } = kmsEncryptor({
      plainText: Buffer.from(new Uint8Array(certObj.rawData))
    });

    const { cipherTextBlob: encryptedCertificateChain } = kmsEncryptor({
      plainText: Buffer.from(certificateChain)
    });

    await certificateAuthorityCertDAL.transaction(async (tx) => {
      await certificateAuthorityCertDAL.create(
        {
          caId: ca.id,
          encryptedCertificate,
          encryptedCertificateChain
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
          parentCaId: parentCa?.id
        },
        tx
      );
    });

    return { ca };
  };

  /**
   * Return new leaf certificate issued by CA with id [caId]
   */
  const issueCertFromCa = async ({
    caId,
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
    const ca = await certificateAuthorityDAL.findById(caId);
    if (!ca) throw new BadRequestError({ message: "CA not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      ca.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Certificates);

    if (ca.status === CaStatus.DISABLED) throw new BadRequestError({ message: "CA is disabled" });

    const caCert = await certificateAuthorityCertDAL.findOne({ caId: ca.id });
    if (!caCert) throw new BadRequestError({ message: "CA does not have a certificate installed" });

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });
    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });

    const decryptedCaCert = kmsDecryptor({
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

    if (altNames) {
      const altNamesArray: {
        type: "email" | "dns";
        value: string;
      }[] = altNames
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
    const { cipherTextBlob: encryptedCertificate } = kmsEncryptor({
      plainText: Buffer.from(new Uint8Array(leafCert.rawData))
    });

    await certificateDAL.transaction(async (tx) => {
      const cert = await certificateDAL.create(
        {
          caId: ca.id,
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

      return cert;
    });

    const { caCert: issuingCaCertificate, caCertChain } = await getCaCertChain({
      caId: ca.id,
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

  return {
    createCa,
    getCaById,
    updateCaById,
    deleteCaById,
    getCaCsr,
    getCaCert,
    signIntermediate,
    importCertToCa,
    issueCertFromCa
  };
};
