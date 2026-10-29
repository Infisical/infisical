import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { TAgentVaultPersonalValueReferencesInsert } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, ConflictError, NotFoundError } from "@app/lib/errors";
import { hasPostgresConstraintViolation, hasPostgresErrorCode } from "@app/lib/errors/postgres";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";

import { TAgentVaultProjectScoped } from "../agent-vault-access-bundle/agent-vault-access-bundle-types";
import { TAgentVaultServiceDALFactory } from "../agent-vault-access-bundle/agent-vault-service-dal";
import { TAgentVaultVariableDALFactory } from "../agent-vault-variable/agent-vault-variable-dal";
import { isUniqueViolation } from "../agent-vault/agent-vault-db-error-fns";
import {
  AgentVaultCredentialType,
  AgentVaultVariableReferenceField,
  TAgentVaultMemberProvidedField
} from "../agent-vault/agent-vault-enums";
import { ownerColumns, ownerOf, TAgentVaultOwner } from "../agent-vault/agent-vault-owner-fns";
import { getAgentVaultGrantedReachability } from "../agent-vault/agent-vault-permission";
import {
  findStoredVariableIds,
  findVariableKeys,
  toStoredVariableReferences,
  toVariableReference
} from "../agent-vault/agent-vault-variable-fns";
import {
  TAgentVaultPersonalValueDALFactory,
  TAgentVaultPersonalValueReferenceDALFactory,
  TAgentVaultPersonalValueReferenceWithKey,
  TAgentVaultPersonalValueServiceRow,
  TAgentVaultPersonalValueSummaryRow
} from "./agent-vault-personal-value-dal";
import { sameMemberProvidedFields } from "./agent-vault-personal-value-fns";
import { TPersonalValuesByServiceDTO, TSetPersonalValuesDTO } from "./agent-vault-personal-value-types";

