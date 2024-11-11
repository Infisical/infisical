import { ForbiddenError } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionCmekActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import {
  TCmekDecryptDTO,
  TCmekEncryptDTO,
  TCreateCmekDTO,
  TListCmeksByProjectIdDTO,
  TUpdabteCmekByIdDTO
} from "@app/services/cmek/cmek-types";
import { TKmsKeyDALFactory } from "@app/services/kms/kms-key-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

type TCmekServiceFactoryDep = {
  kmsService: TKmsServiceFactory;
  kmsDAL: TKmsKeyDALFactory;
  permissionService: TPermissionServiceFactory;
};

export type TCmekServiceFactory = ReturnType<typeof cmekServiceFactory>;

export const cmekServiceFactory = ({ kmsService, kmsDAL, permissionService }: TCmekServiceFactoryDep) => {
  const createCmek = async ({ projectId, ...dto }: TCreateCmekDTO, actor: OrgServiceActor) => {
    const { permission } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      projectId,
      actor.authMethod,
      actor.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Create, ProjectPermissionSub.Cmek);

    const cmek = await kmsService.generateKmsKey({
      ...dto,
      projectId,
      isReserved: false
    });

    return cmek;
  };

  const updateCmekById = async ({ keyId, ...data }: TUpdabteCmekByIdDTO, actor: OrgServiceActor) => {
    const key = await kmsDAL.findById(keyId);

    if (!key) throw new NotFoundError({ message: `Key with ID ${keyId} not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    const { permission } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      key.projectId,
      actor.authMethod,
      actor.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Edit, ProjectPermissionSub.Cmek);

    const cmek = await kmsDAL.updateById(keyId, data);

    return cmek;
  };

  const deleteCmekById = async (keyId: string, actor: OrgServiceActor) => {
    const key = await kmsDAL.findById(keyId);

    if (!key) throw new NotFoundError({ message: `Key with ID ${keyId} not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    const { permission } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      key.projectId,
      actor.authMethod,
      actor.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Delete, ProjectPermissionSub.Cmek);

    const cmek = kmsDAL.deleteById(keyId);

    return cmek;
  };

  const listCmeksByProjectId = async ({ projectId, ...filters }: TListCmeksByProjectIdDTO, actor: OrgServiceActor) => {
    const { permission } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      projectId,
      actor.authMethod,
      actor.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Read, ProjectPermissionSub.Cmek);

    const { keys: cmeks, totalCount } = await kmsDAL.findKmsKeysByProjectId({ projectId, ...filters });

    return { cmeks, totalCount };
  };

  const cmekEncrypt = async ({ keyId, plaintext }: TCmekEncryptDTO, actor: OrgServiceActor) => {
    const key = await kmsDAL.findById(keyId);

    if (!key) throw new NotFoundError({ message: `Key with ID ${keyId} not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    if (key.isDisabled) throw new BadRequestError({ message: "Key is disabled" });

    const { permission } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      key.projectId,
      actor.authMethod,
      actor.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Encrypt, ProjectPermissionSub.Cmek);

    const encrypt = await kmsService.encryptWithKmsKey({ kmsId: keyId });

    const { cipherTextBlob } = await encrypt({ plainText: Buffer.from(plaintext, "base64") });

    return cipherTextBlob.toString("base64");
  };

  const cmekDecrypt = async ({ keyId, ciphertext }: TCmekDecryptDTO, actor: OrgServiceActor) => {
    const key = await kmsDAL.findById(keyId);

    if (!key) throw new NotFoundError({ message: `Key with ID ${keyId} not found` });

    if (!key.projectId || key.isReserved) throw new BadRequestError({ message: "Key is not customer managed" });

    if (key.isDisabled) throw new BadRequestError({ message: "Key is disabled" });

    const { permission } = await permissionService.getProjectPermission(
      actor.type,
      actor.id,
      key.projectId,
      actor.authMethod,
      actor.orgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCmekActions.Decrypt, ProjectPermissionSub.Cmek);

    const decrypt = await kmsService.decryptWithKmsKey({ kmsId: keyId });

    const plaintextBlob = await decrypt({ cipherTextBlob: Buffer.from(ciphertext, "base64") });

    return plaintextBlob.toString("base64");
  };

  return {
    createCmek,
    updateCmekById,
    deleteCmekById,
    listCmeksByProjectId,
    cmekEncrypt,
    cmekDecrypt
  };
};
