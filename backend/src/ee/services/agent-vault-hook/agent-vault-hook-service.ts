import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { KmsDataKey, TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { TLicenseService } from "@app/domains/platform/license/ce/module";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultHookActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, ConflictError, NotFoundError } from "@app/lib/errors";

import { isUniqueViolation } from "../agent-vault/agent-vault-db-error-fns";
import { AgentVaultServiceType } from "../agent-vault/agent-vault-enums";
import { getAgentVaultPermission } from "../agent-vault/agent-vault-permission";
import { TAgentVaultHookDALFactory, TAgentVaultHookRow } from "./agent-vault-hook-dal";
import {
  AGENT_VAULT_MAX_HOOK_RULES,
  assertAgentVaultHooksOnPlan,
  assertHookNarrowingFitsService,
  groupHookRuleViews,
  pickHookRuleNarrowing,
  TAgentVaultHookRuleInput,
  TAgentVaultHookRuleView,
  toHookServiceLinks
} from "./agent-vault-hook-fns";
import {
  TAddHookServiceDTO,
  TAgentVaultHook,
  TAgentVaultHookScoped,
  TAgentVaultServiceHook,
  TCreateHookDTO,
  THookByIdDTO,
  THookServiceByIdDTO,
  TListHooksDTO,
  TListServiceHooksDTO,
  TUpdateHookDTO,
  TUpdateHookServiceDTO
} from "./agent-vault-hook-types";

type TAgentVaultHookServiceFactoryDep = {
  agentVaultHookDAL: TAgentVaultHookDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsDataKeyService: TKmsDataKeyService;
  licenseService: Pick<TLicenseService, "getPlan">;
};

export type TAgentVaultHookServiceFactory = ReturnType<typeof agentVaultHookServiceFactory>;

