import { ForbiddenError } from "@casl/ability";
import { customAlphabet } from "nanoid";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";

import { TSecretHttpProxyConfigDALFactory } from "./secret-http-proxy-config-dal";
import {
  TDeleteSecretHttpProxyConfigDTO,
  TGetSecretHttpProxyConfigDTO,
  TListSecretHttpProxyConfigsDTO,
  TUpsertSecretHttpProxyConfigDTO
} from "./secret-http-proxy-config-types";

const PLACEHOLDER_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const generatePlaceholderId = customAlphabet(PLACEHOLDER_ALPHABET, 8);
const PLACEHOLDER_REGEX = /^[A-Za-z0-9_\-.~]{4,}$/;

type TSecretHttpProxyConfigServiceFactoryDep = {
  secretHttpProxyConfigDAL: TSecretHttpProxyConfigDALFactory;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "invalidateSecretCacheByProjectId">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TSecretHttpProxyConfigServiceFactory = ReturnType<typeof secretHttpProxyConfigServiceFactory>;

export const secretHttpProxyConfigServiceFactory = ({
  secretHttpProxyConfigDAL,
  secretV2BridgeDAL,
  permissionService
}: TSecretHttpProxyConfigServiceFactoryDep) => {
  const getBySecretId = async ({
    secretId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetSecretHttpProxyConfigDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.ReadValue,
      ProjectPermissionSub.Secrets
    );

    return secretHttpProxyConfigDAL.findBySecretId(secretId);
  };

  const upsert = async ({
    secretId,
    projectId,
    placeholder,
    rules,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpsertSecretHttpProxyConfigDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionSecretActions.Edit, ProjectPermissionSub.Secrets);

    const resolvedPlaceholder = placeholder || `__infisical_${generatePlaceholderId()}__`;

    if (!PLACEHOLDER_REGEX.test(resolvedPlaceholder)) {
      throw new BadRequestError({
        message: "Placeholder must be at least 4 characters and only contain [A-Za-z0-9_-.~]"
      });
    }
    if (!resolvedPlaceholder.includes("__")) {
      throw new BadRequestError({
        message: "Placeholder must contain a __ boundary (e.g. __my_placeholder__)"
      });
    }

    const existing = await secretHttpProxyConfigDAL.findBySecretId(secretId);

    if (existing) {
      const result = await secretHttpProxyConfigDAL.updateById(existing.id, {
        placeholder: resolvedPlaceholder,
        rules: JSON.stringify(rules)
      });
      await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);
      return result;
    }

    const result = await secretHttpProxyConfigDAL.create({
      secretId,
      placeholder: resolvedPlaceholder,
      rules: JSON.stringify(rules)
    });
    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);
    return result;
  };

  const deleteBySecretId = async ({
    secretId,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDeleteSecretHttpProxyConfigDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionSecretActions.Edit, ProjectPermissionSub.Secrets);

    const existing = await secretHttpProxyConfigDAL.findBySecretId(secretId);
    if (!existing) throw new NotFoundError({ message: "Proxy config not found" });

    await secretHttpProxyConfigDAL.deleteById(existing.id);
    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);
    return existing;
  };

  const listByScope = async ({
    projectId,
    environment,
    secretPath,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListSecretHttpProxyConfigsDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretActions.ReadValue,
      ProjectPermissionSub.Secrets
    );

    // TODO: join with secrets_v2 and secret_folders to filter by environment + secretPath
    // For the PoC, fetch all proxy configs and let the broker filter
    const allConfigs = await secretHttpProxyConfigDAL.find({});
    return allConfigs;
  };

  return {
    getBySecretId,
    upsert,
    deleteBySecretId,
    listByScope
  };
};
