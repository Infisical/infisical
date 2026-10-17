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
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { isUniqueViolation } from "../agent-vault/agent-vault-db-error-fns";
import { getAgentVaultPermission } from "../agent-vault/agent-vault-permission";
import { AGENT_VAULT_MAX_VARIABLES } from "../agent-vault/agent-vault-variable-fns";
import {
  TAgentVaultServiceUsingVariable,
  TAgentVaultVariable,
  TAgentVaultVariableDALFactory
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
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

const AGENT_VAULT_VARIABLE_LIST_DEFAULT_LIMIT = 20;

export type TAgentVaultVariableServiceFactory = ReturnType<typeof agentVaultVariableServiceFactory>;

export const agentVaultVariableServiceFactory = ({
  agentVaultVariableDAL,
  permissionService,
  kmsService
}: TAgentVaultVariableServiceFactoryDep) => {
  const getProjectCipher = (projectId: string) =>
    kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

  // Variables are admin only, reads included: a member can use a service without seeing what it is built from, and
  // Edit on access bundles is the action only an admin holds.
  const assertCanManageVariables = async ({ projectId, ctx }: TAgentVaultVariableScoped) => {
    const { permission } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
  };

  // Values never leave through this projection; only the audited value endpoint returns one.
  const projectVariable = (variable: TAgentVaultVariable, services: TAgentVaultServiceUsingVariable[]) => ({
    id: variable.id,
    key: variable.key,
    usedByServices: services
      .filter((service) => service.variableId === variable.id)
      .map(
        (service): TAgentVaultVariableUsedByService => ({
          id: service.serviceId,
          name: service.serviceName,
          hostPattern: service.hostPattern,
          accessBundleId: service.accessBundleId,
          accessBundleName: service.accessBundleName
        })
      ),
    createdAt: variable.createdAt,
    updatedAt: variable.updatedAt
  });

  const notFound = (variableId: string) => new NotFoundError({ message: `Variable with ID '${variableId}' not found` });

  const duplicateKeyMessage = (key: string) => `A variable named '${key}' already exists.`;

  const inUseMessage = (key: string, services: TAgentVaultServiceUsingVariable[]) => {
    const names = services
      .map((service) => `'${service.serviceName}' (access bundle '${service.accessBundleName}')`)
      .join(", ");
    return services.length === 1
      ? `The variable '${key}' is used by the service ${names}. Remove it from that service before deleting it.`
      : `The variable '${key}' is used by the services ${names}. Remove it from those services before deleting it.`;
  };

  const listVariables = async ({ projectId, ctx, limit, ...query }: TListVariablesDTO) => {
    await assertCanManageVariables({ projectId, ctx });

    // A lookup by keys returns every key that exists unless the caller caps it, so a missing entry always means
    // the key doesn't exist.
    const { variables, totalCount } = await agentVaultVariableDAL.findForList({
      projectId,
      ...query,
      limit: limit ?? query.keys?.length ?? AGENT_VAULT_VARIABLE_LIST_DEFAULT_LIMIT
    });
    const services = await agentVaultVariableDAL.findServicesUsing(variables.map((variable) => variable.id));

    return { variables: variables.map((variable) => projectVariable(variable, services)), totalCount };
  };

  const createVariable = async ({ key, value, ...rest }: TCreateVariableDTO) => {
    await assertCanManageVariables(rest);

    const { encryptor } = await getProjectCipher(rest.projectId);
    const encryptedValue = encryptor({ plainText: Buffer.from(JSON.stringify({ value })) }).cipherTextBlob;

    // Serialised per project so the count and the key check are authoritative. The unique index is the backstop.
    const write = () =>
      agentVaultVariableDAL.transaction(async (tx) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.CreateAgentVaultVariable(rest.projectId)]);

        const existing = await agentVaultVariableDAL.findKeysByProjectId(rest.projectId, tx);
        if (existing.some((variable) => variable.key === key)) {
          throw new BadRequestError({ message: duplicateKeyMessage(key) });
        }
        if (existing.length >= AGENT_VAULT_MAX_VARIABLES) {
          throw new BadRequestError({
            message: `Agent Vault can hold at most ${AGENT_VAULT_MAX_VARIABLES} variables. Delete one that no service uses first.`
          });
        }

        return agentVaultVariableDAL.create({ projectId: rest.projectId, key, encryptedValue }, tx);
      });

    try {
      return { variable: projectVariable(await write(), []) };
    } catch (err) {
      if (isUniqueViolation(err)) throw new BadRequestError({ message: duplicateKeyMessage(key) });
      throw err;
    }
  };

  const updateVariable = async ({ variableId, key, value, ...rest }: TUpdateVariableDTO) => {
    await assertCanManageVariables(rest);

    const variable = await agentVaultVariableDAL.findByIdInProject({ id: variableId, projectId: rest.projectId });
    if (!variable) throw notFound(variableId);

    const encryptedValue =
      value === undefined
        ? undefined
        : (await getProjectCipher(rest.projectId)).encryptor({ plainText: Buffer.from(JSON.stringify({ value })) })
            .cipherTextBlob;

    const write = () =>
      agentVaultVariableDAL.transaction(async (tx) => {
        const current = await agentVaultVariableDAL.lockByIdInProject(
          { id: variable.id, projectId: rest.projectId },
          tx
        );
        if (!current) throw notFound(variableId);

        if (key !== undefined && key !== current.key) {
          const clash = await agentVaultVariableDAL.findByKeyInProject({ key, projectId: rest.projectId }, tx);
          if (clash) throw new BadRequestError({ message: duplicateKeyMessage(key) });
        }

        // A rename is this row alone. Sealed fields name the variable by id, so nothing that uses it changes.
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
      if (isUniqueViolation(err)) throw new BadRequestError({ message: duplicateKeyMessage(key ?? variable.key) });
      throw err;
    }

    return { variable: projectVariable(result.updated, result.services), previousKey: result.previous.key };
  };

  const deleteVariable = async ({ variableId, ...rest }: TVariableByIdDTO) => {
    await assertCanManageVariables(rest);

    // The refusal here is the real check. The row lock waits for any service save adding a reference to this
    // variable, since those take it FOR SHARE. The deferred foreign key only backs it up, and only raises at commit.
    const remove = () =>
      agentVaultVariableDAL.transaction(async (tx) => {
        const variable = await agentVaultVariableDAL.lockByIdInProject(
          { id: variableId, projectId: rest.projectId },
          tx
        );
        if (!variable) throw notFound(variableId);

        const services = await agentVaultVariableDAL.findServicesUsing([variable.id], tx);
        if (services.length) throw new ConflictError({ message: inUseMessage(variable.key, services) });

        await agentVaultVariableDAL.deleteById(variable.id, tx);
        return variable;
      });

    try {
      return { variable: projectVariable(await remove(), []) };
    } catch (err) {
      if (hasPostgresErrorCode(err, DatabaseErrorCode.ForeignKeyViolation)) {
        throw new ConflictError({
          message:
            "This variable is still used by a service. Remove it from every service that uses it, then delete it."
        });
      }
      throw err;
    }
  };

  const getVariableValue = async ({ variableId, ...rest }: TVariableByIdDTO) => {
    await assertCanManageVariables(rest);

    const variable = await agentVaultVariableDAL.findByIdInProject({ id: variableId, projectId: rest.projectId });
    if (!variable) throw notFound(variableId);

    const { decryptor } = await getProjectCipher(rest.projectId);
    const { value } = JSON.parse(decryptor({ cipherTextBlob: variable.encryptedValue }).toString("utf-8")) as {
      value: string;
    };
    return { variableId: variable.id, key: variable.key, value };
  };

  return { listVariables, createVariable, updateVariable, deleteVariable, getVariableValue };
};