type TAgentVaultPersonalValueServiceFactoryDep = {
  agentVaultPersonalValueDAL: TAgentVaultPersonalValueDALFactory;
  agentVaultPersonalValueReferenceDAL: TAgentVaultPersonalValueReferenceDALFactory;
  agentVaultVariableDAL: Pick<TAgentVaultVariableDALFactory, "findKeys" | "lockForReference">;
  agentVaultServiceDAL: Pick<TAgentVaultServiceDALFactory, "findByIdInProject" | "lockForPersonalValues">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TAgentVaultPersonalValueServiceFactory = ReturnType<typeof agentVaultPersonalValueServiceFactory>;

// What an error calls each field, by the service's credential type. Never its value, which is secret.
const fieldName = (credentialType: string, field: TAgentVaultMemberProvidedField) => {
  if (field === AgentVaultVariableReferenceField.CredentialUsername) return "username";
  return credentialType === AgentVaultCredentialType.Basic ? "password" : "token";
};

const SERVICE_CHANGED_DURING_SAVE_MESSAGE =
  "An admin changed this service's credential while you were setting up your values. Reload the service and save again.";

const VARIABLE_DELETED_DURING_SAVE_MESSAGE =
  "A variable one of your values uses was deleted while it was being saved. Check its variable references and save again.";

const REFERENCE_VARIABLE_FOREIGN_KEY = "agent_vault_personal_value_refs_variable_foreign";

export const agentVaultPersonalValueServiceFactory = ({
  agentVaultPersonalValueDAL,
  agentVaultPersonalValueReferenceDAL,
  agentVaultVariableDAL,
  agentVaultServiceDAL,
  permissionService,
  membershipDAL,
  kmsService
}: TAgentVaultPersonalValueServiceFactoryDep) => {
  const getProjectCipher = (projectId: string) =>
    kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

  const resolveCaller = async ({ projectId, ctx }: TAgentVaultProjectScoped) => {
    const reachability = await getAgentVaultGrantedReachability(
      { permissionService, membershipDAL },
      { projectId, ctx }
    );
    ForbiddenError.from(reachability.permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Read,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
    return { ...reachability, owner: ownerOf(ctx) };
  };

  const isReachable = (accessBundleIds: string[] | null, accessBundleId: string) =>
    !accessBundleIds || accessBundleIds.includes(accessBundleId.toLowerCase());

  const projectService = (
    service: TAgentVaultPersonalValueServiceRow,
    values: TAgentVaultPersonalValueSummaryRow[],
    references: TAgentVaultPersonalValueReferenceWithKey[]
  ) => {
    const fields = (service.memberProvidedFields as TAgentVaultMemberProvidedField[]).map((field) => {
      const saved = values.find((value) => value.serviceId === service.serviceId && value.field === field);
      return {
        field,
        isSet: Boolean(saved),
        updatedAt: saved?.updatedAt ?? null,
        variableReferences: saved
          ? references
              .filter((reference) => reference.personalValueId === saved.id)
              .map((reference) => ({ variableId: reference.variableId, key: reference.key }))
          : []
      };
    });
    return {
      serviceId: service.serviceId,
      serviceName: service.serviceName,
      hostPattern: service.hostPattern,
      accessBundleId: service.accessBundleId,
      accessBundleName: service.accessBundleName,
      credentialType: service.credentialType as AgentVaultCredentialType.Bearer | AgentVaultCredentialType.Basic,
      isConfigured: fields.every((field) => field.isSet),
      fields
    };
  };

  const loadServices = async (
    {
      withVariableReferences = true,
      ...args
    }: {
      projectId: string;
      owner: TAgentVaultOwner;
      accessBundleIds: string[] | null;
      serviceId?: string;
      withVariableReferences?: boolean;
    },
    tx?: Knex
  ) => {
    const services = await agentVaultPersonalValueDAL.findServicesNeedingValues(args, tx);
    const values = await agentVaultPersonalValueDAL.findForOwner(
      { serviceIds: services.map((service) => service.serviceId), owner: args.owner },
      tx
    );
    const references = withVariableReferences
      ? await agentVaultPersonalValueReferenceDAL.findByPersonalValueIds(
          values.map((value) => value.id),
          tx
        )
      : [];
    return services.map((service) => projectService(service, values, references));
  };

  /**
   * The caller's status for every service in these bundles that takes values from members. No permission check: the
   * access bundle service calls it for bundles it has already resolved the caller's reach to. Without variable
   * references, each field's list is empty.
   */
  const findStatusesForOwner = (args: {
    projectId: string;
    owner: TAgentVaultOwner;
    accessBundleIds: string[] | null;
    withVariableReferences?: boolean;
  }) => loadServices(args);

  // A service outside the caller's reach, or in another bundle than the path names, reads exactly like one that does
  // not exist.
  const findReachableService = async (dto: TPersonalValuesByServiceDTO) => {
    const caller = await resolveCaller(dto);
    const service = await agentVaultServiceDAL.findByIdInProject({ id: dto.serviceId, projectId: dto.projectId });
    if (
      !service ||
      service.accessBundleId !== dto.accessBundleId.toLowerCase() ||
      !isReachable(caller.accessBundleIds, service.accessBundleId)
    ) {
      throw new NotFoundError({ message: `Service with ID '${dto.serviceId}' not found` });
    }
    return { ...caller, service };
  };

  const setPersonalValues = async ({ values, credentialType, ...dto }: TSetPersonalValuesDTO) => {
    const { owner, service, isAdmin } = await findReachableService(dto);
    if (credentialType && credentialType !== service.credentialType) {
      throw new ConflictError({ message: SERVICE_CHANGED_DURING_SAVE_MESSAGE });
    }

    const memberProvidedFields = (service.memberProvidedFields ?? []) as TAgentVaultMemberProvidedField[];
    if (!memberProvidedFields.length) {
      throw new BadRequestError({
        message: `The service '${service.name}' doesn't take any values from its members. Its admin sets the whole credential.`
      });
    }

    const name = (field: TAgentVaultMemberProvidedField) => fieldName(service.credentialType, field);
    const seen = new Set<string>();
    values.forEach(({ field }) => {
      if (seen.has(field)) {
        throw new BadRequestError({ message: `Send '${field}' once. It appears more than once in values.` });
      }
      seen.add(field);
      if (!memberProvidedFields.includes(field)) {
        throw new BadRequestError({
          message: `The service '${service.name}' doesn't take a ${name(field)} ('${field}') from you. Send only ${memberProvidedFields.map((el) => `'${el}'`).join(" and ")}.`
        });
      }
    });

    const variables = values.some(({ value }) => findVariableKeys(value).length)
      ? await agentVaultVariableDAL.findKeys({ projectId: dto.projectId, owner })
      : [];
    const idOfKey = new Map(variables.map((variable) => [variable.key, variable.id]));
    values.forEach(({ field, value }) => {
      const unknown = findVariableKeys(value).find((key) => !idOfKey.has(key));
      if (unknown) {
        throw new BadRequestError({
          message: `Your ${name(field)} uses ${toVariableReference(unknown)}, but you have no personal variable named '${unknown}'. Add it as a personal variable, or correct the name.`
        });
      }
    });
    const variableIds = new Set(variables.map((variable) => variable.id));

    // Encrypt before the transaction: KMS can be a network call.
    const { encryptor } = await getProjectCipher(dto.projectId);
    const sealed = values.map(({ field, value }) => {
      const stored = toStoredVariableReferences(value, idOfKey);
      return {
        field,
        stored,
        encryptedValue: encryptor({ plainText: Buffer.from(JSON.stringify({ value: stored })) }).cipherTextBlob
      };
    });

    // Read off the stored text, the way resolve reads it, never off the request.
    const referencedByField = new Map<string, string[]>(
      sealed.map(({ field, stored }) => [
        field,
        [...new Set(findStoredVariableIds(stored))].filter((variableId) => variableIds.has(variableId))
      ])
    );
    const referenced = [...new Set([...referencedByField.values()].flat())];

    const write = () =>
      agentVaultPersonalValueDAL.transaction(async (tx) => {
        const current = await agentVaultServiceDAL.lockForPersonalValues(service.id, tx);
        if (!current) throw new NotFoundError({ message: `Service with ID '${dto.serviceId}' not found` });
        if (
          current.credentialType !== service.credentialType ||
          !sameMemberProvidedFields(current.memberProvidedFields, service.memberProvidedFields)
        ) {
          throw new ConflictError({ message: SERVICE_CHANGED_DURING_SAVE_MESSAGE });
        }
        // A revoke, a removal or a demotion clears what the caller saved on bundles they lose. Saving under the lock
        // of whatever grants the reach (a grant, or for an admin without one, their admin role) means none of those
        // can land between the reach check above and this write and leave values behind.
        const grants = await agentVaultPersonalValueDAL.lockGrantsForOwner(
          { projectId: dto.projectId, accessBundleId: service.accessBundleId, owner },
          tx
        );
        const adminRoles =
          !grants.length && isAdmin
            ? await agentVaultPersonalValueDAL.lockAdminRolesForOwner({ projectId: dto.projectId, owner }, tx)
            : [];
        if (!grants.length && !adminRoles.length) {
          throw new NotFoundError({ message: `Service with ID '${dto.serviceId}' not found` });
        }

        // Before the values: a variable delete locks the variable and then deletes values.
        const present = await agentVaultVariableDAL.lockForReference(
          { projectId: dto.projectId, owner, variableIds: referenced },
          tx
        );
        if (present.length !== referenced.length) {
          throw new BadRequestError({ message: VARIABLE_DELETED_DURING_SAVE_MESSAGE });
        }

        // A field left out keeps its saved value, so a member adds a newly required field without retyping the rest.
        // What they send replaces what was saved for those fields, and the reference rows cascade with it.
        const existing = await agentVaultPersonalValueDAL.lockForOwnerAndService({ serviceId: service.id, owner }, tx);
        const missing = memberProvidedFields.find(
          (field) => !seen.has(field) && !existing.some((row) => row.field === field)
        );
        if (missing) {
          throw new BadRequestError({
            message: `The service '${service.name}' needs your ${name(missing)}. Send '${missing}' with your other values.`
          });
        }
        const replacedRows = existing.filter((row) => seen.has(row.field));
        if (replacedRows.length) {
          await agentVaultPersonalValueDAL.delete({ $in: { id: replacedRows.map((row) => row.id) } }, tx);
        }
        const saved = await agentVaultPersonalValueDAL.insertMany(
          sealed.map(({ field, encryptedValue }) => ({
            serviceId: service.id,
            field,
            ...ownerColumns(owner),
            encryptedValue
          })),
          tx
        );

        const referenceRows: TAgentVaultPersonalValueReferencesInsert[] = saved.flatMap((row) =>
          (referencedByField.get(row.field) ?? []).map((variableId) => ({
            personalValueId: row.id,
            variableId
          }))
        );
        if (referenceRows.length) await agentVaultPersonalValueReferenceDAL.insertMany(referenceRows, tx);

        const [projected] = await loadServices(
          { projectId: dto.projectId, owner, accessBundleIds: [service.accessBundleId], serviceId: service.id },
          tx
        );
        return { personalValues: projected };
      });

    try {
      return await write();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError({
          message: "Your values for this service were saved by another request at the same time. Save them again."
        });
      }
      if (hasPostgresConstraintViolation(err, DatabaseErrorCode.ForeignKeyViolation, REFERENCE_VARIABLE_FOREIGN_KEY)) {
        throw new BadRequestError({ message: VARIABLE_DELETED_DURING_SAVE_MESSAGE });
      }
      // The only other key a save can trip is the service's, deleted while the save ran.
      if (hasPostgresErrorCode(err, DatabaseErrorCode.ForeignKeyViolation)) {
        throw new NotFoundError({ message: `Service with ID '${dto.serviceId}' not found` });
      }
      throw err;
    }
  };

  const deletePersonalValues = async (dto: TPersonalValuesByServiceDTO) => {
    const { owner, service } = await findReachableService(dto);

    return agentVaultPersonalValueDAL.transaction(async (tx) => {
      const existing = await agentVaultPersonalValueDAL.lockForOwnerAndService({ serviceId: service.id, owner }, tx);
      if (!existing.length) {
        throw new NotFoundError({ message: `You haven't set any values for the service '${service.name}'.` });
      }
      await agentVaultPersonalValueDAL.delete({ $in: { id: existing.map((row) => row.id) } }, tx);

      const [projected] = await loadServices(
        { projectId: dto.projectId, owner, accessBundleIds: [service.accessBundleId], serviceId: service.id },
        tx
      );
      return {
        personalValues: projected ?? {
          serviceId: service.id,
          serviceName: service.name,
          hostPattern: service.hostPattern,
          accessBundleId: service.accessBundleId,
          accessBundleName: service.accessBundleName,
          credentialType: service.credentialType as AgentVaultCredentialType.Bearer | AgentVaultCredentialType.Basic,
          isConfigured: false,
          fields: []
        }
      };
    });
  };

  return { findStatusesForOwner, setPersonalValues, deletePersonalValues };
};
