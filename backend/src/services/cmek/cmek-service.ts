import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas/models";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionCmekActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { SigningAlgorithm } from "@app/lib/crypto/sign";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import {
  TCmekDecryptDTO,
  TCmekEncryptDTO,
  TCmekGetPrivateKeyDTO,
  TCmekGetPublicKeyDTO,
  TCmekKeyEncryptionAlgorithm,
  TCmekListSigningAlgorithmsDTO,
  TCmekSignDTO,
  TCmekVerifyDTO,
  TCreateCmekDTO,
  TListCmeksByProjectIdDTO,
  TUpdabteCmekByIdDTO
} from "@app/services/cmek/cmek-types";
import { TKmsKeyDALFactory } from "@app/services/kms/kms-key-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { KmsKeyUsage } from "../kms/kms-types";

type TCmekServiceFactoryDep = {
  kmsService: TKmsServiceFactory;
  kmsDAL: TKmsKeyDALFactory;
  permissionService: TPermissionServiceFactory;
};

export type TCmekServiceFactory = ReturnType<typeof cmekServiceFactory>;

export const cmekServiceFactory = ({ kmsService, kmsDAL, permissionService }: TCmekServiceFactoryDep) => {
  const createCmek = async ({ projectId, ...dto }: TCreateCmekDTO, actor: OrgServiceActor) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Create, ProjectPermissionSub.Cmek);

    try {
      const cmek = await kmsService.generateKmsKey({
        ...dto,
        projectId,
        isReserved: false
      });

      return {
        ...cmek,
        version: 1,
        encryptionAlgorithm: dto.encryptionAlgorithm
      };
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `A KMS key with the name "${dto.name}" already exists for the project with ID "${projectId}"`
        });
      }

      throw err;
    }
  };

  const updateCmekById = async ({ keyId, ...data }: TUpdabteCmekByIdDTO, actor: OrgServiceActor) => {
    const key = await kmsDAL.findCmekById(keyId);

    if (!key) throw new NotFoundError({ message: `Key with ID ${keyId} not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Edit, ProjectPermissionSub.Cmek);

    try {
      const cmek = await kmsDAL.updateById(keyId, data);

      return {
        ...cmek,
        version: key.version,
        encryptionAlgorithm: key.encryptionAlgorithm
      };
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `A KMS key with the name "${data.name!}" already exists for the project with ID "${key.projectId}"`
        });
      }

      throw err;
    }
  };

  const deleteCmekById = async (keyId: string, actor: OrgServiceActor) => {
    const key = await kmsDAL.findCmekById(keyId);

    if (!key) throw new NotFoundError({ message: `Key with ID ${keyId} not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Delete, ProjectPermissionSub.Cmek);

    await kmsDAL.deleteById(keyId);

    return key;
  };

  const listCmeksByProjectId = async ({ projectId, ...filters }: TListCmeksByProjectIdDTO, actor: OrgServiceActor) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Read, ProjectPermissionSub.Cmek);

    const { keys: cmeks, totalCount } = await kmsDAL.listCmeksByProjectId({ projectId, ...filters });

    return { cmeks, totalCount };
  };

  const findCmekById = async (keyId: string, actor: OrgServiceActor) => {
    const key = await kmsDAL.findCmekById(keyId);

    if (!key) throw new NotFoundError({ message: `Key with ID "${keyId}" not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Read, ProjectPermissionSub.Cmek);

    return key;
  };

  const findCmekByName = async (keyName: string, projectId: string, actor: OrgServiceActor) => {
    const key = await kmsDAL.findCmekByName(keyName, projectId);

    if (!key)
      throw new NotFoundError({ message: `Key with name "${keyName}" not found for project with ID "${projectId}"` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Read, ProjectPermissionSub.Cmek);

    return key;
  };

  const cmekEncrypt = async ({ keyId, plaintext }: TCmekEncryptDTO, actor: OrgServiceActor) => {
    const key = await kmsDAL.findById(keyId);

    if (!key) throw new NotFoundError({ message: `Key with ID "${keyId}" not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    if (key.isDisabled) throw new BadRequestError({ message: "Key is disabled" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Encrypt, ProjectPermissionSub.Cmek);

    const encrypt = await kmsService.encryptWithKmsKey({ kmsId: keyId });

    const { cipherTextBlob } = await encrypt({ plainText: Buffer.from(plaintext, "base64") });

    return {
      ciphertext: cipherTextBlob.toString("base64"),
      projectId: key.projectId
    };
  };

  const listSigningAlgorithms = async ({ keyId }: TCmekListSigningAlgorithmsDTO, actor: OrgServiceActor) => {
    const key = await kmsDAL.findCmekById(keyId);

    if (!key) throw new NotFoundError({ message: `Key with ID "${keyId}" not found` });
    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });
    if (key.isDisabled) throw new BadRequestError({ message: "Key is disabled" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Read, ProjectPermissionSub.Cmek);

    if (key.keyUsage !== KmsKeyUsage.SIGN_VERIFY) {
      throw new BadRequestError({ message: `Key with ID '${keyId}' is not intended for signing` });
    }

    const encryptionAlgorithm = key.encryptionAlgorithm as TCmekKeyEncryptionAlgorithm;

    const algos = [
      {
        keyAlgorithm: "rsa",
        signingAlgorithms: Object.values(SigningAlgorithm).filter((algorithm) =>
          algorithm.toLowerCase().startsWith("rsa")
        )
      },
      {
        keyAlgorithm: "ecc",
        signingAlgorithms: Object.values(SigningAlgorithm).filter((algorithm) =>
          algorithm.toLowerCase().startsWith("ecdsa")
        )
      }
    ];

    const selectedAlgorithm = algos.find((algo) => encryptionAlgorithm.toLowerCase().startsWith(algo.keyAlgorithm));

    if (!selectedAlgorithm) {
      throw new BadRequestError({ message: `Unsupported encryption algorithm: ${encryptionAlgorithm}` });
    }

    return { signingAlgorithms: selectedAlgorithm.signingAlgorithms, projectId: key.projectId };
  };

  const getPublicKey = async ({ keyId }: TCmekGetPublicKeyDTO, actor: OrgServiceActor) => {
    const key = await kmsDAL.findCmekById(keyId);

    if (!key) throw new NotFoundError({ message: `Key with ID "${keyId}" not found` });
    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });
    if (key.isDisabled) throw new BadRequestError({ message: "Key is disabled" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Read, ProjectPermissionSub.Cmek);

    const publicKey = await kmsService.getPublicKey({ kmsId: keyId });
    return { publicKey: publicKey.toString("base64"), projectId: key.projectId, keyName: key.name };
  };

  const getPrivateKey = async ({ keyId }: TCmekGetPrivateKeyDTO, actor: OrgServiceActor) => {
    const key = await kmsDAL.findCmekById(keyId);

    if (!key) throw new NotFoundError({ message: `Key with ID "${keyId}" not found` });
    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });
    if (key.isDisabled) throw new BadRequestError({ message: "Key is disabled" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCmekActions.ExportPrivateKey,
      ProjectPermissionSub.Cmek
    );

    const keyMaterial = await kmsService.getKeyMaterial({ kmsId: keyId });

    return {
      privateKey: keyMaterial.toString("base64"),
      projectId: key.projectId,
      keyName: key.name
    };
  };

  const cmekSign = async ({ keyId, data, signingAlgorithm, isDigest }: TCmekSignDTO, actor: OrgServiceActor) => {
    const key = await kmsDAL.findCmekById(keyId);

    if (!key) throw new NotFoundError({ message: `Key with ID "${keyId}" not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    if (key.isDisabled) throw new BadRequestError({ message: "Key is disabled" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Sign, ProjectPermissionSub.Cmek);

    const sign = await kmsService.signWithKmsKey({ kmsId: keyId });

    const { signature, algorithm } = await sign({ data: Buffer.from(data, "base64"), signingAlgorithm, isDigest });

    return {
      signature: signature.toString("base64"),
      keyId: key.id,
      projectId: key.projectId,
      signingAlgorithm: algorithm
    };
  };

  const cmekVerify = async (
    { keyId, data, signature, signingAlgorithm, isDigest }: TCmekVerifyDTO,
    actor: OrgServiceActor
  ) => {
    const key = await kmsDAL.findCmekById(keyId);

    if (!key) throw new NotFoundError({ message: `Key with ID "${keyId}" not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    if (key.isDisabled) throw new BadRequestError({ message: "Key is disabled" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Verify, ProjectPermissionSub.Cmek);

    const verify = await kmsService.verifyWithKmsKey({ kmsId: keyId, signingAlgorithm });

    const { signatureValid, algorithm } = await verify({
      isDigest,
      data: Buffer.from(data, "base64"),
      signature: Buffer.from(signature, "base64")
    });

    return {
      signatureValid,
      keyId: key.id,
      projectId: key.projectId,
      signingAlgorithm: algorithm
    };
  };

  const cmekDecrypt = async ({ keyId, ciphertext }: TCmekDecryptDTO, actor: OrgServiceActor) => {
    const key = await kmsDAL.findById(keyId);

    if (!key) throw new NotFoundError({ message: `Key with ID "${keyId}" not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    if (key.isDisabled) throw new BadRequestError({ message: "Key is disabled" });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId: key.projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.KMS
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Decrypt, ProjectPermissionSub.Cmek);

    const decrypt = await kmsService.decryptWithKmsKey({ kmsId: keyId });

    const plaintextBlob = await decrypt({ cipherTextBlob: Buffer.from(ciphertext, "base64") });

    return {
      plaintext: plaintextBlob.toString("base64"),
      projectId: key.projectId
    };
  };

  return {
    createCmek,
    updateCmekById,
    deleteCmekById,
    listCmeksByProjectId,
    cmekEncrypt,
    cmekDecrypt,
    findCmekById,
    findCmekByName,
    cmekSign,
    cmekVerify,
    listSigningAlgorithms,
    getPublicKey,
    getPrivateKey
  };
};
