import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { NotFoundError } from "@app/lib/errors";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectDALFactory } from "../project/project-dal";
import { TBridgeDALFactory } from "./bridge-dal";
import { TCreateBridgeDTO, TGetBridgeDTO, TListBridgeDTO, TUpdateBridgeDTO, TDeleteBridgeDTO } from "./bridge-types";

type TBridgeServiceFactoryDep = {
  bridgeDAL: TBridgeDALFactory;
  permissionService: TPermissionServiceFactory;
  projectDAL: TProjectDALFactory;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TBridgeServiceFactory = ReturnType<typeof bridgeServiceFactory>;

export const bridgeServiceFactory = ({
  bridgeDAL,
  permissionService,
  projectDAL,
  kmsService
}: TBridgeServiceFactoryDep) => {
  const create = async ({
    baseUrl,
    headers,
    ruleSet,
    slug,
    openApiUrl,
    projectPermission,
    projectId
  }: TCreateBridgeDTO) => {
    const project = await projectDAL.findById(projectId);
    if (!project) throw new NotFoundError({ message: `Project with id '${projectId}' not found` });

    await permissionService.getProjectPermission({
      actor: projectPermission.type,
      actorId: projectPermission.id,
      projectId,
      actorAuthMethod: projectPermission.authMethod,
      actorOrgId: projectPermission.orgId,
      actionProjectType: ActionProjectType.ApiShield
    });

    const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const encryptedHeaders = secretManagerEncryptor({ plainText: Buffer.from(JSON.stringify(headers)) }).cipherTextBlob;

    const bridge = await bridgeDAL.create({
      baseUrl,
      projectId,
      slug,
      ruleSet: ruleSet ? JSON.stringify(ruleSet) : undefined,
      openApiUrl,
      encryptedHeaders
    });

    return bridge;
  };
  const updateById = async ({
    id,
    baseUrl,
    headers,
    ruleSet,
    openApiUrl,
    projectPermission,
    slug
  }: TUpdateBridgeDTO) => {
    const bridge = await bridgeDAL.findById(id);
    if (!bridge) throw new NotFoundError({ message: `Bridge with id '${id}' not found` });

    const project = await projectDAL.findById(bridge.projectId);
    if (!project) throw new NotFoundError({ message: `Project with id '${bridge.projectId}' not found` });

    await permissionService.getProjectPermission({
      actor: projectPermission.type,
      actorId: projectPermission.id,
      projectId: bridge.projectId,
      actorAuthMethod: projectPermission.authMethod,
      actorOrgId: projectPermission.orgId,
      actionProjectType: ActionProjectType.ApiShield
    });

    // eslint-disable-next-line
    const updateData: Record<string, any> = {};

    if (baseUrl !== undefined) updateData.baseUrl = baseUrl;
    if (ruleSet !== undefined) updateData.ruleSet = JSON.stringify(ruleSet);
    if (openApiUrl !== undefined) updateData.openApiUrl = openApiUrl;
    if (slug !== undefined) updateData.slug = slug;

    if (headers !== undefined) {
      const { encryptor: secretManagerEncryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId: bridge.projectId
      });
      updateData.encryptedHeaders = secretManagerEncryptor({
        plainText: Buffer.from(JSON.stringify(headers))
      }).cipherTextBlob;
    }

    const updatedBridge = await bridgeDAL.updateById(id, updateData);
    return updatedBridge;
  };

  const deleteById = async ({ id, projectPermission }: TDeleteBridgeDTO) => {
    const bridge = await bridgeDAL.findById(id);
    if (!bridge) throw new NotFoundError({ message: `Bridge with id '${id}' not found` });

    const project = await projectDAL.findById(bridge.projectId);
    if (!project) throw new NotFoundError({ message: `Project with id '${bridge.projectId}' not found` });

    await permissionService.getProjectPermission({
      actor: projectPermission.type,
      actorId: projectPermission.id,
      projectId: bridge.projectId,
      actorAuthMethod: projectPermission.authMethod,
      actorOrgId: projectPermission.orgId,
      actionProjectType: ActionProjectType.ApiShield
    });

    const deletedBridge = await bridgeDAL.deleteById(id);
    return deletedBridge;
  };

  const listByProjectId = async ({ projectId, projectPermission }: TListBridgeDTO) => {
    const project = await projectDAL.findById(projectId);
    if (!project) throw new NotFoundError({ message: `Project with id '${projectId}' not found` });

    await permissionService.getProjectPermission({
      actor: projectPermission.type,
      actorId: projectPermission.id,
      projectId,
      actorAuthMethod: projectPermission.authMethod,
      actorOrgId: projectPermission.orgId,
      actionProjectType: ActionProjectType.ApiShield
    });

    const bridges = await bridgeDAL.find({ projectId });
    return bridges;
  };

  const getById = async ({ id }: TGetBridgeDTO) => {
    const bridge = await bridgeDAL.findById(id);
    if (!bridge) throw new NotFoundError({ message: `Bridge with id '${id}' not found` });

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: bridge.projectId
    });

    const headers = bridge.encryptedHeaders
      ? (JSON.parse(
          secretManagerDecryptor({
            cipherTextBlob: Buffer.from(bridge.encryptedHeaders)
          }).toString()
        ) as { key: string; value: string }[])
      : [];

    return { ...bridge, headers };
  };

  return {
    create,
    updateById,
    deleteById,
    listByProjectId,
    getById
  };
};
