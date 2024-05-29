import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import crypto, { KeyObject } from "crypto";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";
import { TCertificateCertDALFactory } from "@app/services/certificate/certificate-cert-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TCertificateAuthorityCertDALFactory } from "./certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "./certificate-authority-dal";
import { createDistinguishedName } from "./certificate-authority-fns";
import { TCertificateAuthoritySkDALFactory } from "./certificate-authority-sk-dal";
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

type TCertificateAuthorityServiceFactoryDep = {
  // TODO: Pick
  certificateAuthorityDAL: TCertificateAuthorityDALFactory;
  certificateAuthorityCertDAL: TCertificateAuthorityCertDALFactory;
  certificateAuthoritySkDAL: TCertificateAuthoritySkDALFactory;
  certificateDAL: TCertificateDALFactory;
  certificateCertDAL: TCertificateCertDALFactory;
  certificateSecretDAL: TCertificateSecretDALFactory;
  projectDAL: TProjectDALFactory;
  permissionService: TPermissionServiceFactory;
};

export type TCertificateAuthorityServiceFactory = ReturnType<typeof certificateAuthorityServiceFactory>;

export const certificateAuthorityServiceFactory = ({
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  certificateAuthoritySkDAL,
  certificateDAL,
  certificateCertDAL,
  certificateSecretDAL,
  projectDAL,
  permissionService
}: TCertificateAuthorityServiceFactoryDep) => {
  /**
   * Generates a new root or intermediate CA
   */
  const createCa = async ({
    projectSlug,
    type,
    commonName,
    organization,
    ou,
    country,
    province,
    locality,
    notBefore,
    notAfter,
    maxPathLength,
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

    const alg = {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
      publicExponent: new Uint8Array([1, 0, 1]),
      modulusLength: 2048
    };
    const keys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);

    // https://nodejs.org/api/crypto.html#static-method-keyobjectfromkey
    const skObj = KeyObject.from(keys.privateKey);
    const sk = skObj.export({ format: "pem", type: "pkcs8" }) as string;
    const pkObj = KeyObject.from(keys.publicKey);
    const pk = pkObj.export({ format: "pem", type: "spki" }) as string;

    const newCa = await certificateAuthorityDAL.transaction(async (tx) => {
      const notBeforeDate = notBefore ? new Date(notBefore) : new Date();

      // if undefined, set [notAfterDate] to 10 years from now
      const notAfterDate = notAfter
        ? new Date(notAfter)
        : new Date(new Date().setFullYear(new Date().getFullYear() + 10));

      const ca = await certificateAuthorityDAL.create(
        {
          projectId: project.id,
          type,
          organization,
          ou,
          country,
          province,
          locality,
          commonName,
          status: type === CaType.ROOT ? CaStatus.ACTIVE : CaStatus.PENDING_CERTIFICATE,
          dn,
          ...(type === CaType.ROOT && { maxPathLength, notBefore: notBeforeDate, notAfter: notAfterDate })
        },
        tx
      );

      if (type === CaType.ROOT) {
        // note: self-signed cert only applicable for root CA

        const cert = await x509.X509CertificateGenerator.createSelfSigned({
          name: dn,
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
        const certificate = cert.toString("pem");
        await certificateAuthorityCertDAL.create(
          {
            caId: ca.id,
            certificate, // TODO: encrypt
            certificateChain: "" // TODO: encrypt
          },
          tx
        );
      }

      await certificateAuthoritySkDAL.create(
        {
          caId: ca.id,
          pk, // TODO: encrypt
          sk // TODO: encrypt
        },
        tx
      );

      return ca;
    });

    return newCa;
  };

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
   * Generates a CSR for a CA
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

    const caKeys = await certificateAuthoritySkDAL.findOne({ caId: ca.id });

    const alg = {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
      publicExponent: new Uint8Array([1, 0, 1]),
      modulusLength: 2048
    };

    const skObj = crypto.createPrivateKey({ key: caKeys.sk, format: "pem", type: "pkcs8" });
    const pkObj = crypto.createPublicKey({ key: caKeys.pk, format: "pem", type: "spki" });

    const sk = await crypto.subtle.importKey("pkcs8", skObj.export({ format: "der", type: "pkcs8" }), alg, true, [
      "sign"
    ]);
    const pk = await crypto.subtle.importKey("spki", pkObj.export({ format: "der", type: "spki" }), alg, true, [
      "verify"
    ]);

    const csrObj = await x509.Pkcs10CertificateRequestGenerator.create({
      name: ca.dn,
      keys: { privateKey: sk, publicKey: pk },
      signingAlgorithm: alg,
      extensions: [
        // eslint-disable-next-line no-bitwise
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment)
      ],
      attributes: [new x509.ChallengePasswordAttribute("password")]
    });

    return csrObj.toString("pem");
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

    const caCert = await certificateAuthorityCertDAL.findOne({ caId: ca.id });
    const certObj = new x509.X509Certificate(caCert.certificate);

    return {
      certificate: caCert.certificate,
      certificateChain: caCert.certificateChain,
      serialNumber: certObj.serialNumber
    };
  };

  /**
   * Issue certificate to be imported back in for intermediate CA
   * TODO: cannot chain to self
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

    const alg = {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
      publicExponent: new Uint8Array([1, 0, 1]),
      modulusLength: 2048
    };

    const caCert = await certificateAuthorityCertDAL.findOne({ caId: ca.id });
    const caKeys = await certificateAuthoritySkDAL.findOne({ caId: ca.id });

    const skObj = crypto.createPrivateKey({ key: caKeys.sk, format: "pem", type: "pkcs8" });
    const sk = await crypto.subtle.importKey("pkcs8", skObj.export({ format: "der", type: "pkcs8" }), alg, true, [
      "sign"
    ]);

    const certObj = new x509.X509Certificate(caCert.certificate);
    const csrObj = new x509.Pkcs10CertificateRequest(csr);

    // check path length constraint
    const caPathLength = certObj.getExtension(x509.BasicConstraintsExtension)?.pathLength;
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

    const caCertNotBeforeDate = new Date(certObj.notBefore);
    const caCertNotAfterDate = new Date(certObj.notAfter);

    // check not before constraint
    if (notBeforeDate < caCertNotBeforeDate) {
      throw new BadRequestError({ message: "notBefore date is before CA certificate's notBefore date" });
    }

    if (notBeforeDate > notAfterDate) throw new BadRequestError({ message: "notBefore date is after notAfter date" });

    // check not after constraint
    if (notAfterDate > caCertNotAfterDate) {
      throw new BadRequestError({ message: "notAfter date is after CA certificate's notAfter date" });
    }

    const intermediateCert = await x509.X509CertificateGenerator.create({
      // serialNumber: "03",
      subject: csrObj.subject,
      issuer: certObj.subject,
      notBefore: notBeforeDate,
      notAfter: notAfterDate,
      signingKey: sk,
      publicKey: csrObj.publicKey,
      signingAlgorithm: alg,
      extensions: [
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.dataEncipherment, true),
        new x509.BasicConstraintsExtension(true, maxPathLength === -1 ? undefined : maxPathLength, true),
        await x509.AuthorityKeyIdentifierExtension.create(certObj, false),
        await x509.SubjectKeyIdentifierExtension.create(csrObj.publicKey)
      ]
    });

    const chain = await certificateAuthorityDAL.buildCertificateChain(caId);

    return {
      certificate: intermediateCert.toString("pem"),
      issuingCaCertificate: caCert.certificate,
      certificateChain: chain.join("\n"),
      serialNumber: intermediateCert.serialNumber
    };
  };

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

    await certificateAuthorityCertDAL.transaction(async (tx) => {
      await certificateAuthorityCertDAL.create(
        {
          caId: ca.id,
          certificate, // TODO: encrypt
          certificateChain // TODO: encrypt
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
          parentCaId: parentCa?.id
        },
        tx
      );
    });
  };

  const issueCertFromCa = async ({
    caId,
    commonName,
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

    const caCert = await certificateAuthorityCertDAL.findOne({ caId: ca.id });
    if (!caCert) throw new BadRequestError({ message: "CA does not have a certificate installed" });

    if (ca.status === CaStatus.DISABLED) throw new BadRequestError({ message: "CA is disabled" });

    const caCertObj = new x509.X509Certificate(caCert.certificate);

    const alg = {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
      publicExponent: new Uint8Array([1, 0, 1]),
      modulusLength: 2048
    };

    const caKeys = await certificateAuthoritySkDAL.findOne({ caId: ca.id });

    const caSkObj = crypto.createPrivateKey({ key: caKeys.sk, format: "pem", type: "pkcs8" });
    const caSk = await crypto.subtle.importKey("pkcs8", caSkObj.export({ format: "der", type: "pkcs8" }), alg, true, [
      "sign"
    ]);

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

    const notBeforeDate = notBefore ? new Date(notBefore) : new Date();

    let notAfterDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1));
    if (notAfter) {
      notAfterDate = new Date(notAfter);
    } else if (ttl) {
      // ttl in seconds
      notAfterDate = new Date(new Date().getTime() + ttl * 1000);
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

    const leafCert = await x509.X509CertificateGenerator.create({
      // serialNumber: "03",
      subject: csrObj.subject,
      issuer: caCertObj.subject,
      notBefore: notBeforeDate,
      notAfter: notAfterDate,
      signingKey: caSk,
      publicKey: csrObj.publicKey,
      signingAlgorithm: alg,
      extensions: [
        new x509.KeyUsagesExtension(x509.KeyUsageFlags.dataEncipherment, true),
        new x509.BasicConstraintsExtension(false),
        await x509.AuthorityKeyIdentifierExtension.create(caCertObj, false),
        await x509.SubjectKeyIdentifierExtension.create(csrObj.publicKey)
      ]
    });

    const skLeafObj = KeyObject.from(leafKeys.privateKey);
    const skLeaf = skLeafObj.export({ format: "pem", type: "pkcs8" }) as string;

    const chain = await certificateAuthorityDAL.buildCertificateChain(caId);

    // https://nodejs.org/api/crypto.html#static-method-keyobjectfromkey
    const skObj = KeyObject.from(leafKeys.privateKey);
    const sk = skObj.export({ format: "pem", type: "pkcs8" }) as string;
    const pkObj = KeyObject.from(leafKeys.publicKey);
    const pk = pkObj.export({ format: "pem", type: "spki" }) as string;

    await certificateDAL.transaction(async (tx) => {
      const cert = await certificateDAL.create(
        {
          caId: ca.id,
          commonName,
          notBefore: notBeforeDate,
          notAfter: notAfterDate
        },
        tx
      );

      await certificateCertDAL.create(
        {
          certId: cert.id,
          certificate: leafCert.toString("pem"), // TODO: encrypt
          certificateChain: chain.join("\n") // TODO: encrypt
        },
        tx
      );

      await certificateSecretDAL.create(
        {
          certId: cert.id,
          pk, // TODO: encrypt
          sk // TODO: encrypt
        },
        tx
      );

      return cert;
    });

    return {
      certificate: leafCert.toString("pem"),
      certificateChain: chain.join("\n"),
      issuingCaCertificate: caCert.certificate,
      privateKey: skLeaf,
      serialNumber: leafCert.serialNumber
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
