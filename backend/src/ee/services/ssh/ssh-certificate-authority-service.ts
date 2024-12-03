import { ForbiddenError } from "@casl/ability";

import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { TSshCertificateAuthorityDALFactory } from "@app/ee/services/ssh/ssh-certificate-authority-dal";
import { TSshCertificateAuthoritySecretDALFactory } from "@app/ee/services/ssh/ssh-certificate-authority-secret-dal";
import { TSshCertificateTemplateDALFactory } from "@app/ee/services/ssh-certificate-template/ssh-certificate-template-dal";
import { NotFoundError } from "@app/lib/errors";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import {
  createSshCert,
  createSshKeyPair,
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
  sshCertificateTemplateDAL: Pick<TSshCertificateTemplateDALFactory, "find" | "findOne">;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug" | "findOne" | "updateById" | "findById" | "transaction">;
  kmsService: Pick<TKmsServiceFactory, "generateKmsKey" | "encryptWithKmsKey" | "decryptWithKmsKey" | "getOrgKmsKeyId">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export type TSshCertificateAuthorityServiceFactory = ReturnType<typeof sshCertificateAuthorityServiceFactory>;

export const sshCertificateAuthorityServiceFactory = ({
  sshCertificateAuthorityDAL,
  sshCertificateAuthoritySecretDAL,
  sshCertificateTemplateDAL,
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
          friendlyName: friendlyName || "",
          status: SshCaStatus.ACTIVE,
          keyAlgorithm
        },
        tx
      );

      const { privateKey } = createSshKeyPair(keyAlgorithm, ca.friendlyName);

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

      return ca;
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
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.SshCertificateAuthorities
    );

    return ca;
  };

  /**
   * Update SSH CA with id [caId]
   * Note: Used to enable/disable CA
   */
  const updateSshCaById = async ({ caId, status, actor, actorId, actorAuthMethod, actorOrgId }: TUpdateSshCaDTO) => {
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
      OrgPermissionActions.Edit,
      OrgPermissionSubjects.SshCertificateAuthorities
    );

    const updatedCa = await sshCertificateAuthorityDAL.updateById(caId, { status });

    return updatedCa;
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
      actorOrgId,
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
   * SSH public key is signed using CA behind SSH certificate with name [name].
   */
  const issueSshCreds = async ({
    name,
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
    // TODO: proper permission check
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Create,
      OrgPermissionSubjects.SshCertificateTemplates
    );

    // TODO: adjust to find within org
    const sshCertificateTemplate = await sshCertificateTemplateDAL.findOne({ name });

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
   * using CA behind SSH certificate template with name [name]
   */
  const signSshKey = async ({
    name,
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
    // TODO: proper permission check
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Create,
      OrgPermissionSubjects.SshCertificateTemplates
    );

    // TODO: adjust to find within org
    const sshCertificateTemplate = await sshCertificateTemplateDAL.findOne({ name });

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
