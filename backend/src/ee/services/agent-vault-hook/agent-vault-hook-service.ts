import { ForbiddenError } from "@casl/ability";

import { KmsDataKey, TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { TLicenseService } from "@app/domains/platform/license/ce/module";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultHookActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { ConflictError, NotFoundError } from "@app/lib/errors";

import { isUniqueViolation } from "../agent-vault/agent-vault-db-error-fns";
import { getAgentVaultPermission } from "../agent-vault/agent-vault-permission";
import { TAgentVaultHookDALFactory, TAgentVaultHookRow } from "./agent-vault-hook-dal";
import { assertAgentVaultHooksOnPlan, toHookRules } from "./agent-vault-hook-fns";
import {
  TAgentVaultHook,
  TAgentVaultHookScoped,
  TCreateHookDTO,
  THookByIdDTO,
  TListHooksDTO,
  TUpdateHookDTO
} from "./agent-vault-hook-types";

type TAgentVaultHookServiceFactoryDep = {
  agentVaultHookDAL: TAgentVaultHookDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsDataKeyService: TKmsDataKeyService;
  licenseService: Pick<TLicenseService, "getPlan">;
};

export type TAgentVaultHookServiceFactory = ReturnType<typeof agentVaultHookServiceFactory>;

export const toAgentVaultHook = (row: TAgentVaultHookRow): TAgentVaultHook => ({
  id: row.id,
  name: row.name!,
  description: row.description ?? null,
  url: row.url,
  rules: toHookRules(row.rules),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

export const agentVaultHookServiceFactory = ({
  agentVaultHookDAL,
  permissionService,
  kmsDataKeyService,
  licenseService
}: TAgentVaultHookServiceFactoryDep) => {
  const $authorize = async (scoped: TAgentVaultHookScoped, action: ProjectPermissionAgentVaultHookActions) => {
    const { permission } = await getAgentVaultPermission({ permissionService }, scoped);
    ForbiddenError.from(permission).throwUnlessCan(action, ProjectPermissionSub.AgentVaultHooks);
  };

  // Sealed before any transaction: with an external KMS this is a network call.
  const $sealSecret = async (projectId: string, secret: string) => {
    const { encryptor } = await kmsDataKeyService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    return encryptor({ plainText: Buffer.from(JSON.stringify({ value: secret })) }).cipherTextBlob;
  };

  const hookNotFound = (hookId: string) => new NotFoundError({ message: `Hook with ID '${hookId}' not found` });
  const duplicateName = (name: string) => new ConflictError({ message: `A hook named '${name}' already exists.` });

  const listHooks = async ({ search, limit, offset, ...scoped }: TListHooksDTO) => {
    await $authorize(scoped, ProjectPermissionAgentVaultHookActions.Read);
    const { hooks, totalCount } = await agentVaultHookDAL.findForList({
      projectId: scoped.projectId,
      search,
      limit,
      offset
    });
    return { hooks: hooks.map(toAgentVaultHook), totalCount };
  };

  const getHook = async ({ hookId, ...scoped }: THookByIdDTO) => {
    await $authorize(scoped, ProjectPermissionAgentVaultHookActions.Read);
    const hook = await agentVaultHookDAL.findSavedByIdInProject({ id: hookId, projectId: scoped.projectId });
    if (!hook) throw hookNotFound(hookId);
    return { hook: toAgentVaultHook(hook) };
  };

  const createHook = async ({ name, description, url, secret, rules = [], ...scoped }: TCreateHookDTO) => {
    await $authorize(scoped, ProjectPermissionAgentVaultHookActions.Create);
    await assertAgentVaultHooksOnPlan(licenseService, scoped.ctx.actorOrgId);

    const existing = await agentVaultHookDAL.findSavedByNameInProject({ name, projectId: scoped.projectId });
    if (existing) throw duplicateName(name);

    const encryptedSecret = await $sealSecret(scoped.projectId, secret);
    let created;
    try {
      created = await agentVaultHookDAL.create({
        projectId: scoped.projectId,
        name,
        description: description ?? null,
        url,
        encryptedSecret,
        rules: JSON.stringify(rules)
      });
    } catch (error) {
      // The unique index decides a race the name check above lost.
      if (isUniqueViolation(error)) throw duplicateName(name);
      throw error;
    }
    return { hook: toAgentVaultHook(created) };
  };

  // Changes reach every session using the hook on the proxy's next resolve, since a session references the hook.
  const updateHook = async ({ hookId, name, description, url, secret, rules, ...scoped }: TUpdateHookDTO) => {
    await $authorize(scoped, ProjectPermissionAgentVaultHookActions.Edit);

    const current = await agentVaultHookDAL.findSavedByIdInProject({ id: hookId, projectId: scoped.projectId });
    if (!current) throw hookNotFound(hookId);

    // The plan gates what the hook does, not how it is labelled, so a downgraded org can still rename one.
    const changesBehaviour = (url !== undefined && url !== current.url) || secret !== undefined || rules !== undefined;
    if (changesBehaviour) await assertAgentVaultHooksOnPlan(licenseService, scoped.ctx.actorOrgId);

    if (name !== undefined && name.toLowerCase() !== current.name?.toLowerCase()) {
      const existing = await agentVaultHookDAL.findSavedByNameInProject({
        name,
        projectId: scoped.projectId,
        excludeId: hookId
      });
      if (existing) throw duplicateName(name);
    }

    const encryptedSecret = secret === undefined ? undefined : await $sealSecret(scoped.projectId, secret);

    let updated;
    try {
      updated = await agentVaultHookDAL.transaction(async (tx) => {
        const locked = await agentVaultHookDAL.lockSavedByIdInProject({ id: hookId, projectId: scoped.projectId }, tx);
        if (!locked) throw hookNotFound(hookId);
        return agentVaultHookDAL.updateById(
          hookId,
          {
            ...(name === undefined ? {} : { name }),
            ...(description === undefined ? {} : { description }),
            ...(url === undefined ? {} : { url }),
            ...(encryptedSecret === undefined ? {} : { encryptedSecret }),
            ...(rules === undefined ? {} : { rules: JSON.stringify(rules) })
          },
          tx
        );
      });
    } catch (error) {
      if (isUniqueViolation(error) && name !== undefined) throw duplicateName(name);
      throw error;
    }

    return { hook: toAgentVaultHook(updated), secretReplaced: secret !== undefined };
  };

  // Never blocked and never plan-gated: sessions using the hook lose it through the foreign key and run as if they had
  // been started without one.
  const deleteHook = async ({ hookId, ...scoped }: THookByIdDTO) => {
    await $authorize(scoped, ProjectPermissionAgentVaultHookActions.Delete);
    const deleted = await agentVaultHookDAL.transaction(async (tx) => {
      const locked = await agentVaultHookDAL.lockSavedByIdInProject({ id: hookId, projectId: scoped.projectId }, tx);
      if (!locked) throw hookNotFound(hookId);
      await agentVaultHookDAL.deleteById(hookId, tx);
      return locked;
    });
    return { hook: toAgentVaultHook(deleted) };
  };

  return { listHooks, getHook, createHook, updateHook, deleteHook };
};
