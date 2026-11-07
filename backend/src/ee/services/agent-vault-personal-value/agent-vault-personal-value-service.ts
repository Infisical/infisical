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
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";

import { TAgentVaultProjectScoped } from "../agent-vault-access-bundle/agent-vault-access-bundle-types";
import { TAgentVaultServiceDALFactory } from "../agent-vault-access-bundle/agent-vault-service-dal";
import { TAgentVaultOauthServiceFactory } from "../agent-vault-oauth/agent-vault-oauth-service";
import {
  isMemberProvidedOauth,
  memberOauthSetupOf,
  oauthConnectionStatusOf
} from "../agent-vault-oauth/agent-vault-oauth-token-fns";
import { TAgentVaultOauthConfig } from "../agent-vault-oauth/agent-vault-oauth-types";
import { TAgentVaultVariableDALFactory } from "../agent-vault-variable/agent-vault-variable-dal";
import { isUniqueViolation } from "../agent-vault/agent-vault-db-error-fns";
import {
  AgentVaultCredentialType,
  AgentVaultOauthStatus,
  AgentVaultVariableReferenceField,
  TAgentVaultMemberProvidedField
} from "../agent-vault/agent-vault-enums";
import { ownerColumns, ownerOf, TAgentVaultOwner } from "../agent-vault/agent-vault-owner-fns";
import { getAgentVaultGrantedReachability } from "../agent-vault/agent-vault-permission";
import { getServiceServerUrl } from "../agent-vault/agent-vault-service-type-fns";
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
import {
  TConnectPersonalOauthDTO,
  TPersonalValuesByServiceDTO,
  TSetPersonalValuesDTO
} from "./agent-vault-personal-value-types";

