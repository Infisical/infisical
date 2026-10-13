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
import { TAgentVaultProjectScoped } from "../agent-vault-access-bundle/agent-vault-access-bundle-types";
import {
  TAgentVaultVariable,
  TAgentVaultVariableDALFactory,
  TAgentVaultVariableUser
} from "./agent-vault-variable-dal";
import {
  TAgentVaultVariableUsedBy,
  TCreateVariableDTO,
  TUpdateVariableDTO,
  TVariableByIdDTO
} from "./agent-vault-variable-types";

type TAgentVaultVariableServiceFactoryDep = {
  agentVaultVariableDAL: TAgentVaultVariableDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

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
  const assertCanManageVariables = async ({ projectId, ctx }: TAgentVaultProjectScoped) => {
    const { permission } = await getAgentVaultPermission({ permissionService }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
  };

  // Values never leave through this projection; only the audited value endpoint returns one.
  const projectVariable = (variable: TAgentVaultVariable, users: TAgentVaultVariableUser[]) => ({
    id: variable.id,
    key: variable.key,
    usedBy: users
      .filter((user) => user.variableId === variable.id)
      .map(
        (user): TAgentVaultVariableUsedBy => ({
          id: user.serviceId,
          name: user.serviceName,
          hostPattern: user.hostPattern,
          accessBundleId: user.accessBundleId,
          accessBundleName: user.accessBundleName
        })
      ),
    createdAt: variable.createdAt,
    updatedAt: variable.updatedAt
  });

  const notFound = (variableId: string) => new NotFoundError({ message: `Variable with ID '${variableId}' not found` });

  const duplicateKeyMessage = (key: string) => `A variable named '${key}' already exists.`;

  const inUseMessage = (key: string, users: TAgentVaultVariableUser[]) => {
    const names = users.map((user) => `'${user.serviceName}' (access bundle '${user.accessBundleName}')`).join(", ");
    return users.length === 1
      ? `The variable '${key}' is used by the service ${names}. Remove it from that service before deleting it.`
      : `The variable '${key}' is used by the services ${names}. Remove it from those services before deleting it.`;
  };

  const listVariables = async (dto: TAgentVaultProjectScoped) => {
    await assertCanManageVariables(dto);

    const variables = await agentVaultVariableDAL.findByProjectId(dto.projectId);
    const users = await agentVaultVariableDAL.findUsers(variables.map((variable) => variable.id));

    return variables.map((variable) => projectVariable(variable, users));
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
        const users = await agentVaultVariableDAL.findUsers([current.id], tx);
        return { previous: current, updated: updated!, users };
      });

    let result;
    try {
      result = await write();
    } catch (err) {
      if (isUniqueViolation(err)) throw new BadRequestError({ message: duplicateKeyMessage(key ?? variable.key) });
      throw err;
    }

    return { variable: projectVariable(result.updated, result.users), previousKey: result.previous.key };
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

        const users = await agentVaultVariableDAL.findUsers([variable.id], tx);
        if (users.length) throw new ConflictError({ message: inUseMessage(variable.key, users) });

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
