/* eslint-disable no-bitwise */
import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import crypto, { KeyObject } from "crypto";

import { ActionProjectType } from "@app/db/schemas";
import { TCertificateAuthorityCrlDALFactory } from "@app/ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionPkiSubscriberActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import {
  CertExtendedKeyUsage,
  CertExtendedKeyUsageOIDToName,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertStatus
} from "@app/services/certificate/certificate-types";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import {
  createSerialNumber,
  getCaCertChain,
  getCaCredentials,
  keyAlgorithmToAlgCfg,
  parseDistinguishedName
} from "@app/services/certificate-authority/certificate-authority-fns";
import { TCertificateAuthoritySecretDALFactory } from "@app/services/certificate-authority/certificate-authority-secret-dal";
import { CaStatus } from "@app/services/certificate-authority/certificate-authority-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TPkiSubscriberDALFactory } from "@app/services/pki-subscriber/pki-subscriber-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import {
  TCreatePkiSubscriberDTO,
  TDeletePkiSubscriberDTO,
  TGetPkiSubscriberByIdDTO,
  TIssuePkiSubscriberCertDTO,
  TSignPkiSubscriberCertDTO,
  TUpdatePkiSubscriberDTO
} from "./pki-subscriber-types";

type TPkiSubscriberServiceFactoryDep = {
  pkiSubscriberDAL: Pick<
    TPkiSubscriberDALFactory,
    "create" | "findById" | "updateById" | "deleteById" | "transaction" | "find"
  >;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findById">;
  certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "findOne">;
  certificateAuthorityCrlDAL: Pick<TCertificateAuthorityCrlDALFactory, "findOne">;
  certificateDAL: Pick<TCertificateDALFactory, "create" | "transaction">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction" | "findById" | "find">;
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "decryptWithKmsKey" | "encryptWithKmsKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TPkiSubscriberServiceFactory = ReturnType<typeof pkiSubscriberServiceFactory>;

export const pkiSubscriberServiceFactory = ({
  pkiSubscriberDAL,
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  certificateAuthoritySecretDAL,
  certificateAuthorityCrlDAL,
  certificateDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  projectDAL,
  kmsService,
  permissionService
}: TPkiSubscriberServiceFactoryDep) => {
  const createSubscriber = async ({
    name,
    commonName,
    caId,
    ttl,
    subjectAlternativeNames,
    keyUsages,
    extendedKeyUsages,
    projectId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TCreatePkiSubscriberDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    // (dangtony98): TODO: make permission more granular
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSubscriberActions.Read,
      ProjectPermissionSub.PkiSubscribers
    );

    const newSubscriber = await pkiSubscriberDAL.transaction(async (tx) => {
      // (dangtony98): room to optimize check to ensure that
      // the PKI subscriber name is unique across the whole org
      const project = await projectDAL.findById(projectId, tx);
      if (!project) throw new NotFoundError({ message: `Project with ID '${projectId}' not found` });
      const projects = await projectDAL.find(
        {
          orgId: project.orgId
        },
        { tx }
      );

      const existingPkiSubscriber = await pkiSubscriberDAL.find(
        {
          name,
          $in: {
            projectId: projects.map((p) => p.id)
          }
        },
        { tx }
      );

      if (existingPkiSubscriber.length) {
        throw new BadRequestError({
          message: `PKI subscriber with name '${name}' already exists in the organization`
        });
      }

      const subscriber = await pkiSubscriberDAL.create(
        {
          caId,
          projectId,
          name,
          commonName,
          ttl,
          subjectAlternativeNames,
          keyUsages,
          extendedKeyUsages
        },
        tx
      );

      return subscriber;
    });

    return newSubscriber;
  };

  const getSubscriberById = async ({
    subscriberId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TGetPkiSubscriberByIdDTO) => {
    const subscriber = await pkiSubscriberDAL.findById(subscriberId);
    if (!subscriber) throw new NotFoundError({ message: `PKI subscriber with ID '${subscriberId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: subscriber.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    // (dangtony98): TODO: make permission more granular
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSubscriberActions.Read,
      ProjectPermissionSub.PkiSubscribers
    );

    return subscriber;
  };

  const updateSubscriber = async ({
    subscriberId,
    name,
    commonName,
    caId,
    ttl,
    subjectAlternativeNames,
    keyUsages,
    extendedKeyUsages,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdatePkiSubscriberDTO) => {
    const foundSubscriber = await pkiSubscriberDAL.findById(subscriberId);
    if (!foundSubscriber) throw new NotFoundError({ message: `PKI subscriber with ID '${subscriberId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: foundSubscriber.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    // (dangtony98): TODO: make permission more granular
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSubscriberActions.Edit,
      ProjectPermissionSub.PkiSubscribers
    );

    const updatedSubscriber = await pkiSubscriberDAL.transaction(async (tx) => {
      if (name) {
        // (dangtony98): room to optimize check to ensure that
        // the PKI subscriber name is unique across the whole org
        const project = await projectDAL.findById(foundSubscriber.projectId, tx);
        if (!project) throw new NotFoundError({ message: `Project with ID '${foundSubscriber.projectId}' not found` });
        const projects = await projectDAL.find(
          {
            orgId: project.orgId
          },
          { tx }
        );

        const existingPkiSubscriber = await pkiSubscriberDAL.find(
          {
            name,
            $in: {
              projectId: projects.map((p) => p.id)
            }
          },
          { tx }
        );

        if (existingPkiSubscriber.length) {
          throw new BadRequestError({
            message: `PKI subscriber with name '${name}' already exists in the organization`
          });
        }
      }

      const subscriber = await pkiSubscriberDAL.updateById(
        subscriberId,
        {
          caId,
          name,
          commonName,
          ttl,
          subjectAlternativeNames,
          keyUsages,
          extendedKeyUsages
        },
        tx
      );

      return subscriber;
    });

    return updatedSubscriber;
  };

  const deleteSubscriber = async ({
    subscriberId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TDeletePkiSubscriberDTO) => {
    const subscriber = await pkiSubscriberDAL.findById(subscriberId);
    if (!subscriber) throw new NotFoundError({ message: `PKI subscriber with ID '${subscriberId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: subscriber.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    // (dangtony98): TODO: make permission more granular
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSubscriberActions.Delete,
      ProjectPermissionSub.PkiSubscribers
    );

    await pkiSubscriberDAL.deleteById(subscriberId);

    return subscriber;
  };

  const issueSubscriberCert = async ({
    subscriberId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TIssuePkiSubscriberCertDTO) => {
    const subscriber = await pkiSubscriberDAL.findById(subscriberId);
    if (!subscriber) throw new NotFoundError({ message: `PKI subscriber with ID '${subscriberId}' not found` });
    const ca = await certificateAuthorityDAL.findById(subscriber.caId);
    if (!ca) throw new NotFoundError({ message: `CA with ID '${subscriber.caId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    // (dangtony98): TODO: make permission more granular
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSubscriberActions.IssueCert,
      ProjectPermissionSub.PkiSubscribers
    );

    if (ca.status === CaStatus.DISABLED) throw new BadRequestError({ message: "CA is disabled" });
    if (!ca.activeCaCertId) throw new BadRequestError({ message: "CA does not have a certificate installed" });
    if (ca.requireTemplateForIssuance) {
      throw new BadRequestError({ message: "Certificate template is required for issuance" });
    }
    const caCert = await certificateAuthorityCertDAL.findById(ca.activeCaCertId);

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
    const notBeforeDate = new Date();
    const notAfterDate = new Date(new Date().getTime() + ms(subscriber.ttl));
    const caCertNotBeforeDate = new Date(caCertObj.notBefore);
    const caCertNotAfterDate = new Date(caCertObj.notAfter);

    // check not before constraint
    if (notBeforeDate < caCertNotBeforeDate) {
      throw new BadRequestError({ message: "notBefore date is before CA certificate's notBefore date" });
    }

    // check not after constraint
    if (notAfterDate > caCertNotAfterDate) {
      throw new BadRequestError({ message: "notAfter date is after CA certificate's notAfter date" });
    }

    const alg = keyAlgorithmToAlgCfg(ca.keyAlgorithm as CertKeyAlgorithm);
    const leafKeys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);

    const csrObj = await x509.Pkcs10CertificateRequestGenerator.create({
      name: `CN=${subscriber.commonName}`,
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

    const selectedKeyUsages = subscriber.keyUsages as CertKeyUsage[];
    const keyUsagesBitValue = selectedKeyUsages.reduce((accum, keyUsage) => accum | x509.KeyUsageFlags[keyUsage], 0);
    if (keyUsagesBitValue) {
      extensions.push(new x509.KeyUsagesExtension(keyUsagesBitValue, true));
    }

    const selectedExtendedKeyUsages = subscriber.extendedKeyUsages as CertExtendedKeyUsage[];

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

    await certificateDAL.transaction(async (tx) => {
      const cert = await certificateDAL.create(
        {
          caId: ca.id,
          caCertId: caCert.id,
          status: CertStatus.ACTIVE,
          friendlyName: subscriber.commonName,
          commonName: subscriber.commonName,
          altNames: subscriber.subjectAlternativeNames.join(","),
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
          encryptedCertificate,
          encryptedCertificateChain
        },
        tx
      );

      await certificateSecretDAL.create(
        {
          certId: cert.id,
          encryptedPrivateKey
        },
        tx
      );
    });

    return {
      certificate: leafCert.toString("pem"),
      certificateChain: certificateChainPem,
      issuingCaCertificate,
      privateKey: skLeaf,
      serialNumber,
      ca,
      subscriber
    };
  };

  const signSubscriberCert = async ({
    subscriberId,
    csr,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TSignPkiSubscriberCertDTO) => {
    const appCfg = getConfig();
    const subscriber = await pkiSubscriberDAL.findById(subscriberId);
    if (!subscriber) throw new NotFoundError({ message: `PKI subscriber with ID '${subscriberId}' not found` });
    const ca = await certificateAuthorityDAL.findById(subscriber.caId);
    if (!ca) throw new NotFoundError({ message: `CA with ID '${subscriber.caId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    // (dangtony98): TODO: make permission more granular
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSubscriberActions.SignCert,
      ProjectPermissionSub.PkiSubscribers
    );

    if (ca.status === CaStatus.DISABLED) throw new BadRequestError({ message: "CA is disabled" });
    if (!ca.activeCaCertId) throw new BadRequestError({ message: "CA does not have a certificate installed" });
    if (ca.requireTemplateForIssuance) {
      throw new BadRequestError({ message: "Certificate template is required for issuance" });
    }
    const caCert = await certificateAuthorityCertDAL.findById(ca.activeCaCertId);

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
    const notBeforeDate = new Date();
    const notAfterDate = new Date(new Date().getTime() + ms(subscriber.ttl));
    const caCertNotBeforeDate = new Date(caCertObj.notBefore);
    const caCertNotAfterDate = new Date(caCertObj.notAfter);

    // check not before constraint
    if (notBeforeDate < caCertNotBeforeDate) {
      throw new BadRequestError({ message: "notBefore date is before CA certificate's notBefore date" });
    }

    // check not after constraint
    if (notAfterDate > caCertNotAfterDate) {
      throw new BadRequestError({ message: "notAfter date is after CA certificate's notAfter date" });
    }

    const alg = keyAlgorithmToAlgCfg(ca.keyAlgorithm as CertKeyAlgorithm);

    const csrObj = new x509.Pkcs10CertificateRequest(csr);

    const dn = parseDistinguishedName(csrObj.subject);
    const cn = dn.commonName;
    if (cn !== subscriber.commonName) {
      throw new BadRequestError({ message: "Common name (CN) in the CSR does not match the subscriber's common name" });
    }

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

    const selectedKeyUsages = subscriber.keyUsages as CertKeyUsage[];

    if (csrKeyUsages.some((keyUsage) => !selectedKeyUsages.includes(keyUsage))) {
      throw new BadRequestError({
        message: "Invalid key usage value based on subscriber's specified key usages"
      });
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

    const selectedExtendedKeyUsages = subscriber.extendedKeyUsages as CertExtendedKeyUsage[];
    if (csrExtendedKeyUsages.some((eku) => !selectedExtendedKeyUsages.includes(eku))) {
      throw new BadRequestError({
        message: "Invalid extended key usage value based on subscriber's specified extended key usages"
      });
    }

    if (selectedExtendedKeyUsages.length) {
      extensions.push(
        new x509.ExtendedKeyUsageExtension(
          selectedExtendedKeyUsages.map((eku) => x509.ExtendedKeyUsage[eku]),
          true
        )
      );
    }

    // attempt to read from CSR if altNames is not explicitly provided
    let altNamesArray: {
      type: "email" | "dns";
      value: string;
    }[] = [];

    const sanExtension = csrObj.extensions.find((ext) => ext.type === "2.5.29.17");
    if (sanExtension) {
      const sanNames = new x509.GeneralNames(sanExtension.value);

      altNamesArray = sanNames.items
        .filter((value) => value.type === "email" || value.type === "dns")
        .map((name) => ({
          type: name.type as "email" | "dns",
          value: name.value
        }));
    }

    if (
      altNamesArray
        .map((altName) => altName.value)
        .some((altName) => !subscriber.subjectAlternativeNames.includes(altName))
    ) {
      throw new BadRequestError({
        message: "Invalid subject alternative name based on subscriber's specified subject alternative names"
      });
    }

    if (altNamesArray.length) {
      const altNamesExtension = new x509.SubjectAlternativeNameExtension(altNamesArray, false);
      extensions.push(altNamesExtension);
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
      caCertId: ca.activeCaCertId,
      certificateAuthorityDAL,
      certificateAuthorityCertDAL,
      projectDAL,
      kmsService
    });

    const certificateChainPem = `${issuingCaCertificate}\n${caCertChain}`.trim();

    const { cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
      plainText: Buffer.from(certificateChainPem)
    });

    await certificateDAL.transaction(async (tx) => {
      const cert = await certificateDAL.create(
        {
          caId: ca.id,
          caCertId: caCert.id,
          status: CertStatus.ACTIVE,
          friendlyName: subscriber.commonName,
          commonName: subscriber.commonName,
          altNames: subscriber.subjectAlternativeNames.join(","),
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
          encryptedCertificate,
          encryptedCertificateChain
        },
        tx
      );

      return cert;
    });

    return {
      certificate: leafCert,
      certificateChain: `${issuingCaCertificate}\n${caCertChain}`.trim(),
      issuingCaCertificate,
      serialNumber,
      ca,
      commonName: subscriber.commonName,
      subscriber
    };
  };

  return {
    createSubscriber,
    getSubscriberById,
    updateSubscriber,
    deleteSubscriber,
    issueSubscriberCert,
    signSubscriberCert
  };
};