export const toAgentVaultHook = (row: TAgentVaultHookRow, rules: TAgentVaultHookRuleView[]): TAgentVaultHook => ({
  id: row.id,
  name: row.name!,
  description: row.description ?? null,
  url: row.url,
  rules,
  appliesToAllServices: row.appliesToAllServices,
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

  // One read for every hook's services, so each rule shows its service's current name. On the transaction when one is
  // given, so a write returns what it wrote.
  const $toHooks = async (rows: TAgentVaultHookRow[], tx?: Knex) => {
    const rulesByHook = groupHookRuleViews(
      await agentVaultHookDAL.findHookServiceLinks(
        rows.map((row) => row.id),
        tx
      )
    );
    return rows.map((row) => toAgentVaultHook(row, rulesByHook.get(row.id) ?? []));
  };

  // In the hook's transaction, after its row lock, so a service deleted meanwhile is a 404 rather than a failed key.
  const $replaceRules = async (
    { projectId, hookId, rules }: { projectId: string; hookId: string; rules: TAgentVaultHookRuleInput[] },
    tx: Knex
  ) => {
    const services = await agentVaultHookDAL.lockProjectServicesForHook(
      { projectId, names: rules.map((rule) => rule.service) },
      tx
    );
    await agentVaultHookDAL.replaceHookServiceLinks(hookId, toHookServiceLinks(rules, services), tx);
  };

  const hookNotFound = (hookId: string) => new NotFoundError({ message: `Hook with ID '${hookId}' not found` });
  const serviceNotInHook = (serviceId: string, hookName: string | null | undefined) =>
    new NotFoundError({ message: `Service with ID '${serviceId}' isn't in hook '${hookName ?? ""}'.` });
  const duplicateName = (name: string) => new ConflictError({ message: `A hook named '${name}' already exists.` });

  const listHooks = async ({ search, limit, offset, ...scoped }: TListHooksDTO) => {
    await $authorize(scoped, ProjectPermissionAgentVaultHookActions.Read);
    const { hooks, totalCount } = await agentVaultHookDAL.findForList({
      projectId: scoped.projectId,
      search,
      limit,
      offset
    });
    return { hooks: await $toHooks(hooks), totalCount };
  };

  const getHook = async ({ hookId, ...scoped }: THookByIdDTO) => {
    await $authorize(scoped, ProjectPermissionAgentVaultHookActions.Read);
    const hook = await agentVaultHookDAL.findSavedByIdInProject({ id: hookId, projectId: scoped.projectId });
    if (!hook) throw hookNotFound(hookId);
    const [view] = await $toHooks([hook]);
    return { hook: view };
  };

  const createHook = async ({ name, description, url, secret, rules = [], ...scoped }: TCreateHookDTO) => {
    await $authorize(scoped, ProjectPermissionAgentVaultHookActions.Create);
    await assertAgentVaultHooksOnPlan(licenseService, scoped.ctx.actorOrgId);

    const existing = await agentVaultHookDAL.findSavedByNameInProject({ name, projectId: scoped.projectId });
    if (existing) throw duplicateName(name);

    const encryptedSecret = await $sealSecret(scoped.projectId, secret);
    try {
      const [view] = await agentVaultHookDAL.transaction(async (tx) => {
        const created = await agentVaultHookDAL.create(
          {
            projectId: scoped.projectId,
            name,
            description: description ?? null,
            url,
            encryptedSecret,
            appliesToAllServices: rules.length === 0
          },
          tx
        );
        await $replaceRules({ projectId: scoped.projectId, hookId: created.id, rules }, tx);
        return $toHooks([created], tx);
      });
      return { hook: view };
    } catch (error) {
      // The unique index decides a race the name check above lost.
      if (isUniqueViolation(error)) throw duplicateName(name);
      throw error;
    }
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

    let view: TAgentVaultHook;
    try {
      [view] = await agentVaultHookDAL.transaction(async (tx) => {
        const locked = await agentVaultHookDAL.lockSavedByIdInProject({ id: hookId, projectId: scoped.projectId }, tx);
        if (!locked) throw hookNotFound(hookId);
        if (rules !== undefined) await $replaceRules({ projectId: scoped.projectId, hookId, rules }, tx);
        const updated = await agentVaultHookDAL.updateById(
          hookId,
          {
            ...(name === undefined ? {} : { name }),
            ...(description === undefined ? {} : { description }),
            ...(url === undefined ? {} : { url }),
            ...(encryptedSecret === undefined ? {} : { encryptedSecret }),
            ...(rules === undefined ? {} : { appliesToAllServices: rules.length === 0 })
          },
          tx
        );
        return $toHooks([updated], tx);
      });
    } catch (error) {
      if (isUniqueViolation(error) && name !== undefined) throw duplicateName(name);
      throw error;
    }

    return { hook: view, secretReplaced: secret !== undefined };
  };

  // Never blocked and never plan-gated: sessions using the hook lose it through the foreign key and run as if they had
  // been started without one.
  const deleteHook = async ({ hookId, ...scoped }: THookByIdDTO) => {
    await $authorize(scoped, ProjectPermissionAgentVaultHookActions.Delete);
    const [view] = await agentVaultHookDAL.transaction(async (tx) => {
      const locked = await agentVaultHookDAL.lockSavedByIdInProject({ id: hookId, projectId: scoped.projectId }, tx);
      if (!locked) throw hookNotFound(hookId);
      const deleted = await $toHooks([locked], tx);
      await agentVaultHookDAL.deleteById(hookId, tx);
      return deleted;
    });
    return { hook: view };
  };

  // The service sheet's edits: one service of a hook at a time. Adding and narrowing are plan-gated like an edit of the
  // rule list; removing is not, like deleting the hook.
  const $editHookService = async <T>(
    { hookId, ...scoped }: THookByIdDTO,
    edit: (hook: TAgentVaultHookRow, tx: Knex) => Promise<T>,
    { requiresPlan = true }: { requiresPlan?: boolean } = {}
  ) => {
    await $authorize(scoped, ProjectPermissionAgentVaultHookActions.Edit);
    if (requiresPlan) await assertAgentVaultHooksOnPlan(licenseService, scoped.ctx.actorOrgId);
    return agentVaultHookDAL.transaction(async (tx) => {
      const hook = await agentVaultHookDAL.lockSavedByIdInProject({ id: hookId, projectId: scoped.projectId }, tx);
      if (!hook) throw hookNotFound(hookId);
      const result = await edit(hook, tx);
      // Bumps updatedAt, which the hooks page shows as the last change.
      await agentVaultHookDAL.updateById(hookId, { appliesToAllServices: false }, tx);
      return { hook: { id: hook.id, name: hook.name! }, ...result };
    });
  };

  const addHookService = async ({ service: serviceName, methods, paths, tools, ...byId }: TAddHookServiceDTO) =>
    $editHookService(byId, async (hook, tx) => {
      const [service] = await agentVaultHookDAL.lockProjectServicesForHook(
        { projectId: byId.projectId, names: [serviceName] },
        tx
      );
      if (!service) {
        throw new NotFoundError({ message: `There's no service called '${serviceName}' in this project.` });
      }
      const typed = { id: service.id, name: service.name, type: service.type as AgentVaultServiceType };
      const narrowing = { ...(methods ? { methods } : {}), ...(paths ? { paths } : {}), ...(tools ? { tools } : {}) };
      assertHookNarrowingFitsService(narrowing, typed);
      if (await agentVaultHookDAL.lockHookServiceLink({ hookId: hook.id, serviceId: service.id }, tx)) {
        throw new ConflictError({
          message: `'${service.name}' is already in hook '${hook.name}'. Change what it checks instead of adding it again.`
        });
      }
      if ((await agentVaultHookDAL.countHookServiceLinks(hook.id, tx)) >= AGENT_VAULT_MAX_HOOK_RULES) {
        throw new BadRequestError({
          message: `Hook '${hook.name}' already checks ${AGENT_VAULT_MAX_HOOK_RULES} services, the most a hook can have. Remove one before adding '${service.name}'.`
        });
      }
      await agentVaultHookDAL.insertHookServiceLink(
        {
          hookId: hook.id,
          link: { serviceId: service.id, methods: methods ?? null, paths: paths ?? null, tools: tools ?? null }
        },
        tx
      );
      return { service: { id: service.id, name: service.name }, ...narrowing };
    });

  // A field left out keeps its value and null removes it, so the narrowing is checked once merged.
  const updateHookService = async ({ serviceId, methods, paths, tools, ...byId }: TUpdateHookServiceDTO) =>
    $editHookService(byId, async (hook, tx) => {
      const link = await agentVaultHookDAL.lockHookServiceLink({ hookId: hook.id, serviceId }, tx);
      if (!link) throw serviceNotInHook(serviceId, hook.name);
      const current = pickHookRuleNarrowing(link);
      const merged = {
        methods: methods === undefined ? current.methods : (methods ?? undefined),
        paths: paths === undefined ? current.paths : (paths ?? undefined),
        tools: tools === undefined ? current.tools : (tools ?? undefined)
      };
      assertHookNarrowingFitsService(merged, {
        name: link.serviceName,
        type: link.serviceType
      });
      await agentVaultHookDAL.updateHookServiceLink(
        {
          hookId: hook.id,
          serviceId,
          link: { methods: merged.methods ?? null, paths: merged.paths ?? null, tools: merged.tools ?? null }
        },
        tx
      );
      return { service: { id: link.serviceId, name: link.serviceName }, ...pickHookRuleNarrowing(merged) };
    });

  // Removing a hook's last service leaves it checking nothing, as deleting that service would.
  const removeHookService = async ({ serviceId, ...byId }: THookServiceByIdDTO) =>
    $editHookService(
      byId,
      async (hook, tx) => {
        const link = await agentVaultHookDAL.lockHookServiceLink({ hookId: hook.id, serviceId }, tx);
        if (!link) throw serviceNotInHook(serviceId, hook.name);
        await agentVaultHookDAL.deleteHookServiceLink({ hookId: hook.id, serviceId }, tx);
        return { service: { id: link.serviceId, name: link.serviceName }, ...pickHookRuleNarrowing(link) };
      },
      { requiresPlan: false }
    );

  // Undefined for a caller who can't read hooks, whose service reads leave hooks out.
  const listServiceHooks = async ({ serviceId, ...scoped }: TListServiceHooksDTO) => {
    const { permission } = await getAgentVaultPermission({ permissionService }, scoped);
    if (permission.cannot(ProjectPermissionAgentVaultHookActions.Read, ProjectPermissionSub.AgentVaultHooks)) {
      return undefined;
    }
    const rows = await agentVaultHookDAL.findSavedHooksOfService({ serviceId, projectId: scoped.projectId });
    return rows.map((row): TAgentVaultServiceHook => ({ id: row.id, name: row.name, ...pickHookRuleNarrowing(row) }));
  };

  return {
    listHooks,
    getHook,
    createHook,
    updateHook,
    deleteHook,
    addHookService,
    updateHookService,
    removeHookService,
    listServiceHooks
  };
};
