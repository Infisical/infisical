import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { TAgentVaultMemberValueReferencesInsert } from "@app/db/schemas";
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
import { TAgentVaultProjectScoped } from "../agent-vault-access-bundle/agent-vault-access-bundle-types";
import { TAgentVaultServiceDALFactory } from "../agent-vault-access-bundle/agent-vault-service-dal";
import { TAgentVaultVariableDALFactory } from "../agent-vault-variable/agent-vault-variable-dal";
import {
  TAgentVaultMemberValueDALFactory,
  TAgentVaultMemberValueReferenceDALFactory,
  TAgentVaultMemberValueReferenceWithKey,
  TAgentVaultMemberValueServiceRow,
  TAgentVaultMemberValueSummaryRow
} from "./agent-vault-member-value-dal";
import { TMemberValuesByServiceDTO, TSetMemberValuesDTO } from "./agent-vault-member-value-types";

type TAgentVaultMemberValueServiceFactoryDep = {
  agentVaultMemberValueDAL: TAgentVaultMemberValueDALFactory;
  agentVaultMemberValueReferenceDAL: TAgentVaultMemberValueReferenceDALFactory;
  agentVaultVariableDAL: Pick<TAgentVaultVariableDALFactory, "findKeys" | "lockForReference">;
  agentVaultServiceDAL: Pick<TAgentVaultServiceDALFactory, "findByIdInProject" | "lockForMemberValues">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TAgentVaultMemberValueServiceFactory = ReturnType<typeof agentVaultMemberValueServiceFactory>;

// What an error calls each field, by the service's credential type. Never its value, which is secret.
const fieldName = (credentialType: string, field: TAgentVaultMemberProvidedField) => {
  if (field === AgentVaultVariableReferenceField.CredentialUsername) return "username";
  return credentialType === AgentVaultCredentialType.Basic ? "password" : "token";
};

const SERVICE_CHANGED_DURING_SAVE_MESSAGE =
  "An admin changed which values this service takes from you while you were saving. Reload the service and save again.";

const VARIABLE_DELETED_DURING_SAVE_MESSAGE =
  "A variable one of your values uses was deleted while it was being saved. Check its variable references and save again.";

const REFERENCE_VARIABLE_FOREIGN_KEY = "agent_vault_member_value_refs_variable_foreign";

const sameFields = (a: readonly string[] | null | undefined, b: readonly string[] | null | undefined) =>
  [...(a ?? [])].sort().join(",") === [...(b ?? [])].sort().join(",");

export const agentVaultMemberValueServiceFactory = ({
  agentVaultMemberValueDAL,
  agentVaultMemberValueReferenceDAL,
  agentVaultVariableDAL,
  agentVaultServiceDAL,
  permissionService,
  membershipDAL,
  kmsService
}: TAgentVaultMemberValueServiceFactoryDep) => {
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
    service: TAgentVaultMemberValueServiceRow,
    values: TAgentVaultMemberValueSummaryRow[],
    references: TAgentVaultMemberValueReferenceWithKey[]
  ) => {
    const fields = (service.memberProvidedFields as TAgentVaultMemberProvidedField[]).map((field) => {
      const saved = values.find((value) => value.serviceId === service.serviceId && value.field === field);
      return {
        field,
        isSet: Boolean(saved),
        updatedAt: saved?.updatedAt ?? null,
        variableReferences: saved
          ? references
              .filter((reference) => reference.memberValueId === saved.id)
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
    args: { projectId: string; owner: TAgentVaultOwner; accessBundleIds: string[] | null; serviceId?: string },
    tx?: Knex
  ) => {
    const services = await agentVaultMemberValueDAL.findServicesNeedingValues(args, tx);
    const values = await agentVaultMemberValueDAL.findForOwner(
      { serviceIds: services.map((service) => service.serviceId), owner: args.owner },
      tx
    );
    const references = await agentVaultMemberValueReferenceDAL.findByMemberValueIds(
      values.map((value) => value.id),
      tx
    );
    return services.map((service) => projectService(service, values, references));
  };

  /**
   * The caller's status for every service in these bundles that takes values from members. No permission check: the
   * access bundle service calls it for bundles it has already resolved the caller's reach to.
   */
  const findStatusesForOwner = (args: { projectId: string; owner: TAgentVaultOwner; accessBundleIds: string[] }) =>
    loadServices(args);

  // A service outside the caller's reach, or in another bundle than the path names, reads exactly like one that does
  // not exist.
  const findReachableService = async (dto: TMemberValuesByServiceDTO) => {
    const caller = await resolveCaller(dto);
    const service = await agentVaultServiceDAL.findByIdInProject({ id: dto.serviceId, projectId: dto.projectId });
    if (
      !service ||
      service.accessBundleId !== dto.accessBundleId ||
      !isReachable(caller.accessBundleIds, service.accessBundleId)
    ) {
      throw new NotFoundError({ message: `Service with ID '${dto.serviceId}' not found` });
    }
    return { ...caller, service };
  };

  const setMemberValues = async ({ values, ...dto }: TSetMemberValuesDTO) => {
    const { owner, service } = await findReachableService(dto);

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
    const missing = memberProvidedFields.find((field) => !seen.has(field));
    if (missing) {
      throw new BadRequestError({
        message: `The service '${service.name}' needs your ${name(missing)}. Send '${missing}' with the rest of your values.`
      });
    }

    const variables = values.some(({ value }) => findVariableKeys(value).length)
      ? await agentVaultVariableDAL.findKeys({ projectId: dto.projectId, owner })
      : [];
    const idOfKey = new Map(variables.map((variable) => [variable.key, variable.id]));
    values.forEach(({ field, value }) => {
      const unknown = findVariableKeys(value).find((key) => !idOfKey.has(key));
      if (unknown) {
        throw new BadRequestError({
          message: `Your ${name(field)} uses ${toVariableReference(unknown)}, but you have no personal variable named '${unknown}'. Add it under Variables, or correct the name.`
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

    const write = () =>
      agentVaultMemberValueDAL.transaction(async (tx) => {
        const current = await agentVaultServiceDAL.lockForMemberValues(service.id, tx);
        if (!current) throw new NotFoundError({ message: `Service with ID '${dto.serviceId}' not found` });
        if (
          current.credentialType !== service.credentialType ||
          !sameFields(current.memberProvidedFields, service.memberProvidedFields)
        ) {
          throw new ConflictError({ message: SERVICE_CHANGED_DURING_SAVE_MESSAGE });
        }

        // The whole set is replaced, and the reference rows cascade with the rows they belong to.
        const existing = await agentVaultMemberValueDAL.lockForOwnerAndService({ serviceId: service.id, owner }, tx);
        if (existing.length) {
          await agentVaultMemberValueDAL.delete({ $in: { id: existing.map((row) => row.id) } }, tx);
        }
        const saved = await agentVaultMemberValueDAL.insertMany(
          sealed.map(({ field, encryptedValue }) => ({
            serviceId: service.id,
            field,
            ...ownerColumns(owner),
            encryptedValue
          })),
          tx
        );

        // Read off the stored text, the way resolve reads it, never off the request.
        const referenceRows: TAgentVaultMemberValueReferencesInsert[] = sealed.flatMap(({ field, stored }) => {
          const memberValueId = saved.find((row) => row.field === field)!.id;
          return [...new Set(findStoredVariableIds(stored))]
            .filter((variableId) => variableIds.has(variableId))
            .map((variableId) => ({ memberValueId, variableId }));
        });
        if (referenceRows.length) {
          const referenced = [...new Set(referenceRows.map((row) => row.variableId))];
          const present = await agentVaultVariableDAL.lockForReference(
            { projectId: dto.projectId, owner, variableIds: referenced },
            tx
          );
          if (present.length !== referenced.length) {
            throw new BadRequestError({ message: VARIABLE_DELETED_DURING_SAVE_MESSAGE });
          }
          await agentVaultMemberValueReferenceDAL.insertMany(referenceRows, tx);
        }

        const [projected] = await loadServices(
          { projectId: dto.projectId, owner, accessBundleIds: [service.accessBundleId], serviceId: service.id },
          tx
        );
        return { personalValues: projected, replaced: existing.length > 0 };
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

  const deleteMemberValues = async (dto: TMemberValuesByServiceDTO) => {
    const { owner, service } = await findReachableService(dto);

    return agentVaultMemberValueDAL.transaction(async (tx) => {
      const existing = await agentVaultMemberValueDAL.lockForOwnerAndService({ serviceId: service.id, owner }, tx);
      if (!existing.length) {
        throw new NotFoundError({ message: `You haven't set any values for the service '${service.name}'.` });
      }
      await agentVaultMemberValueDAL.delete({ $in: { id: existing.map((row) => row.id) } }, tx);

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

  return { findStatusesForOwner, setMemberValues, deleteMemberValues };
};
