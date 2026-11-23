import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { KmsDataKey, TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { TLicenseService } from "@app/domains/platform/license/ce/module";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultHookActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { PgSqlLock } from "@app/keystore/keystore";
import { ConflictError, NotFoundError } from "@app/lib/errors";

import type { TAgentVaultServiceDALFactory } from "../agent-vault-access-bundle/agent-vault-service-dal";
import { isUniqueViolation } from "../agent-vault/agent-vault-db-error-fns";
import {
  getAgentVaultPermission,
  getAgentVaultReachability,
  TAgentVaultReachDep,
  unionWithin,
  usableServiceIdsOf,
  visibleIdsWithin
} from "../agent-vault/agent-vault-permission";
import { TAgentVaultReachDALFactory } from "../agent-vault/agent-vault-reach-dal";
import { TAgentVaultHookDALFactory, TAgentVaultHookRow } from "./agent-vault-hook-dal";
import { assertAgentVaultHooksOnPlan } from "./agent-vault-hook-fns";
import {
  TAgentVaultHook,
  TAgentVaultHookScoped,
  TCreateHookDTO,
  THookByIdDTO,
  THookServiceRef,
  TListHooksDTO,
  TUpdateHookDTO
} from "./agent-vault-hook-types";

type TAgentVaultHookServiceFactoryDep = {
  agentVaultHookDAL: TAgentVaultHookDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsDataKeyService: TKmsDataKeyService;
  licenseService: Pick<TLicenseService, "getPlan">;
  agentVaultReachDAL: TAgentVaultReachDep & Pick<TAgentVaultReachDALFactory, "findServiceIdsInAnyBundle">;
  agentVaultServiceDAL: Pick<TAgentVaultServiceDALFactory, "findIdsInBundles">;
};

export type TAgentVaultHookServiceFactory = ReturnType<typeof agentVaultHookServiceFactory>;

export const toAgentVaultHook = (row: TAgentVaultHookRow, usedBy: THookServiceRef[]): TAgentVaultHook => ({
  id: row.id,
  projectId: row.projectId,
  name: row.name,
  description: row.description ?? null,
  url: row.url,
  usedBy,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
});

export const agentVaultHookServiceFactory = ({
  agentVaultHookDAL,
  permissionService,
  kmsDataKeyService,
  licenseService,
  agentVaultReachDAL,
  agentVaultServiceDAL
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

  // A hook's Used By lists the services the caller can see, the same set the services list shows: those their roles
  // read or use, and those in a bundle they can use. Null when they can see every service.
  const $authorizeRead = async (scoped: TAgentVaultHookScoped) => {
    const reachability = await getAgentVaultReachability({ permissionService, agentVaultReachDAL }, scoped);
    ForbiddenError.from(reachability.permission).throwUnlessCan(
      ProjectPermissionAgentVaultHookActions.Read,
      ProjectPermissionSub.AgentVaultHooks
    );
    return unionWithin(
      await visibleIdsWithin(reachability.permission, {
        subjectType: ProjectPermissionSub.AgentVaultServices,
        field: "serviceId",
        loadIds: () => agentVaultReachDAL.findServiceIds(scoped.projectId)
      }),
      await usableServiceIdsOf({ agentVaultServiceDAL, agentVaultReachDAL }, reachability, scoped.projectId)
    );
  };

  const $toHooks = async (rows: TAgentVaultHookRow[], visibleServiceIds: string[] | null, tx?: Knex) => {
    const usedBy = await agentVaultHookDAL.findUsedBy(
      rows.map((row) => row.id),
      visibleServiceIds,
      tx
    );
    return rows.map((row) => toAgentVaultHook(row, usedBy.get(row.id) ?? []));
  };

  const hookNotFound = (hookId: string) => new NotFoundError({ message: `Hook with ID '${hookId}' not found` });

  // By id, a hook the caller can't see answers like a missing one, so a 403 never confirms that an id exists; someone
  // who can see hooks but not act on them still gets the 403.
  const $authorizeById = async (
    scoped: TAgentVaultHookScoped,
    hookId: string,
    action: ProjectPermissionAgentVaultHookActions
  ) => {
    const { permission } = await getAgentVaultPermission({ permissionService }, scoped);
    if (permission.can(action, ProjectPermissionSub.AgentVaultHooks)) return;
    if (permission.cannot(ProjectPermissionAgentVaultHookActions.Read, ProjectPermissionSub.AgentVaultHooks)) {
      throw hookNotFound(hookId);
    }
    const hook = await agentVaultHookDAL.findByIdInProject({ id: hookId, projectId: scoped.projectId });
    if (!hook) throw hookNotFound(hookId);
    ForbiddenError.from(permission).throwUnlessCan(action, ProjectPermissionSub.AgentVaultHooks);
  };
  const duplicateName = (name: string) => new ConflictError({ message: `A hook named '${name}' already exists.` });

  const listHooks = async ({ search, limit, offset, ...scoped }: TListHooksDTO) => {
    const visibleServiceIds = await $authorizeRead(scoped);
    const { hooks, totalCount } = await agentVaultHookDAL.findForList({
      projectId: scoped.projectId,
      search,
      limit,
      offset
    });
    return { hooks: await $toHooks(hooks, visibleServiceIds), totalCount };
  };

  const getHook = async ({ hookId, ...scoped }: THookByIdDTO) => {
    await $authorizeById(scoped, hookId, ProjectPermissionAgentVaultHookActions.Read);
    const visibleServiceIds = await $authorizeRead(scoped);
    const hook = await agentVaultHookDAL.findByIdInProject({ id: hookId, projectId: scoped.projectId });
    if (!hook) throw hookNotFound(hookId);
    const [view] = await $toHooks([hook], visibleServiceIds);
    return { hook: view };
  };

  const createHook = async ({ name, description, url, secret, ...scoped }: TCreateHookDTO) => {
    await $authorize(scoped, ProjectPermissionAgentVaultHookActions.Create);
    await assertAgentVaultHooksOnPlan(licenseService, scoped.ctx.actorOrgId);

    const existing = await agentVaultHookDAL.findByNameInProject({ name, projectId: scoped.projectId });
    if (existing) throw duplicateName(name);

    const encryptedSecret = await $sealSecret(scoped.projectId, secret);
    try {
      const created = await agentVaultHookDAL.create({
        projectId: scoped.projectId,
        name,
        description: description ?? null,
        url,
        encryptedSecret
      });
      return { hook: toAgentVaultHook(created, []) };
    } catch (error) {
      // The unique index decides a race the name check above lost.
      if (isUniqueViolation(error)) throw duplicateName(name);
      throw error;
    }
  };

  // Changes reach every session whose services use the hook on the proxy's next resolve.
  const updateHook = async ({ hookId, name, description, url, secret, ...scoped }: TUpdateHookDTO) => {
    await $authorizeById(scoped, hookId, ProjectPermissionAgentVaultHookActions.Edit);
    const visibleServiceIds = await $authorizeRead(scoped);

    const current = await agentVaultHookDAL.findByIdInProject({ id: hookId, projectId: scoped.projectId });
    if (!current) throw hookNotFound(hookId);

    // The plan gates what the hook does, not how it is labelled, so a downgraded org can still rename one.
    const changesBehaviour = (url !== undefined && url !== current.url) || secret !== undefined;
    if (changesBehaviour) await assertAgentVaultHooksOnPlan(licenseService, scoped.ctx.actorOrgId);

    if (name !== undefined && name.toLowerCase() !== current.name.toLowerCase()) {
      const existing = await agentVaultHookDAL.findByNameInProject({
        name,
        projectId: scoped.projectId,
        excludeId: hookId
      });
      if (existing) throw duplicateName(name);
    }

    const encryptedSecret = secret === undefined ? undefined : await $sealSecret(scoped.projectId, secret);

    let view: TAgentVaultHook;
    try {
      [view] = await agentVaultHookDAL.transaction(async (tx) => {
        const locked = await agentVaultHookDAL.lockByIdInProject({ id: hookId, projectId: scoped.projectId }, tx);
        if (!locked) throw hookNotFound(hookId);
        const updated = await agentVaultHookDAL.updateById(
          hookId,
          {
            ...(name === undefined ? {} : { name }),
            ...(description === undefined ? {} : { description }),
            ...(url === undefined ? {} : { url }),
            ...(encryptedSecret === undefined ? {} : { encryptedSecret })
          },
          tx
        );
        return $toHooks([updated], visibleServiceIds, tx);
      });
    } catch (error) {
      if (isUniqueViolation(error) && name !== undefined) throw duplicateName(name);
      throw error;
    }

    return { hook: view, secretReplaced: secret !== undefined };
  };

  // Never blocked and never plan-gated: the services using the hook stop being checked by it, and the response names
  // them for the audit log. Services are locked before the hook (see the DAL's lock order), then read again under the
  // hook's lock, which keeps any further service from taking it.
  const deleteHook = async ({ hookId, ...scoped }: THookByIdDTO) => {
    await $authorizeById(scoped, hookId, ProjectPermissionAgentVaultHookActions.Delete);
    const view = await agentVaultHookDAL.transaction(async (tx) => {
      // Service writes take this lock before locking a service and then a hook; taking it first here keeps the order.
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.AgentVaultServiceNames(scoped.projectId)]);
      await agentVaultHookDAL.lockServicesUsingHook({ hookId, projectId: scoped.projectId }, tx);
      const locked = await agentVaultHookDAL.lockByIdInProject({ id: hookId, projectId: scoped.projectId }, tx);
      if (!locked) throw hookNotFound(hookId);
      const services = await agentVaultHookDAL.lockServicesUsingHook({ hookId, projectId: scoped.projectId }, tx);
      await agentVaultHookDAL.detachFromServices(
        services.map((service) => service.id),
        tx
      );
      await agentVaultHookDAL.deleteById(hookId, tx);
      return toAgentVaultHook(
        locked,
        [...services].sort((left, right) => left.name.localeCompare(right.name))
      );
    });
    return { hook: view };
  };

  return {
    listHooks,
    getHook,
    createHook,
    updateHook,
    deleteHook
  };
};
