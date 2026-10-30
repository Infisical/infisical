import { ForbiddenError } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { PgSqlLock } from "@app/keystore/keystore";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, ConflictError, NotFoundError } from "@app/lib/errors";
import { hasPostgresErrorCode } from "@app/lib/errors/postgres";
import { TGenericPermission } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";

import { TAgentVaultPersonalValueDALFactory } from "../agent-vault-personal-value/agent-vault-personal-value-dal";
import { isUniqueViolation } from "../agent-vault/agent-vault-db-error-fns";
import { AgentVaultVariableScope } from "../agent-vault/agent-vault-enums";
import { ownerOf, ownerOrNullOf, TAgentVaultOwner } from "../agent-vault/agent-vault-owner-fns";
import { getAgentVaultPermission, getAgentVaultReachability } from "../agent-vault/agent-vault-permission";
import { AGENT_VAULT_MAX_PERSONAL_VARIABLES, AGENT_VAULT_MAX_VARIABLES } from "../agent-vault/agent-vault-variable-fns";
import {
  TAgentVaultServiceUsingVariable,
  TAgentVaultVariable,
  TAgentVaultVariableDALFactory,
  TAgentVaultVariableOwnerScope
} from "./agent-vault-variable-dal";
import {
  TAgentVaultVariableScoped,
  TAgentVaultVariableUsedByService,
  TCreateVariableDTO,
  TListVariablesDTO,
  TUpdateVariableDTO,
  TVariableByIdDTO
} from "./agent-vault-variable-types";

