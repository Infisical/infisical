import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas/models";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TSshCertificateAuthorityDALFactory } from "@app/ee/services/ssh/ssh-certificate-authority-dal";
import { TSshCertificateAuthoritySecretDALFactory } from "@app/ee/services/ssh/ssh-certificate-authority-secret-dal";
import { TSshCertificateBodyDALFactory } from "@app/ee/services/ssh-certificate/ssh-certificate-body-dal";
import { TSshCertificateDALFactory } from "@app/ee/services/ssh-certificate/ssh-certificate-dal";
import { TSshCertificateTemplateDALFactory } from "@app/ee/services/ssh-certificate-template/ssh-certificate-template-dal";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { SshCertTemplateStatus } from "../ssh-certificate-template/ssh-certificate-template-types";
import { createSshCaHelper, createSshCert, createSshKeyPair, getSshPublicKey } from "./ssh-certificate-authority-fns";
import {
  SshCaStatus,
  TCreateSshCaDTO,
  TDeleteSshCaDTO,
  TGetSshCaCertificateTemplatesDTO,
  TGetSshCaDTO,
  TGetSshCaPublicKeyDTO,
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
  sshCertificateTemplateDAL: Pick<TSshCertificateTemplateDALFactory, "find" | "getById">;
  sshCertificateDAL: Pick<TSshCertificateDALFactory, "create" | "transaction">;
  sshCertificateBodyDAL: Pick<TSshCertificateBodyDALFactory, "create">;
  kmsService: Pick<
    TKmsServiceFactory,
    "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey" | "getOrgKmsKeyId" | "createCipherPairWithDataKey"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TSshCertificateAuthorityServiceFactory = ReturnType<typeof sshCertificateAuthorityServiceFactory>;

export const sshCertificateAuthorityServiceFactory = ({
  sshCertificateAuthorityDAL,
  sshCertificateAuthoritySecretDAL,
  sshCertificateTemplateDAL,
  sshCertificateDAL,
  sshCertificateBodyDAL,
  kmsService,
  permissionService
}: TSshCertificateAuthorityServiceFactoryDep) => {
  /**
   * Generates a new SSH CA
   */
  const createSshCa = async ({
    projectId,
    friendlyName,
    keyAlgorithm: requestedKeyAlgorithm,
    publicKey: externalPk,
    privateKey: externalSk,
    keySource,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TCreateSshCaDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SshCertificateAuthorities
    );

    const newCa = await createSshCaHelper({
      projectId,
      friendlyName,
      keyAlgorithm: requestedKeyAlgorithm,
      keySource,
      externalPk,
      externalSk,
      sshCertificateAuthorityDAL,
      sshCertificateAuthoritySecretDAL,
      kmsService
    });

    return newCa;
  };

  /**
   * Return SSH CA with id [caId]
   */
  const getSshCaById = async ({ caId, actor, actorId, actorAuthMethod, actorOrgId }: TGetSshCaDTO) => {
    const ca = await sshCertificateAuthorityDAL.findById(caId);
    if (!ca) throw new NotFoundError({ message: `SSH CA with ID '${caId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.SshCertificateAuthorities
    );

    const sshCaSecret = await sshCertificateAuthoritySecretDAL.findOne({ sshCaId: ca.id });

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: ca.projectId
    });

    const decryptedCaPrivateKey = secretManagerDecryptor({
      cipherTextBlob: sshCaSecret.encryptedPrivateKey
    });

    const publicKey = await getSshPublicKey(decryptedCaPrivateKey.toString("utf-8"));

    return { ...ca, publicKey };
  };

  /**
   * Return public key of SSH CA with id [caId]
   */
  const getSshCaPublicKey = async ({ caId }: TGetSshCaPublicKeyDTO) => {
    const ca = await sshCertificateAuthorityDAL.findById(caId);
    if (!ca) throw new NotFoundError({ message: `SSH CA with ID '${caId}' not found` });

    const sshCaSecret = await sshCertificateAuthoritySecretDAL.findOne({ sshCaId: ca.id });

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: ca.projectId
    });

    const decryptedCaPrivateKey = secretManagerDecryptor({
      cipherTextBlob: sshCaSecret.encryptedPrivateKey
    });

    const publicKey = await getSshPublicKey(decryptedCaPrivateKey.toString("utf-8"));

    return publicKey;
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

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      ProjectPermissionSub.SshCertificateAuthorities
    );

    const updatedCa = await sshCertificateAuthorityDAL.updateById(caId, { friendlyName, status });

    const sshCaSecret = await sshCertificateAuthoritySecretDAL.findOne({ sshCaId: ca.id });

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: ca.projectId
    });

    const decryptedCaPrivateKey = secretManagerDecryptor({
      cipherTextBlob: sshCaSecret.encryptedPrivateKey
    });

    const publicKey = await getSshPublicKey(decryptedCaPrivateKey.toString("utf-8"));

    return { ...updatedCa, publicKey };
  };

  /**
   * Delete SSH CA with id [caId]
   */
  const deleteSshCaById = async ({ caId, actor, actorId, actorAuthMethod, actorOrgId }: TDeleteSshCaDTO) => {
    const ca = await sshCertificateAuthorityDAL.findById(caId);
    if (!ca) throw new NotFoundError({ message: `SSH CA with ID '${caId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.SshCertificateAuthorities
    );

    const deletedCa = await sshCertificateAuthorityDAL.deleteById(caId);

    return deletedCa;
  };

  /**
   * Return SSH certificate and corresponding new SSH public-private key pair where
   * SSH public key is signed using CA behind SSH certificate with name [templateName].
   */
  const issueSshCreds = async ({
    certificateTemplateId,
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
    const sshCertificateTemplate = await sshCertificateTemplateDAL.getById(certificateTemplateId);
    if (!sshCertificateTemplate) {
      throw new NotFoundError({
        message: "No SSH certificate template found with specified name"
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: sshCertificateTemplate.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SshCertificates
    );

    if (sshCertificateTemplate.caStatus === SshCaStatus.DISABLED) {
      throw new BadRequestError({
        message: "SSH CA is disabled"
      });
    }

    if (sshCertificateTemplate.status === SshCertTemplateStatus.DISABLED) {
      throw new BadRequestError({
        message: "SSH certificate template is disabled"
      });
    }

    // set [keyId] depending on if [allowCustomKeyIds] is true or false
    const keyId = sshCertificateTemplate.allowCustomKeyIds
      ? (requestedKeyId ?? `${actor}-${actorId}`)
      : `${actor}-${actorId}`;

    const sshCaSecret = await sshCertificateAuthoritySecretDAL.findOne({ sshCaId: sshCertificateTemplate.sshCaId });

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: sshCertificateTemplate.projectId
    });

    const decryptedCaPrivateKey = secretManagerDecryptor({
      cipherTextBlob: sshCaSecret.encryptedPrivateKey
    });

    // create user key pair
    const { publicKey, privateKey } = await createSshKeyPair(keyAlgorithm);

    const { serialNumber, signedPublicKey, ttl } = await createSshCert({
      template: sshCertificateTemplate,
      caPrivateKey: decryptedCaPrivateKey.toString("utf8"),
      clientPublicKey: publicKey,
      keyId,
      principals,
      requestedTtl,
      certType
    });

    const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: sshCertificateTemplate.projectId
    });

    const encryptedCertificate = secretManagerEncryptor({
      plainText: Buffer.from(signedPublicKey, "utf8")
    }).cipherTextBlob;

    await sshCertificateDAL.transaction(async (tx) => {
      const cert = await sshCertificateDAL.create(
        {
          sshCaId: sshCertificateTemplate.sshCaId,
          sshCertificateTemplateId: sshCertificateTemplate.id,
          serialNumber,
          certType,
          principals,
          keyId,
          notBefore: new Date(),
          notAfter: new Date(Date.now() + ttl * 1000)
        },
        tx
      );

      await sshCertificateBodyDAL.create(
        {
          sshCertId: cert.id,
          encryptedCertificate
        },
        tx
      );
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
    certificateTemplateId,
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
    const sshCertificateTemplate = await sshCertificateTemplateDAL.getById(certificateTemplateId);
    if (!sshCertificateTemplate) {
      throw new NotFoundError({
        message: "No SSH certificate template found with specified name"
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: sshCertificateTemplate.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.SshCertificates
    );

    if (sshCertificateTemplate.caStatus === SshCaStatus.DISABLED) {
      throw new BadRequestError({
        message: "SSH CA is disabled"
      });
    }

    if (sshCertificateTemplate.status === SshCertTemplateStatus.DISABLED) {
      throw new BadRequestError({
        message: "SSH certificate template is disabled"
      });
    }

    // set [keyId] depending on if [allowCustomKeyIds] is true or false
    const keyId = sshCertificateTemplate.allowCustomKeyIds
      ? (requestedKeyId ?? `${actor}-${actorId}`)
      : `${actor}-${actorId}`;

    const sshCaSecret = await sshCertificateAuthoritySecretDAL.findOne({ sshCaId: sshCertificateTemplate.sshCaId });

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: sshCertificateTemplate.projectId
    });

    const decryptedCaPrivateKey = secretManagerDecryptor({
      cipherTextBlob: sshCaSecret.encryptedPrivateKey
    });

    const { serialNumber, signedPublicKey, ttl } = await createSshCert({
      template: sshCertificateTemplate,
      caPrivateKey: decryptedCaPrivateKey.toString("utf8"),
      clientPublicKey: publicKey,
      keyId,
      principals,
      requestedTtl,
      certType
    });

    const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: sshCertificateTemplate.projectId
    });

    const encryptedCertificate = secretManagerEncryptor({
      plainText: Buffer.from(signedPublicKey, "utf8")
    }).cipherTextBlob;

    await sshCertificateDAL.transaction(async (tx) => {
      const cert = await sshCertificateDAL.create(
        {
          sshCaId: sshCertificateTemplate.sshCaId,
          sshCertificateTemplateId: sshCertificateTemplate.id,
          serialNumber,
          certType,
          principals,
          keyId,
          notBefore: new Date(),
          notAfter: new Date(Date.now() + ttl * 1000)
        },
        tx
      );

      await sshCertificateBodyDAL.create(
        {
          sshCertId: cert.id,
          encryptedCertificate
        },
        tx
      );
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

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: ca.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SSH
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      ProjectPermissionSub.SshCertificateTemplates
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
    getSshCaPublicKey,
    updateSshCaById,
    deleteSshCaById,
    getSshCaCertificateTemplates
  };
};
