import { ForbiddenError } from "@casl/ability";

import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { TSshCertificateAuthorityDALFactory } from "@app/ee/services/ssh/ssh-certificate-authority-dal";
import { TSshCertificateAuthoritySecretDALFactory } from "@app/ee/services/ssh/ssh-certificate-authority-secret-dal";
import { TSshCertificateDALFactory } from "@app/ee/services/ssh-certificate/ssh-certificate-dal";
import { TSshCertificateTemplateDALFactory } from "@app/ee/services/ssh-certificate-template/ssh-certificate-template-dal";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import {
  createSshCert,
  createSshKeyPair,
  getSshPublicKey,
  validateSshCertificatePrincipals,
  validateSshCertificateTtl,
  validateSshCertificateType
} from "./ssh-certificate-authority-fns";
import {
  SshCaStatus,
  TCreateSshCaDTO,
  TDeleteSshCaDTO,
  TGetSshCaCertificateTemplatesDTO,
  TGetSshCaDTO,
  TIssueSshCredsDTO,
  TSignSshKeyDTO,
  TUpdateSshCaDTO
} from "./ssh-certificate-authority-types";

type TSshCertificateAuthorityServiceFactoryDep = {
  sshCertificateAuthorityDAL: Pick<
    TSshCertificateAuthorityDALFactory,
    "transaction" | "create" | "findById" | "updateById" | "deleteById" | "findOne"
  >;
  sshCertificateAuthoritySecretDAL: Pick<TSshCertificateAuthoritySecretDALFactory, "create" | "findOne">;
  sshCertificateTemplateDAL: Pick<TSshCertificateTemplateDALFactory, "find" | "getByName">;
  sshCertificateDAL: Pick<TSshCertificateDALFactory, "create">;
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey" | "getOrgKmsKeyId">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export type TSshCertificateAuthorityServiceFactory = ReturnType<typeof sshCertificateAuthorityServiceFactory>;

export const sshCertificateAuthorityServiceFactory = ({
  sshCertificateAuthorityDAL,
  sshCertificateAuthoritySecretDAL,
  sshCertificateTemplateDAL,
  sshCertificateDAL,
  kmsService,
  permissionService
}: TSshCertificateAuthorityServiceFactoryDep) => {
  /**
   * Generates a new SSH CA
   */
  const createSshCa = async ({
    friendlyName,
    keyAlgorithm,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TCreateSshCaDTO) => {
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Create,
      OrgPermissionSubjects.SshCertificateAuthorities
    );

    const newCa = await sshCertificateAuthorityDAL.transaction(async (tx) => {
      const ca = await sshCertificateAuthorityDAL.create(
        {
          orgId: actorOrgId,
          friendlyName,
          status: SshCaStatus.ACTIVE,
          keyAlgorithm
        },
        tx
      );

      const { publicKey, privateKey } = createSshKeyPair(keyAlgorithm, ca.friendlyName);

      const orgKmsKeyId = await kmsService.getOrgKmsKeyId(actorOrgId);
      const kmsEncryptor = await kmsService.encryptWithKmsKey({
        kmsId: orgKmsKeyId
      });

      const { cipherTextBlob: encryptedPrivateKey } = await kmsEncryptor({
        plainText: Buffer.from(privateKey, "utf8")
      });

      await sshCertificateAuthoritySecretDAL.create(
        {
          sshCaId: ca.id,
          encryptedPrivateKey
        },
        tx
      );

      return { ...ca, publicKey };
    });

    return newCa;
  };

  /**
   * Return SSH CA with id [caId]
   */
  const getSshCaById = async ({ caId, actor, actorId, actorAuthMethod, actorOrgId }: TGetSshCaDTO) => {
    const ca = await sshCertificateAuthorityDAL.findById(caId);
    if (!ca) throw new NotFoundError({ message: `SSH CA with ID '${caId}' not found` });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      ca.orgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.SshCertificateAuthorities
    );

    const sshCaSecret = await sshCertificateAuthoritySecretDAL.findOne({ sshCaId: ca.id });

    // decrypt secret
    const orgKmsKeyId = await kmsService.getOrgKmsKeyId(actorOrgId);
    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: orgKmsKeyId
    });

    const decryptedCaPrivateKey = await kmsDecryptor({
      cipherTextBlob: sshCaSecret.encryptedPrivateKey
    });

    const publicKey = getSshPublicKey(decryptedCaPrivateKey.toString("utf-8"));

    return { ...ca, publicKey };
  };

  /**
   * Update SSH CA with id [caId]
   * Note: Used to enable/disable CA
   */
  const updateSshCaById = async ({
    caId,
    friendlyName,
    status,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateSshCaDTO) => {
    const ca = await sshCertificateAuthorityDAL.findById(caId);
    if (!ca) throw new NotFoundError({ message: `SSH CA with ID '${caId}' not found` });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      ca.orgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Edit,
      OrgPermissionSubjects.SshCertificateAuthorities
    );

    const updatedCa = await sshCertificateAuthorityDAL.updateById(caId, { friendlyName, status });

    const sshCaSecret = await sshCertificateAuthoritySecretDAL.findOne({ sshCaId: ca.id });

    // decrypt secret
    const orgKmsKeyId = await kmsService.getOrgKmsKeyId(actorOrgId);
    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: orgKmsKeyId
    });

    const decryptedCaPrivateKey = await kmsDecryptor({
      cipherTextBlob: sshCaSecret.encryptedPrivateKey
    });

    const publicKey = getSshPublicKey(decryptedCaPrivateKey.toString("utf-8"));

    return { ...updatedCa, publicKey };
  };

  /**
   * Delete SSH CA with id [caId]
   */
  const deleteSshCaById = async ({ caId, actor, actorId, actorAuthMethod, actorOrgId }: TDeleteSshCaDTO) => {
    const ca = await sshCertificateAuthorityDAL.findById(caId);
    if (!ca) throw new NotFoundError({ message: `SSH CA with ID '${caId}' not found` });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      ca.orgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Delete,
      OrgPermissionSubjects.SshCertificateAuthorities
    );

    const deletedCa = await sshCertificateAuthorityDAL.deleteById(caId);

    return deletedCa;
  };

  /**
   * Return SSH certificate and corresponding new SSH public-private key pair where
   * SSH public key is signed using CA behind SSH certificate with name [templateName].
   */
  const issueSshCreds = async ({
    templateName,
    keyAlgorithm,
    certType,
    principals,
    ttl: requestedTtl,
    keyId: requestedKeyId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TIssueSshCredsDTO) => {
    const sshCertificateTemplate = await sshCertificateTemplateDAL.getByName(templateName, actorOrgId);
    if (!sshCertificateTemplate) {
      throw new NotFoundError({
        message: "No SSH certificate template found with specified name"
      });
    }

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.SshCertificates);

    if (sshCertificateTemplate.caStatus === SshCaStatus.DISABLED) {
      throw new BadRequestError({
        message: "SSH CA is disabled"
      });
    }

    // validate if the requested [certType] is allowed under the template configuration
    validateSshCertificateType(sshCertificateTemplate, certType);

    // validate if the requested [principals] are valid for the given [certType] under the template configuration
    validateSshCertificatePrincipals(certType, sshCertificateTemplate, principals);

    // validate if the requested TTL is valid under the template configuration
    const ttl = validateSshCertificateTtl(sshCertificateTemplate, requestedTtl);

    // set [keyId] depending on if [allowCustomKeyIds] is true or false
    const keyId = sshCertificateTemplate.allowCustomKeyIds
      ? requestedKeyId ?? `${actor}-${actorId}`
      : `${actor}-${actorId}`;

    const sshCaSecret = await sshCertificateAuthoritySecretDAL.findOne({ sshCaId: sshCertificateTemplate.sshCaId });

    // decrypt secret
    const orgKmsKeyId = await kmsService.getOrgKmsKeyId(actorOrgId);
    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: orgKmsKeyId
    });

    const decryptedCaPrivateKey = await kmsDecryptor({
      cipherTextBlob: sshCaSecret.encryptedPrivateKey
    });

    // create user key pair
    const { publicKey, privateKey } = createSshKeyPair(keyAlgorithm, "Client Key");

    const { serialNumber, signedPublicKey } = createSshCert({
      caPrivateKey: decryptedCaPrivateKey.toString("utf8"),
      userPublicKey: publicKey,
      keyId,
      principals,
      ttl,
      certType
    });

    await sshCertificateDAL.create({
      sshCaId: sshCertificateTemplate.sshCaId,
      sshCertificateTemplateId: sshCertificateTemplate.id,
      serialNumber,
      certType,
      publicKey,
      principals,
      keyId,
      notBefore: new Date(),
      notAfter: new Date(Date.now() + ttl * 1000)
    });

    return {
      serialNumber,
      signedPublicKey,
      privateKey,
      publicKey,
      certificateTemplate: sshCertificateTemplate,
      ttl,
      keyId
    };
  };

  /**
   * Return SSH certificate by signing SSH public key [publicKey]
   * using CA behind SSH certificate template with name [templateName]
   */
  const signSshKey = async ({
    templateName,
    publicKey,
    certType,
    principals,
    ttl: requestedTtl,
    keyId: requestedKeyId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TSignSshKeyDTO) => {
    const sshCertificateTemplate = await sshCertificateTemplateDAL.getByName(templateName, actorOrgId);
    if (!sshCertificateTemplate) {
      throw new NotFoundError({
        message: "No SSH certificate template found with specified name"
      });
    }

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.SshCertificates);

    if (sshCertificateTemplate.caStatus === SshCaStatus.DISABLED) {
      throw new BadRequestError({
        message: "SSH CA is disabled"
      });
    }

    // validate if the requested [certType] is allowed under the template configuration
    validateSshCertificateType(sshCertificateTemplate, certType);

    // validate if the requested [principals] are valid for the given [certType] under the template configuration
    validateSshCertificatePrincipals(certType, sshCertificateTemplate, principals);

    // validate if the requested TTL is valid under the template configuration
    const ttl = validateSshCertificateTtl(sshCertificateTemplate, requestedTtl);

    // set [keyId] depending on if [allowCustomKeyIds] is true or false
    const keyId = sshCertificateTemplate.allowCustomKeyIds
      ? requestedKeyId ?? `${actor}-${actorId}`
      : `${actor}-${actorId}`;

    const sshCaSecret = await sshCertificateAuthoritySecretDAL.findOne({ sshCaId: sshCertificateTemplate.sshCaId });

    // decrypt secret
    const orgKmsKeyId = await kmsService.getOrgKmsKeyId(actorOrgId);
    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: orgKmsKeyId
    });

    const decryptedCaPrivateKey = await kmsDecryptor({
      cipherTextBlob: sshCaSecret.encryptedPrivateKey
    });

    const { serialNumber, signedPublicKey } = createSshCert({
      caPrivateKey: decryptedCaPrivateKey.toString("utf8"),
      userPublicKey: publicKey,
      keyId,
      principals,
      ttl,
      certType
    });

    await sshCertificateDAL.create({
      sshCaId: sshCertificateTemplate.sshCaId,
      sshCertificateTemplateId: sshCertificateTemplate.id,
      serialNumber,
      certType,
      publicKey,
      principals,
      keyId,
      notBefore: new Date(),
      notAfter: new Date(Date.now() + ttl * 1000)
    });

    return { serialNumber, signedPublicKey, certificateTemplate: sshCertificateTemplate, ttl, keyId };
  };

  const getSshCaCertificateTemplates = async ({
    caId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetSshCaCertificateTemplatesDTO) => {
    const ca = await sshCertificateAuthorityDAL.findById(caId);
    if (!ca) throw new NotFoundError({ message: `SSH CA with ID '${caId}' not found` });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.SshCertificateTemplates
    );

    const certificateTemplates = await sshCertificateTemplateDAL.find({ sshCaId: caId });

    return {
      certificateTemplates,
      ca
    };
  };

  return {
    issueSshCreds,
    signSshKey,
    createSshCa,
    getSshCaById,
    updateSshCaById,
    deleteSshCaById,
    getSshCaCertificateTemplates
  };
};