type TAgentVaultPersonalValueServiceFactoryDep = {
  agentVaultPersonalValueDAL: TAgentVaultPersonalValueDALFactory;
  agentVaultPersonalValueReferenceDAL: TAgentVaultPersonalValueReferenceDALFactory;
  agentVaultVariableDAL: Pick<TAgentVaultVariableDALFactory, "findKeys" | "lockForReference">;
  agentVaultServiceDAL: Pick<TAgentVaultServiceDALFactory, "findByIdInProject" | "lockForPersonalValues">;
  agentVaultOauthService: Pick<
    TAgentVaultOauthServiceFactory,
    "claimAuthorization" | "buildCredentialFromAuthorization"
  >;
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

type TPersonalValueCredentialType =
  | AgentVaultCredentialType.Bearer
  | AgentVaultCredentialType.Basic
  | AgentVaultCredentialType.OAuth;

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
  agentVaultOauthService,
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
      // An OAuth sign-in left to members is the `credential-value` field, and its status is on that field's row.
      const isOauthField =
        service.credentialType === AgentVaultCredentialType.OAuth &&
        field === AgentVaultVariableReferenceField.CredentialValue;
      const oauthConfig = isOauthField ? (saved?.oauthConfig as TAgentVaultOauthConfig | null | undefined) : null;
      return {
        field,
        // Resolve only uses an OAuth row that carries its connection, so one without it isn't set.
        isSet: Boolean(saved) && (!isOauthField || Boolean(oauthConfig)),
        updatedAt: saved?.updatedAt ?? null,
        variableReferences: saved
          ? references
              .filter((reference) => reference.personalValueId === saved.id)
              .map((reference) => ({ variableId: reference.variableId, key: reference.key }))
          : [],
        oauth: oauthConfig ? oauthConnectionStatusOf(oauthConfig) : null
      };
    });
    return {
      serviceId: service.serviceId,
      serviceName: service.serviceName,
      hostPattern: service.hostPattern,
      accessBundleId: service.accessBundleId,
      accessBundleName: service.accessBundleName,
      credentialType: service.credentialType as TPersonalValueCredentialType,
      // A connection whose login died refuses every session until the member connects again, so it needs setup too.
      isConfigured: fields.every(
        (field) => field.isSet && field.oauth?.status !== AgentVaultOauthStatus.NeedsReauthorization
      ),
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

  // Under the service lock, after the reach check: the caller's grants on the bundle, or for an admin without one, their
  // admin role rows. A revoke, a removal or a demotion clears what the caller saved on bundles they lose, so none of
  // those can land between the reach check and the write and leave values behind.
  const lockReach = async (
    {
      projectId,
      accessBundleId,
      owner,
      isAdmin,
      serviceId
    }: { projectId: string; accessBundleId: string; owner: TAgentVaultOwner; isAdmin: boolean; serviceId: string },
    tx: Knex
  ) => {
    const grants = await agentVaultPersonalValueDAL.lockGrantsForOwner({ projectId, accessBundleId, owner }, tx);
    const adminRoles =
      !grants.length && isAdmin
        ? await agentVaultPersonalValueDAL.lockAdminRolesForOwner({ projectId, owner }, tx)
        : [];
    if (!grants.length && !adminRoles.length) {
      throw new NotFoundError({ message: `Service with ID '${serviceId}' not found` });
    }
  };

  /**
   * A member's own sign-in for a service that leaves it to members, saved as their personal value for
   * `credential-value`: the sealed tokens in `encryptedValue` and the rest in `oauthConfig`. Claiming the authorization
   * is single use and only its creator can do it, so a link sent to someone else can't attach their account.
   */
  const connectOauth = async ({ authorizationId, credentialType, ...dto }: TConnectPersonalOauthDTO) => {
    const { owner, service, isAdmin } = await findReachableService(dto);
    if (credentialType && credentialType !== service.credentialType) {
      throw new ConflictError({ message: SERVICE_CHANGED_DURING_SAVE_MESSAGE });
    }
    if (!isMemberProvidedOauth(service)) {
      throw new BadRequestError({
        message: `The service '${service.name}' doesn't leave its OAuth sign-in to members, so there is no account of your own to connect.`
      });
    }
    if (dto.ctx.actor !== ActorType.USER) {
      throw new BadRequestError({
        message:
          "Only a user can connect an OAuth account, because it needs a browser sign-in. To use this service from a machine identity, start the session on behalf of a user who has connected their account."
      });
    }

    const claim = await agentVaultOauthService.claimAuthorization({
      authorizationId,
      projectId: dto.projectId,
      accessBundleId: service.accessBundleId,
      serviceId: service.id,
      ctx: dto.ctx,
      serverUrl: getServiceServerUrl(service.config)!,
      personal: true
    });

    try {
      return await agentVaultPersonalValueDAL.transaction(async (tx) => {
        const current = await agentVaultServiceDAL.lockForPersonalValues(service.id, tx);
        if (!current) throw new NotFoundError({ message: `Service with ID '${dto.serviceId}' not found` });
        // The tokens were issued for the server and client the first read named. An admin pointing the service
        // elsewhere since deleted every member's connection, and this one must not come back after it.
        if (!isMemberProvidedOauth(current) || memberOauthSetupOf(current) !== memberOauthSetupOf(service)) {
          throw new ConflictError({ message: SERVICE_CHANGED_DURING_SAVE_MESSAGE });
        }
        // The same goes for a change made while the member was still signing in, before this save's first read.
        if (claim.record.memberSetup !== memberOauthSetupOf(current)) {
          throw new ConflictError({
            message:
              "An admin changed how members sign in to this service while you were connecting your account. Connect it again."
          });
        }
        await lockReach(
          {
            projectId: dto.projectId,
            accessBundleId: service.accessBundleId,
            owner,
            isAdmin,
            serviceId: dto.serviceId
          },
          tx
        );

        const existing = await agentVaultPersonalValueDAL.lockForOwnerAndService({ serviceId: service.id, owner }, tx);
        const previous = existing.find((row) => row.field === AgentVaultVariableReferenceField.CredentialValue)
          ?.oauthConfig as TAgentVaultOauthConfig | null | undefined;
        // Scopes the server asked for carry over only at the same issuer, as they do for a shared connection.
        const { config, encryptedCredential } = agentVaultOauthService.buildCredentialFromAuthorization(claim.record, {
          previousRequiredScopes: previous?.issuer === claim.record.issuer ? previous.requiredScopes : []
        });
        if (existing.length) {
          await agentVaultPersonalValueDAL.delete({ $in: { id: existing.map((row) => row.id) } }, tx);
        }
        await agentVaultPersonalValueDAL.create(
          {
            serviceId: service.id,
            field: AgentVaultVariableReferenceField.CredentialValue,
            ...ownerColumns(owner),
            encryptedValue: encryptedCredential,
            oauthConfig: config
          },
          tx
        );

        const [projected] = await loadServices(
          {
            projectId: dto.projectId,
            owner,
            accessBundleIds: [service.accessBundleId],
            serviceId: service.id,
            withVariableReferences: false
          },
          tx
        );
        return { personalValues: projected };
      });
    } catch (err) {
      await claim.restore();
      if (isUniqueViolation(err)) {
        throw new ConflictError({
          message: "Your account for this service was connected by another request at the same time. Connect it again."
        });
      }
      if (hasPostgresErrorCode(err, DatabaseErrorCode.ForeignKeyViolation)) {
        throw new NotFoundError({ message: `Service with ID '${dto.serviceId}' not found` });
      }
      throw err;
    }
  };

  const setPersonalValues = async (input: TSetPersonalValuesDTO) => {
    const { values, credentialType, ...dto } = input;

    const { owner, service, isAdmin } = await findReachableService(dto);
    if (credentialType && credentialType !== service.credentialType) {
      throw new ConflictError({ message: SERVICE_CHANGED_DURING_SAVE_MESSAGE });
    }
    if (isMemberProvidedOauth(service)) {
      throw new BadRequestError({
        message: `The service '${service.name}' takes each member's own OAuth sign-in, not a typed value. A user connects their account from the access bundle page in Infisical. A machine identity can't connect one, so start the session on behalf of a user who has.`
      });
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
        await lockReach(
          {
            projectId: dto.projectId,
            accessBundleId: service.accessBundleId,
            owner,
            isAdmin,
            serviceId: dto.serviceId
          },
          tx
        );

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
          credentialType: service.credentialType as TPersonalValueCredentialType,
          isConfigured: false,
          fields: []
        }
      };
    });
  };

  return { findStatusesForOwner, setPersonalValues, connectOauth, deletePersonalValues };
};
