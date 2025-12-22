/* eslint-disable no-await-in-loop */
/* eslint-disable no-bitwise */
import { ForbiddenError, subject } from "@casl/ability";
import * as x509 from "@peculiar/x509";

import { ActionProjectType } from "@app/db/schemas";
import { TCertificateAuthorityCrlDALFactory } from "@app/ee/services/certificate-authority-crl/certificate-authority-crl-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionPkiSubscriberActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import {
  CertExtendedKeyUsage,
  CertExtendedKeyUsageOIDToName,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertStatus
} from "@app/services/certificate/certificate-types";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { CaStatus, CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import {
  createSerialNumber,
  expandInternalCa,
  getCaCertChain,
  getCaCredentials,
  keyAlgorithmToAlgCfg,
  parseDistinguishedName
} from "@app/services/certificate-authority/certificate-authority-fns";
import { TCertificateAuthoritySecretDALFactory } from "@app/services/certificate-authority/certificate-authority-secret-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TPkiSubscriberDALFactory } from "@app/services/pki-subscriber/pki-subscriber-dal";
import { TPkiSyncDALFactory } from "@app/services/pki-sync/pki-sync-dal";
import { TPkiSyncQueueFactory } from "@app/services/pki-sync/pki-sync-queue";
import { triggerAutoSyncForSubscriber } from "@app/services/pki-sync/pki-sync-utils";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { getCertificateCredentials } from "../certificate/certificate-fns";
import { TCertificateSecretDALFactory } from "../certificate/certificate-secret-dal";
import { TCertificateAuthorityQueueFactory } from "../certificate-authority/certificate-authority-queue";
import { InternalCertificateAuthorityFns } from "../certificate-authority/internal/internal-certificate-authority-fns";
import {
  PkiSubscriberStatus,
  TCreatePkiSubscriberDTO,
  TDeletePkiSubscriberDTO,
  TGetPkiSubscriberDTO,
  TGetSubscriberActiveCertBundleDTO,
  TIssuePkiSubscriberCertDTO,
  TListPkiSubscriberCertsDTO,
  TOrderPkiSubscriberCertDTO,
  TSignPkiSubscriberCertDTO,
  TUpdatePkiSubscriberDTO
} from "./pki-subscriber-types";

type TPkiSubscriberServiceFactoryDep = {
  pkiSubscriberDAL: Pick<
    TPkiSubscriberDALFactory,
    "create" | "findById" | "updateById" | "deleteById" | "transaction" | "find" | "findOne"
  >;
  certificateAuthorityDAL: Pick<
    TCertificateAuthorityDALFactory,
    "findByIdWithAssociatedCa" | "findById" | "transaction" | "create" | "updateById" | "findWithAssociatedCa"
  >;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findById">;
  certificateAuthoritySecretDAL: Pick<TCertificateAuthoritySecretDALFactory, "findOne">;
  certificateAuthorityQueue: Pick<TCertificateAuthorityQueueFactory, "orderCertificateForSubscriber">;
  certificateAuthorityCrlDAL: Pick<TCertificateAuthorityCrlDALFactory, "findOne">;
  certificateDAL: Pick<
    TCertificateDALFactory,
    "create" | "transaction" | "countCertificatesForPkiSubscriber" | "findLatestActiveCertForSubscriber" | "find"
  >;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create" | "findOne">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create" | "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction" | "findById" | "find">;
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "decryptWithKmsKey" | "encryptWithKmsKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  internalCaFns: ReturnType<typeof InternalCertificateAuthorityFns>;
  pkiSyncDAL: Pick<TPkiSyncDALFactory, "find">;
  pkiSyncQueue: Pick<TPkiSyncQueueFactory, "queuePkiSyncSyncCertificatesById">;
};

export type TPkiSubscriberServiceFactory = ReturnType<typeof pkiSubscriberServiceFactory>;

export const pkiSubscriberServiceFactory = ({
  pkiSubscriberDAL,
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  certificateAuthoritySecretDAL,
  certificateAuthorityCrlDAL,
  certificateDAL,
  certificateSecretDAL,
  certificateBodyDAL,
  projectDAL,
  kmsService,
  permissionService,
  certificateAuthorityQueue,
  internalCaFns,
  pkiSyncDAL,
  pkiSyncQueue
}: TPkiSubscriberServiceFactoryDep) => {
  const createSubscriber = async ({
    name,
    commonName,
    status,
    caId,
    ttl,
    subjectAlternativeNames,
    keyUsages,
    extendedKeyUsages,
    enableAutoRenewal,
    autoRenewalPeriodInDays,
    properties,
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

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSubscriberActions.Create,
      subject(ProjectPermissionSub.PkiSubscribers, {
        name
      })
    );

    if (enableAutoRenewal) {
      if (!autoRenewalPeriodInDays) {
        throw new BadRequestError({ message: "autoRenewalPeriodInDays is required when enableAutoRenewal is true" });
      }
    }

    const ca = await certificateAuthorityDAL.findById(caId);
    if (!ca) {
      throw new NotFoundError({ message: `CA with ID '${caId}' not found` });
    }

    if (ca.projectId !== projectId) {
      throw new BadRequestError({ message: "CA does not belong to the project" });
    }

    const newSubscriber = await pkiSubscriberDAL.create({
      caId,
      projectId,
      name,
      commonName,
      status,
      ttl,
      subjectAlternativeNames,
      keyUsages,
      extendedKeyUsages,
      enableAutoRenewal,
      autoRenewalPeriodInDays,
      properties
    });

    return newSubscriber;
  };

  const getSubscriber = async ({
    subscriberName,
    projectId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TGetPkiSubscriberDTO) => {
    const subscriber = await pkiSubscriberDAL.findOne({
      name: subscriberName,
      projectId
    });

    if (!subscriber) throw new NotFoundError({ message: `PKI subscriber named '${subscriberName}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: subscriber.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSubscriberActions.Read,
      subject(ProjectPermissionSub.PkiSubscribers, {
        name: subscriber.name
      })
    );

    let supportsImmediateCertIssuance = false;
    if (subscriber.caId) {
      const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(subscriber.caId);
      if (ca.internalCa?.id) {
        supportsImmediateCertIssuance = true;
      }
    }

    return {
      ...subscriber,
      supportsImmediateCertIssuance
    };
  };

  const updateSubscriber = async ({
    subscriberName,
    projectId,
    name,
    commonName,
    status,
    caId,
    ttl,
    subjectAlternativeNames,
    keyUsages,
    extendedKeyUsages,
    enableAutoRenewal,
    autoRenewalPeriodInDays,
    properties,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdatePkiSubscriberDTO) => {
    const subscriber = await pkiSubscriberDAL.findOne({
      name: subscriberName,
      projectId
    });
    if (!subscriber) throw new NotFoundError({ message: `PKI subscriber named '${subscriberName}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: subscriber.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSubscriberActions.Edit,
      subject(ProjectPermissionSub.PkiSubscribers, {
        name: subscriber.name
      })
    );

    if (enableAutoRenewal) {
      if (!autoRenewalPeriodInDays && !subscriber.autoRenewalPeriodInDays) {
        throw new BadRequestError({ message: "autoRenewalPeriodInDays is required when enableAutoRenewal is true" });
      }
    }

    if (caId) {
      const ca = await certificateAuthorityDAL.findById(caId);
      if (!ca) {
        throw new NotFoundError({ message: `CA with ID '${caId}' not found` });
      }

      if (ca.projectId !== projectId) {
        throw new BadRequestError({ message: "CA does not belong to the project" });
      }
    }

    const updatedSubscriber = await pkiSubscriberDAL.updateById(subscriber.id, {
      caId,
      name,
      commonName,
      status,
      ttl,
      subjectAlternativeNames,
      keyUsages,
      extendedKeyUsages,
      enableAutoRenewal,
      autoRenewalPeriodInDays,
      properties
    });

    return updatedSubscriber;
  };

  const deleteSubscriber = async ({
    subscriberName,
    projectId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TDeletePkiSubscriberDTO) => {
    const subscriber = await pkiSubscriberDAL.findOne({
      name: subscriberName,
      projectId
    });
    if (!subscriber) throw new NotFoundError({ message: `PKI subscriber named '${subscriberName}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: subscriber.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSubscriberActions.Delete,
      subject(ProjectPermissionSub.PkiSubscribers, {
        name: subscriber.name
      })
    );

    await pkiSubscriberDAL.deleteById(subscriber.id);

    return subscriber;
  };

  const orderSubscriberCert = async ({
    subscriberName,
    projectId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TOrderPkiSubscriberCertDTO) => {
    const subscriber = await pkiSubscriberDAL.findOne({
      name: subscriberName,
      projectId
    });

    if (!subscriber) throw new NotFoundError({ message: `PKI subscriber named '${subscriberName}' not found` });
    if (!subscriber.caId) throw new BadRequestError({ message: "Subscriber does not have an assigned issuing CA" });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: subscriber.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSubscriberActions.IssueCert,
      subject(ProjectPermissionSub.PkiSubscribers, {
        name: subscriber.name
      })
    );

    if (subscriber.status !== PkiSubscriberStatus.ACTIVE)
      throw new BadRequestError({ message: "Subscriber is not active" });

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(subscriber.caId);
    if (ca.internalCa?.id) {
      throw new BadRequestError({ message: "CA does not support ordering of certificates" });
    }

    if (ca.status !== CaStatus.ACTIVE) {
      throw new BadRequestError({ message: "CA is disabled" });
    }

    if (ca.externalCa?.id && (ca.externalCa.type === CaType.ACME || ca.externalCa.type === CaType.AZURE_AD_CS)) {
      await certificateAuthorityQueue.orderCertificateForSubscriber({
        subscriberId: subscriber.id,
        caType: ca.externalCa.type
      });

      return subscriber;
    }

    throw new BadRequestError({ message: "Unsupported CA type" });
  };

  const issueSubscriberCert = async ({
    subscriberName,
    projectId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TIssuePkiSubscriberCertDTO) => {
    const subscriber = await pkiSubscriberDAL.findOne({
      name: subscriberName,
      projectId
    });

    if (!subscriber) throw new NotFoundError({ message: `PKI subscriber named '${subscriberName}' not found` });
    if (!subscriber.caId) throw new BadRequestError({ message: "Subscriber does not have an assigned issuing CA" });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: subscriber.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSubscriberActions.IssueCert,
      subject(ProjectPermissionSub.PkiSubscribers, {
        name: subscriber.name
      })
    );

    if (subscriber.status !== PkiSubscriberStatus.ACTIVE)
      throw new BadRequestError({ message: "Subscriber is not active" });

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(subscriber.caId);
    if (ca.internalCa?.id) {
      const result = await internalCaFns.issueCertificate(subscriber, ca);

      // Trigger auto sync for PKI syncs connected to this subscriber after certificate issuance
      await triggerAutoSyncForSubscriber(subscriber.id, { pkiSyncDAL, pkiSyncQueue });

      return result;
    }

    throw new BadRequestError({ message: "CA does not support immediate issuance of certificates" });
  };

  const signSubscriberCert = async ({
    subscriberName,
    projectId,
    csr,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TSignPkiSubscriberCertDTO) => {
    const appCfg = getConfig();
    const subscriber = await pkiSubscriberDAL.findOne({
      name: subscriberName,
      projectId
    });
    if (!subscriber) throw new NotFoundError({ message: `PKI subscriber named '${subscriberName}' not found` });
    if (!subscriber.caId) throw new BadRequestError({ message: "Subscriber does not have an assigned issuing CA" });

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(subscriber.caId);
    if (!ca?.internalCa) throw new NotFoundError({ message: `CA with ID '${subscriber.caId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSubscriberActions.IssueCert,
      subject(ProjectPermissionSub.PkiSubscribers, {
        name: subscriber.name
      })
    );

    if (subscriber.status !== PkiSubscriberStatus.ACTIVE)
      throw new BadRequestError({ message: "Subscriber is not active" });
    if (ca.status !== CaStatus.ACTIVE) throw new BadRequestError({ message: "CA is not active" });
    if (!ca.internalCa?.activeCaCertId)
      throw new BadRequestError({ message: "CA does not have a certificate installed" });

    const caCert = await certificateAuthorityCertDAL.findById(ca.internalCa.activeCaCertId);

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
    const notAfterDate = new Date(new Date().getTime() + ms(subscriber.ttl ?? "0"));
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

    const alg = keyAlgorithmToAlgCfg(ca.internalCa.keyAlgorithm as CertKeyAlgorithm);

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
    const distributionPointUrl = `${appCfg.SITE_URL}/api/v1/cert-manager/crl/${caCrl.id}/der`;
    const caIssuerUrl = `${appCfg.SITE_URL}/api/v1/cert-manager/ca/internal/${ca.id}/certificates/${caCert.id}/der`;

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

    await certificateDAL.transaction(async (tx) => {
      const cert = await certificateDAL.create(
        {
          caId: ca.id,
          caCertId: caCert.id,
          pkiSubscriberId: subscriber.id,
          status: CertStatus.ACTIVE,
          friendlyName: subscriber.commonName,
          commonName: subscriber.commonName,
          altNames: subscriber.subjectAlternativeNames.join(","),
          serialNumber,
          notBefore: notBeforeDate,
          notAfter: notAfterDate,
          keyUsages: selectedKeyUsages,
          extendedKeyUsages: selectedExtendedKeyUsages,
          projectId
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

    // Trigger auto sync for PKI syncs connected to this subscriber after certificate signing
    await triggerAutoSyncForSubscriber(subscriber.id, { pkiSyncDAL, pkiSyncQueue });

    return {
      certificate: leafCert.toString("pem"),
      certificateChain: `${issuingCaCertificate}\n${caCertChain}`.trim(),
      issuingCaCertificate,
      serialNumber,
      ca: expandInternalCa(ca),
      commonName: subscriber.commonName,
      subscriber
    };
  };

  const listSubscriberCerts = async ({
    subscriberName,
    projectId,
    offset,
    limit,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TListPkiSubscriberCertsDTO) => {
    const subscriber = await pkiSubscriberDAL.findOne({
      name: subscriberName,
      projectId
    });
    if (!subscriber) throw new NotFoundError({ message: `PKI subscriber named '${subscriberName}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: subscriber.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSubscriberActions.ListCerts,
      subject(ProjectPermissionSub.PkiSubscribers, {
        name: subscriber.name
      })
    );

    const certificates = await certificateDAL.find(
      {
        pkiSubscriberId: subscriber.id
      },
      { offset, limit, sort: [["updatedAt", "desc"]] }
    );

    const count = await certificateDAL.countCertificatesForPkiSubscriber(subscriber.id);

    return {
      certificates,
      totalCount: count
    };
  };

  const getSubscriberActiveCertBundle = async ({
    subscriberName,
    projectId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TGetSubscriberActiveCertBundleDTO) => {
    const subscriber = await pkiSubscriberDAL.findOne({
      name: subscriberName,
      projectId
    });

    if (!subscriber) {
      throw new NotFoundError({ message: `PKI subscriber named '${subscriberName}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: subscriber.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPkiSubscriberActions.ListCerts,
      subject(ProjectPermissionSub.PkiSubscribers, {
        name: subscriber.name
      })
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.Read,
      ProjectPermissionSub.Certificates
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCertificateActions.ReadPrivateKey,
      ProjectPermissionSub.Certificates
    );

    const cert = await certificateDAL.findLatestActiveCertForSubscriber({
      subscriberId: subscriber.id
    });

    if (!cert) {
      throw new NotFoundError({ message: "No active certificate found for subscriber" });
    }

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

    const { certPrivateKey } = await getCertificateCredentials({
      certId: cert.id,
      projectId: cert.projectId,
      certificateSecretDAL,
      projectDAL,
      kmsService
    });

    return {
      certificate,
      certificateChain,
      privateKey: certPrivateKey,
      serialNumber: cert.serialNumber,
      cert,
      subscriber
    };
  };

  return {
    createSubscriber,
    getSubscriber,
    updateSubscriber,
    deleteSubscriber,
    issueSubscriberCert,
    signSubscriberCert,
    listSubscriberCerts,
    orderSubscriberCert,
    getSubscriberActiveCertBundle
  };
};
