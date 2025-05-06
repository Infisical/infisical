import { ForbiddenError } from "@casl/ability";
import * as x509 from "@peculiar/x509";

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
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";
import { TCertificateAuthorityCertDALFactory } from "@app/services/certificate-authority/certificate-authority-cert-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { getCaCredentials, keyAlgorithmToAlgCfg } from "@app/services/certificate-authority/certificate-authority-fns";
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
  pkiSubscriberDAL: Pick<TPkiSubscriberDALFactory, "create" | "findById" | "updateById" | "deleteById">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById">;
  certificateAuthorityCertDAL: Pick<TCertificateAuthorityCertDALFactory, "findById">;
  certificateAuthorityCrlDAL: Pick<TCertificateAuthorityCrlDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "decryptWithKmsKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TPkiSubscriberServiceFactory = ReturnType<typeof pkiSubscriberServiceFactory>;

// TODO: bind subscribers to CA

export const pkiSubscriberServiceFactory = ({
  pkiSubscriberDAL,
  certificateAuthorityDAL,
  certificateAuthorityCertDAL,
  certificateAuthorityCrlDAL,
  projectDAL,
  kmsService,
  permissionService
}: TPkiSubscriberServiceFactoryDep) => {
  const createPkiSubscriber = async ({
    name,
    commonName,
    caId, // (dangtony98) consider by CA name instead (newly-introduced field)
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

    const newSubscriber = await pkiSubscriberDAL.create({
      caId,
      projectId,
      name,
      commonName,
      ttl,
      subjectAlternativeNames,
      keyUsages,
      extendedKeyUsages
    });

    return newSubscriber;
  };

  const getPkiSubscriberById = async ({
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

  const updatePkiSubscriber = async ({
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
      ProjectPermissionPkiSubscriberActions.Edit,
      ProjectPermissionSub.PkiSubscribers
    );

    const updatedSubscriber = await pkiSubscriberDAL.updateById(subscriberId, {
      caId,
      name,
      commonName,
      ttl,
      subjectAlternativeNames,
      keyUsages,
      extendedKeyUsages
    });

    return updatedSubscriber;
  };

  const deletePkiSubscriber = async ({
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

  const issuePkiSubscriberCert = async ({
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
  };

  const signPkiSubscriberCert = async ({
    subscriberId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TSignPkiSubscriberCertDTO) => {
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
  };

  return {
    createPkiSubscriber,
    getPkiSubscriberById,
    updatePkiSubscriber,
    deletePkiSubscriber,
    issuePkiSubscriberCert,
    signPkiSubscriberCert
  };
};