type TAgentVaultVariableServiceFactoryDep = {
  agentVaultVariableDAL: TAgentVaultVariableDALFactory;
  agentVaultPersonalValueDAL: Pick<TAgentVaultPersonalValueDALFactory, "delete">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

const AGENT_VAULT_VARIABLE_LIST_DEFAULT_LIMIT = 20;

export type TAgentVaultVariableServiceFactory = ReturnType<typeof agentVaultVariableServiceFactory>;

const isPersonal = (variable: TAgentVaultVariable) => Boolean(variable.userId || variable.identityId);

const isOwnedBy = (variable: TAgentVaultVariable, owner: TAgentVaultOwner) =>
  owner.userId ? variable.userId === owner.userId : variable.identityId === owner.identityId;

export const agentVaultVariableServiceFactory = ({
  agentVaultVariableDAL,
  agentVaultPersonalValueDAL,
  membershipDAL,
  permissionService,
  kmsService
}: TAgentVaultVariableServiceFactoryDep) => {
  const getProjectCipher = (projectId: string) =>
    kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

  /**
   * Global variables are admin only, reads included: a member can use a service without seeing what it is built
   * from, and Edit on access bundles is the action only an admin holds. Personal variables are the caller's own,
   * and any Agent Vault member keeps them. Nobody, an admin included, can name or read another actor's.
   */
  const resolveScope = async (
    { projectId, ctx }: TAgentVaultVariableScoped,
    scope: AgentVaultVariableScope
  ): Promise<TAgentVaultVariableOwnerScope> => {
    const { permission } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    if (scope === AgentVaultVariableScope.Global) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionAgentVaultAccessBundleActions.Edit,
        ProjectPermissionSub.AgentVaultAccessBundles
      );
      return { projectId, owner: null };
    }
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Read,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
    return { projectId, owner: ownerOf(ctx) };
  };

  const resolveListOwners = async (
    { projectId, ctx }: TAgentVaultVariableScoped,
    scope?: AgentVaultVariableScope
  ): Promise<(TAgentVaultOwner | null)[]> => {
    if (scope) return [(await resolveScope({ projectId, ctx }, scope)).owner];

    const { permission } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Read,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
    const owners: (TAgentVaultOwner | null)[] = [];
    if (
      permission.can(ProjectPermissionAgentVaultAccessBundleActions.Edit, ProjectPermissionSub.AgentVaultAccessBundles)
    ) {
      owners.push(null);
    }
    const owner = ownerOrNullOf(ctx);
    if (owner) owners.push(owner);
    if (!owners.length) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionAgentVaultAccessBundleActions.Edit,
        ProjectPermissionSub.AgentVaultAccessBundles
      );
    }
    return owners;
  };

  const notFound = (variableId: string) => new NotFoundError({ message: `Variable with ID '${variableId}' not found` });

  // A variable the caller may not act on reads exactly like one that does not exist, so an id never confirms that
  // someone else's personal variable is there.
  const findAccessibleVariable = async ({ variableId, projectId, ctx }: TVariableByIdDTO) => {
    const variable = await agentVaultVariableDAL.findByIdInProject({ id: variableId, projectId });
    const { permission } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });

    if (!variable) throw notFound(variableId);
    if (isPersonal(variable)) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionAgentVaultAccessBundleActions.Read,
        ProjectPermissionSub.AgentVaultAccessBundles
      );
      const owner = ownerOf(ctx);
      if (!isOwnedBy(variable, owner)) throw notFound(variableId);
      return { variable, scope: { projectId, owner } };
    }
    if (
      permission.cannot(
        ProjectPermissionAgentVaultAccessBundleActions.Edit,
        ProjectPermissionSub.AgentVaultAccessBundles
      )
    ) {
      throw notFound(variableId);
    }
    return { variable, scope: { projectId, owner: null } };
  };

  // A member who lost a bundle keeps their personal variables, but not a view into the bundle: its services drop out
  // of what they see. Global variables are admin-only, and an admin reaches every bundle, so both get null.
  const reachableBundleIdsOf = async ({
    projectId,
    ctx,
    owner
  }: {
    projectId: string;
    ctx: TGenericPermission;
    owner: TAgentVaultOwner | null;
  }) => {
    if (!owner) return null;
    const { accessBundleIds } = await getAgentVaultReachability(
      { permissionService, membershipDAL },
      { projectId, ctx }
    );
    return accessBundleIds;
  };

  const splitByReach = async (
    args: { projectId: string; ctx: TGenericPermission; owner: TAgentVaultOwner | null },
    services: TAgentVaultServiceUsingVariable[]
  ) => {
    if (!services.length) return { reachable: services, unreachable: [] };
    const accessBundleIds = await reachableBundleIdsOf(args);
    if (!accessBundleIds) return { reachable: services, unreachable: [] };
    const reach = new Set(accessBundleIds);
    return {
      reachable: services.filter((service) => reach.has(service.accessBundleId)),
      unreachable: services.filter((service) => !reach.has(service.accessBundleId))
    };
  };

  // Values never leave through this projection; only the audited value endpoint returns one.
  const projectVariable = (variable: TAgentVaultVariable, services: TAgentVaultServiceUsingVariable[]) => ({
    id: variable.id,
    key: variable.key,
    scope: isPersonal(variable) ? AgentVaultVariableScope.Personal : AgentVaultVariableScope.Global,
    usedByServices: services
      .filter((service) => service.variableId === variable.id)
      .map((service): TAgentVaultVariableUsedByService => ({
        id: service.serviceId,
        name: service.serviceName,
        hostPattern: service.hostPattern,
        accessBundleId: service.accessBundleId,
        accessBundleName: service.accessBundleName
      })),
    createdAt: variable.createdAt,
    updatedAt: variable.updatedAt
  });

  const duplicateKeyMessage = (key: string, { owner }: TAgentVaultVariableOwnerScope) =>
    owner ? `You already have a variable named '${key}'.` : `A variable named '${key}' already exists.`;

  // `details.field` names the input at fault, so a form can show the message there without matching its text.
  const duplicateKeyError = (key: string, scope: TAgentVaultVariableOwnerScope) =>
    new BadRequestError({ message: duplicateKeyMessage(key, scope), details: { field: "key" } });

  const inUseMessage = (
    key: string,
    services: TAgentVaultServiceUsingVariable[],
    { owner }: TAgentVaultVariableOwnerScope
  ) => {
    const names = services
      .map((service) => `'${service.serviceName}' (access bundle '${service.accessBundleName}')`)
      .join(", ");
    if (owner) {
      return services.length === 1
        ? `The variable '${key}' is used by your personal values for the service ${names}. Remove it from the service before you delete it.`
        : `The variable '${key}' is used by your personal values for the services ${names}. Remove it from those services before you delete it.`;
    }
    return services.length === 1
      ? `The variable '${key}' is used by the service ${names}. Remove it from that service before deleting it.`
      : `The variable '${key}' is used by the services ${names}. Remove it from those services before deleting it.`;
  };

  const sealValue = async (projectId: string, value: string) =>
    (await getProjectCipher(projectId)).encryptor({ plainText: Buffer.from(JSON.stringify({ value })) }).cipherTextBlob;

  const listVariables = async ({ projectId, ctx, scope: scopeName, limit, ...query }: TListVariablesDTO) => {
    // A key can name a global variable and one of the caller's own, so a lookup by keys has to say which.
    if (query.keys && !scopeName) {
      throw new BadRequestError({
        message: "Send a scope with keys. A key can name both a global variable and one of your own personal variables."
      });
    }
    const owners = await resolveListOwners({ projectId, ctx }, scopeName);
    const personalOwner = owners.find((owner) => owner !== null) ?? null;

    // A lookup by keys returns every key that exists unless the caller caps it, so a missing entry always means
    // the key doesn't exist.
    // The Used By sort counts only what the page will show.
    const accessBundleIds = await reachableBundleIdsOf({ projectId, ctx, owner: personalOwner });
    const { variables, totalCount } = await agentVaultVariableDAL.findForList({
      projectId,
      owners,
      ...query,
      accessBundleIds: accessBundleIds ?? undefined,
      limit: limit ?? query.keys?.length ?? AGENT_VAULT_VARIABLE_LIST_DEFAULT_LIMIT
    });
    const services = await agentVaultVariableDAL.findServicesUsing(variables.map((variable) => variable.id));
    const reach = accessBundleIds ? new Set(accessBundleIds) : null;
    const reachable = reach ? services.filter((service) => reach.has(service.accessBundleId)) : services;

    return { variables: variables.map((variable) => projectVariable(variable, reachable)), totalCount };
  };

  const createVariable = async ({ key, value, scope: scopeName, ...rest }: TCreateVariableDTO) => {
    const scope = await resolveScope(rest, scopeName);
    const { owner } = scope;
    const encryptedValue = await sealValue(rest.projectId, value);
    const cap = owner ? AGENT_VAULT_MAX_PERSONAL_VARIABLES : AGENT_VAULT_MAX_VARIABLES;

    // Serialised per project, or per owner for personal variables, so the count and the key check are
    // authoritative. The unique indexes are the backstop.
    const write = () =>
      agentVaultVariableDAL.transaction(async (tx) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await tx.raw("SELECT pg_advisory_xact_lock(?)", [
          owner
            ? PgSqlLock.CreateAgentVaultPersonalVariable(rest.projectId, owner.userId ?? owner.identityId!)
            : PgSqlLock.CreateAgentVaultVariable(rest.projectId)
        ]);

        const existing = await agentVaultVariableDAL.findKeys(scope, tx);
        if (existing.some((variable) => variable.key === key)) {
          throw duplicateKeyError(key, scope);
        }
        if (existing.length >= cap) {
          throw new BadRequestError({
            message: owner
              ? `You can keep at most ${cap} personal variables. Delete an unused one first.`
              : `Agent Vault can hold at most ${cap} global variables. Delete an unused one first.`
          });
        }

        return agentVaultVariableDAL.create(
          {
            projectId: rest.projectId,
            userId: owner?.userId ?? null,
            identityId: owner?.identityId ?? null,
            key,
            encryptedValue
          },
          tx
        );
      });

    try {
      return { variable: projectVariable(await write(), []) };
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateKeyError(key, scope);
      throw err;
    }
  };

  const updateVariable = async ({ variableId, key, value, ...rest }: TUpdateVariableDTO) => {
    const { variable, scope } = await findAccessibleVariable({ variableId, ...rest });

    const encryptedValue = value === undefined ? undefined : await sealValue(rest.projectId, value);

    const write = () =>
      agentVaultVariableDAL.transaction(async (tx) => {
        const current = await agentVaultVariableDAL.lockByIdInProject(
          { id: variable.id, projectId: rest.projectId },
          tx
        );
        if (!current) throw notFound(variableId);

        if (key !== undefined && key !== current.key) {
          const clash = await agentVaultVariableDAL.findByKey({ key, ...scope }, tx);
          if (clash) throw duplicateKeyError(key, scope);
        }

        // A rename is this row alone. Sealed text names the variable by id, so nothing that uses it changes.
        await agentVaultVariableDAL.updateById(current.id, { key, ...(encryptedValue ? { encryptedValue } : {}) }, tx);
        const updated = await agentVaultVariableDAL.findByIdInProject(
          { id: current.id, projectId: rest.projectId },
          tx
        );
        const services = await agentVaultVariableDAL.findServicesUsing([current.id], tx);
        return { previous: current, updated: updated!, services };
      });

    let result;
    try {
      result = await write();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw duplicateKeyError(key ?? variable.key, scope);
      }
      throw err;
    }

    const { reachable } = await splitByReach({ ...rest, owner: scope.owner }, result.services);
    return { variable: projectVariable(result.updated, reachable), previousKey: result.previous.key };
  };

  const deleteVariable = async ({ variableId, ...rest }: TVariableByIdDTO) => {
    const { scope } = await findAccessibleVariable({ variableId, ...rest });
    const { accessBundleIds } = scope.owner
      ? await getAgentVaultReachability({ permissionService, membershipDAL }, rest)
      : { accessBundleIds: null };
    const reach = accessBundleIds ? new Set(accessBundleIds) : null;

    // The refusal here is the real check. The row lock waits for any save adding a reference to this variable, since
    // those take it FOR SHARE. The deferred foreign keys only back it up, and only raise at commit.
    const remove = () =>
      agentVaultVariableDAL.transaction(async (tx) => {
        const variable = await agentVaultVariableDAL.lockByIdInProject(
          { id: variableId, projectId: rest.projectId },
          tx
        );
        if (!variable) throw notFound(variableId);

        const services = await agentVaultVariableDAL.findServicesUsing([variable.id], tx);
        const blocking = reach ? services.filter((service) => reach.has(service.accessBundleId)) : services;
        if (blocking.length) throw new ConflictError({ message: inUseMessage(variable.key, blocking, scope) });

        // What the owner saved on a bundle they no longer reach can't be edited or used, so it doesn't hold the
        // variable in place.
        if (scope.owner && services.length) {
          await agentVaultPersonalValueDAL.delete(
            { ...scope.owner, $in: { serviceId: services.map((service) => service.serviceId) } },
            tx
          );
        }

        await agentVaultVariableDAL.deleteById(variable.id, tx);
        return variable;
      });

    try {
      return { variable: projectVariable(await remove(), []) };
    } catch (err) {
      if (hasPostgresErrorCode(err, DatabaseErrorCode.ForeignKeyViolation)) {
        throw new ConflictError({
          message: scope.owner
            ? "One of your personal values still uses this variable. Remove it from every service that uses it, then delete it."
            : "This variable is still used by a service. Remove it from every service that uses it, then delete it."
        });
      }
      throw err;
    }
  };

  const getVariableValue = async ({ variableId, ...rest }: TVariableByIdDTO) => {
    const { variable } = await findAccessibleVariable({ variableId, ...rest });

    const { decryptor } = await getProjectCipher(rest.projectId);
    const { value } = JSON.parse(decryptor({ cipherTextBlob: variable.encryptedValue }).toString("utf-8")) as {
      value: string;
    };
    return { variable: projectVariable(variable, []), value };
  };

  return { listVariables, createVariable, updateVariable, deleteVariable, getVariableValue };
};
