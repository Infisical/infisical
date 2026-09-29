import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import {
  AccessScope,
  RESOURCE_SCOPE,
  ResourceType,
  TAgentVaultServiceCustomHeaders,
  TAgentVaultServices,
  TAgentVaultServiceSubstitutions,
  TAgentVaultServiceVariableReferencesInsert,
  TAgentVaultVariables,
  TMemberships
} from "@app/db/schemas";
import { TIdentityGroupMembershipDALFactory } from "@app/ee/services/group/identity-group-membership-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, ConflictError, NotFoundError } from "@app/lib/errors";
import { hasPostgresErrorCode } from "@app/lib/errors/postgres";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";

import { describeConflict, findHostPatternConflicts } from "../agent-vault/agent-vault-conflict-fns";
import {
  AgentVaultBearerConfigSchema,
  TAgentVaultCredentialConfig
} from "../agent-vault/agent-vault-credential-schemas";
import { isUniqueViolation } from "../agent-vault/agent-vault-db-error-fns";
import {
  AgentVaultCredentialType,
  AgentVaultHttpMethod,
  AgentVaultMemberType,
  AgentVaultResourceRole,
  AgentVaultSubstitutionSurface,
  AgentVaultVariableReferenceField
} from "../agent-vault/agent-vault-enums";
import { getAgentVaultReachability } from "../agent-vault/agent-vault-permission";
import {
  AGENT_VAULT_MAX_VARIABLES,
  findVariableKeys,
  toStoredVariableReferences,
  toVariableReference
} from "../agent-vault/agent-vault-variable-fns";
import { TAgentVaultMemberDALFactory } from "../agent-vault-member/agent-vault-member-dal";
import { TAgentVaultAccessBundleActorRef, TAgentVaultAccessBundleDALFactory } from "./agent-vault-access-bundle-dal";
import {
  TAddMembersDTO,
  TAgentVaultCredentialInput,
  TAgentVaultCredentialSummary,
  TAgentVaultCredentialUpdate,
  TAgentVaultVariableReferenceSummary,
  TCreateAccessBundleDTO,
  TCreateServiceDTO,
  TCreateVariableDTO,
  TDeleteAccessBundleDTO,
  TDeleteServiceDTO,
  TGetAccessBundleDTO,
  TListAccessBundlesDTO,
  TListMembersDTO,
  TListVariablesDTO,
  TRevokeMembersDTO,
  TUpdateAccessBundleDTO,
  TUpdateServiceDTO,
  TUpdateVariableDTO,
  TVariableByIdDTO
} from "./agent-vault-access-bundle-types";
import { TAgentVaultServiceCustomHeaderDALFactory } from "./agent-vault-service-custom-header-dal";
import { TAgentVaultServiceDALFactory } from "./agent-vault-service-dal";
import { TAgentVaultServiceSubstitutionDALFactory } from "./agent-vault-service-substitution-dal";
import {
  TAgentVaultServiceVariableReferenceDALFactory,
  TAgentVaultVariableReferenceWithKey
} from "./agent-vault-service-variable-reference-dal";
import { planTransformationDiff, TTransformationWrite } from "./agent-vault-transformation-fns";
import { TAgentVaultVariableDALFactory } from "./agent-vault-variable-dal";

type TAgentVaultAccessBundleServiceFactoryDep = {
  agentVaultAccessBundleDAL: TAgentVaultAccessBundleDALFactory;
  agentVaultServiceDAL: TAgentVaultServiceDALFactory;
  agentVaultServiceCustomHeaderDAL: TAgentVaultServiceCustomHeaderDALFactory;
  agentVaultServiceSubstitutionDAL: TAgentVaultServiceSubstitutionDALFactory;
  agentVaultVariableDAL: TAgentVaultVariableDALFactory;
  agentVaultServiceVariableReferenceDAL: TAgentVaultServiceVariableReferenceDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  membershipDAL: Pick<
    TMembershipDALFactory,
    "findOne" | "find" | "insertMany" | "delete" | "deleteById" | "transaction" | "findResourceMembershipsForActor"
  >;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "insertMany">;
  agentVaultMemberDAL: Pick<TAgentVaultMemberDALFactory, "findProductMembers">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "find">;
};

export type TAgentVaultAccessBundleServiceFactory = ReturnType<typeof agentVaultAccessBundleServiceFactory>;

// The old shape capped the array at 100 entries; the cap moves here now that the body is three lists.
export const AGENT_VAULT_MAX_GRANTEES = 100;

const ALL_GRANTEE_ACTOR_TYPES = [
  AgentVaultMemberType.User,
  AgentVaultMemberType.Group,
  AgentVaultMemberType.MachineIdentity
];

export const agentVaultAccessBundleServiceFactory = (deps: TAgentVaultAccessBundleServiceFactoryDep) => {
  const {
    agentVaultAccessBundleDAL,
    agentVaultServiceDAL,
    agentVaultServiceCustomHeaderDAL,
    agentVaultServiceSubstitutionDAL,
    agentVaultVariableDAL,
    agentVaultServiceVariableReferenceDAL,
    permissionService,
    kmsService,
    membershipDAL,
    membershipRoleDAL,
    agentVaultMemberDAL,
    userGroupMembershipDAL,
    identityGroupMembershipDAL
  } = deps;

  const bundleScope = (projectId: string, accessBundleId: string) => ({
    scope: RESOURCE_SCOPE as typeof RESOURCE_SCOPE,
    scopeProjectId: projectId,
    scopeResourceType: ResourceType.AgentVaultAccessBundle,
    scopeResourceId: accessBundleId
  });

  const toActorRef = (row: TMemberships): TAgentVaultAccessBundleActorRef => {
    if (row.actorIdentityId) return { type: AgentVaultMemberType.MachineIdentity, id: row.actorIdentityId };
    if (row.actorGroupId) return { type: AgentVaultMemberType.Group, id: row.actorGroupId };
    return { type: AgentVaultMemberType.User, id: row.actorUserId ?? "" };
  };

  const toMember = (row: TMemberships) => ({
    id: row.id,
    accessBundleId: row.scopeResourceId!,
    createdAt: row.createdAt,
    actor: toActorRef(row)
  });

  type TGrantActorColumn = "actorUserId" | "actorIdentityId" | "actorGroupId";

  type TGrantActor = { actorColumn: TGrantActorColumn; actorId: string };

  const actorKey = ({ actorColumn, actorId }: TGrantActor) => `${actorColumn}:${actorId}`;

  const ACTOR_TYPE_OF: Record<TGrantActorColumn, AgentVaultMemberType> = {
    actorUserId: AgentVaultMemberType.User,
    actorIdentityId: AgentVaultMemberType.MachineIdentity,
    actorGroupId: AgentVaultMemberType.Group
  };

  const toActorRefFromGrant = ({ actorColumn, actorId }: TGrantActor): TAgentVaultAccessBundleActorRef => ({
    type: ACTOR_TYPE_OF[actorColumn],
    id: actorId
  });

  const ACTOR_FIELD_OF: Record<TGrantActorColumn, "userId" | "identityId" | "groupId"> = {
    actorUserId: "userId",
    actorIdentityId: "identityId",
    actorGroupId: "groupId"
  };

  const writeGrants = async (
    {
      projectId,
      orgId,
      accessBundleId,
      actors
    }: { projectId: string; orgId: string; accessBundleId: string; actors: TGrantActor[] },
    tx: Knex
  ) => {
    const memberships = await membershipDAL.insertMany(
      actors.map(({ actorColumn, actorId }) => ({
        ...bundleScope(projectId, accessBundleId),
        scopeOrgId: orgId,
        [actorColumn]: actorId,
        isActive: true
      })),
      tx
    );
    await membershipRoleDAL.insertMany(
      memberships.map((membership) => ({ membershipId: membership.id, role: AgentVaultResourceRole.Consumer })),
      tx
    );
    return memberships;
  };

  const isInProjectThroughGroup = async ({
    projectId,
    userId,
    identityId
  }: {
    projectId: string;
    userId?: string;
    identityId?: string;
  }) => {
    const groups = userId
      ? await userGroupMembershipDAL.find({ userId })
      : await identityGroupMembershipDAL.find({ identityId: identityId! });
    if (!groups.length) return false;

    const viaGroup = await membershipDAL.find({
      scope: AccessScope.Project,
      scopeProjectId: projectId,
      $in: { actorGroupId: groups.map((group) => group.groupId) }
    });
    return viaGroup.length > 0;
  };

  const assertActorInProject = async ({
    projectId,
    userId,
    identityId,
    groupId
  }: {
    projectId: string;
    userId?: string;
    identityId?: string;
    groupId?: string;
  }) => {
    const membership = await membershipDAL.findOne({
      scope: AccessScope.Project,
      scopeProjectId: projectId,
      ...(userId ? { actorUserId: userId } : {}),
      ...(identityId ? { actorIdentityId: identityId } : {}),
      ...(groupId ? { actorGroupId: groupId } : {})
    });

    if (membership) return;

    // Named, because a batch grant rejects on the first offender and the caller would otherwise have to bisect.
    let actor = `group '${groupId}'`;
    if (userId) actor = `user '${userId}'`;
    else if (identityId) actor = `machine identity '${identityId}'`;

    if (!groupId && (await isInProjectThroughGroup({ projectId, userId, identityId }))) {
      throw new BadRequestError({
        message: `The ${actor} is in Agent Vault through a group. Grant the access bundle to the group, or add them directly under Access Control first.`
      });
    }

    throw new BadRequestError({
      message: `The ${actor} is not a member of Agent Vault. Add them under Access Control first.`
    });
  };

  const assertActorsInProject = async ({ projectId, actors }: { projectId: string; actors: TGrantActor[] }) => {
    const idsByColumn = new Map<TGrantActorColumn, string[]>();
    actors.forEach((actor) => {
      idsByColumn.set(actor.actorColumn, [...(idsByColumn.get(actor.actorColumn) ?? []), actor.actorId]);
    });

    const found = new Set<string>();
    await Promise.all(
      [...idsByColumn].map(async ([actorColumn, actorIds]) => {
        const rows = await membershipDAL.find({
          scope: AccessScope.Project,
          scopeProjectId: projectId,
          $in: { [actorColumn]: actorIds }
        });
        rows.forEach((row) => found.add(actorKey({ actorColumn, actorId: row[actorColumn]! })));
      })
    );

    // The single-actor check re-queries the first offender so the caller gets the specific reason, not just a count.
    const missing = actors.find((actor) => !found.has(actorKey(actor)));
    if (missing) {
      await assertActorInProject({ projectId, [ACTOR_FIELD_OF[missing.actorColumn]]: missing.actorId });
    }
  };

  const getProjectCipher = (projectId: string) =>
    kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

  // `null` clears the sealed column, `undefined` leaves it alone. $decryptCredential reads a NULL secret
  // as passthrough, so the two are not interchangeable.
  type TCredentialWrite = { config: TAgentVaultCredentialConfig; secret: Record<string, string> | null | undefined };

  const splitCredential = (credential: TAgentVaultCredentialInput): TCredentialWrite => {
    switch (credential.type) {
      case AgentVaultCredentialType.Bearer: {
        const config = AgentVaultBearerConfigSchema.parse({
          headerName: credential.headerName,
          headerPrefix: credential.headerPrefix
        });
        return { config: { type: credential.type, ...config }, secret: { value: credential.value } };
      }
      case AgentVaultCredentialType.Basic: {
        if (!credential.username && !credential.password) {
          throw new BadRequestError({ message: "A basic credential needs a username, a password, or both" });
        }
        return {
          config: { type: credential.type },
          secret: { username: credential.username, password: credential.password }
        };
      }
      default:
        return { config: { type: AgentVaultCredentialType.Passthrough }, secret: null };
    }
  };

  const mergeCredential = (
    credential: TAgentVaultCredentialUpdate,
    stored: TAgentVaultServices,
    storedSecret: Record<string, string> | null
  ): TCredentialWrite => {
    if (credential.type !== stored.credentialType) {
      if (credential.type === AgentVaultCredentialType.Bearer && credential.value === undefined) {
        throw new BadRequestError({
          message:
            "Provide a new token when changing the credential type to bearer. The stored secret belongs to the previous type"
        });
      }
      return splitCredential(
        credential.type === AgentVaultCredentialType.Basic
          ? { type: credential.type, username: credential.username ?? "", password: credential.password ?? "" }
          : (credential as TAgentVaultCredentialInput)
      );
    }

    const prev = (stored.credentialConfig ?? {}) as { headerName?: string; headerPrefix?: string };

    switch (credential.type) {
      case AgentVaultCredentialType.Bearer:
        return {
          config: {
            type: credential.type,
            headerName: credential.headerName ?? prev.headerName ?? "Authorization",
            headerPrefix: credential.headerPrefix ?? prev.headerPrefix ?? ""
          },
          secret: credential.value === undefined ? undefined : { value: credential.value }
        };
      case AgentVaultCredentialType.Basic: {
        if (credential.username === undefined && credential.password === undefined) {
          return { config: { type: credential.type }, secret: undefined };
        }
        const username = credential.username ?? storedSecret?.username ?? "";
        const password = credential.password ?? storedSecret?.password ?? "";
        if (!username && !password) {
          throw new BadRequestError({ message: "A basic credential needs a username, a password, or both" });
        }
        return { config: { type: credential.type }, secret: { username, password } };
      }
      default:
        return { config: { type: AgentVaultCredentialType.Passthrough }, secret: null };
    }
  };

  const summarizeCredential = (service: TAgentVaultServices): TAgentVaultCredentialSummary => {
    const config = service.credentialConfig as Record<string, string>;
    switch (service.credentialType as AgentVaultCredentialType) {
      case AgentVaultCredentialType.Bearer:
        return {
          type: AgentVaultCredentialType.Bearer,
          headerName: config.headerName,
          headerPrefix: config.headerPrefix
        };
      case AgentVaultCredentialType.Basic:
        return { type: AgentVaultCredentialType.Basic };
      default:
        return { type: AgentVaultCredentialType.Passthrough };
    }
  };

  const summarizeVariableReference = (
    reference: TAgentVaultVariableReferenceWithKey
  ): TAgentVaultVariableReferenceSummary => {
    const base = { variableId: reference.variableId, key: reference.key };
    // The field check constraint guarantees the id that matches the field is set.
    switch (reference.field as AgentVaultVariableReferenceField) {
      case AgentVaultVariableReferenceField.CustomHeader:
        return {
          ...base,
          field: AgentVaultVariableReferenceField.CustomHeader,
          customHeaderId: reference.customHeaderId!
        };
      case AgentVaultVariableReferenceField.Substitution:
        return {
          ...base,
          field: AgentVaultVariableReferenceField.Substitution,
          substitutionId: reference.substitutionId!
        };
      case AgentVaultVariableReferenceField.CredentialUsername:
        return { ...base, field: AgentVaultVariableReferenceField.CredentialUsername };
      default:
        return { ...base, field: AgentVaultVariableReferenceField.CredentialValue };
    }
  };

  // Built by hand rather than spread, so the sealed columns stay off the wire even if the response schema is
  // later loosened.
  const projectService = (
    service: TAgentVaultServices,
    customHeaders: TAgentVaultServiceCustomHeaders[],
    substitutions: TAgentVaultServiceSubstitutions[],
    variableReferences: TAgentVaultVariableReferenceWithKey[]
  ) => ({
    id: service.id,
    accessBundleId: service.accessBundleId,
    name: service.name,
    hostPattern: service.hostPattern,
    allowedMethods: (service.allowedMethods ?? null) as AgentVaultHttpMethod[] | null,
    allowedPathPrefixes: service.allowedPathPrefixes ?? null,
    credential: summarizeCredential(service),
    customHeaders: customHeaders.map((header) => ({ id: header.id, name: header.name, prefix: header.prefix })),
    substitutions: substitutions.map((substitution) => ({
      id: substitution.id,
      placeholder: substitution.placeholder,
      surfaces: substitution.surfaces as AgentVaultSubstitutionSurface[]
    })),
    variableReferences: variableReferences.map(summarizeVariableReference),
    createdAt: service.createdAt,
    updatedAt: service.updatedAt
  });

  const loadTransformations = async (
    serviceIds: string[],
    tx?: Knex,
    { withVariableReferences = true }: { withVariableReferences?: boolean } = {}
  ) => {
    const [customHeaders, substitutions, variableReferences] = await Promise.all([
      agentVaultServiceCustomHeaderDAL.findByServiceIds(serviceIds, tx),
      agentVaultServiceSubstitutionDAL.findByServiceIds(serviceIds, tx),
      withVariableReferences ? agentVaultServiceVariableReferenceDAL.findByServiceIds(serviceIds, tx) : []
    ]);
    return { customHeaders, substitutions, variableReferences };
  };

  // What a missing key's error calls the field. Never the value itself, which is secret.
  type TReferencingText = { label: string; text: string };

  type TReferenceTarget = {
    field: AgentVaultVariableReferenceField;
    customHeaderId?: string;
    substitutionId?: string;
  };

  const credentialReferenceTexts = (
    credential: TAgentVaultCredentialUpdate
  ): (TReferencingText & TReferenceTarget)[] => {
    switch (credential.type) {
      case AgentVaultCredentialType.Bearer:
        return credential.value === undefined
          ? []
          : [{ label: "The token", text: credential.value, field: AgentVaultVariableReferenceField.CredentialValue }];
      case AgentVaultCredentialType.Basic:
        return [
          ...(credential.username === undefined
            ? []
            : [
                {
                  label: "The username",
                  text: credential.username,
                  field: AgentVaultVariableReferenceField.CredentialUsername
                }
              ]),
          ...(credential.password === undefined
            ? []
            : [
                {
                  label: "The password",
                  text: credential.password,
                  field: AgentVaultVariableReferenceField.CredentialValue
                }
              ])
        ];
      default:
        return [];
    }
  };

  // A key the bundle does not define would reach the host as literal braces, so it fails the save instead.
  const resolveVariableKeys = async (accessBundleId: string, texts: TReferencingText[]) => {
    if (!texts.some(({ text }) => findVariableKeys(text).length)) return new Map<string, string>();

    const variables = await agentVaultVariableDAL.findKeysByAccessBundleId(accessBundleId);
    const idOfKey = new Map(variables.map((variable) => [variable.key, variable.id]));

    texts.forEach(({ label, text }) => {
      const missing = findVariableKeys(text).find((key) => !idOfKey.has(key));
      if (missing) {
        throw new BadRequestError({
          message: `${label} uses ${toVariableReference(missing)}, but this access bundle has no variable named '${missing}'. Add it under Variables, or correct the name.`
        });
      }
    });

    return idOfKey;
  };

  const toReferenceRows = (
    serviceId: string,
    idOfKey: ReadonlyMap<string, string>,
    targets: (TReferenceTarget & { text: string })[]
  ): TAgentVaultServiceVariableReferencesInsert[] =>
    targets.flatMap(({ text, field, customHeaderId, substitutionId }) =>
      findVariableKeys(text).flatMap((key) => {
        const variableId = idOfKey.get(key);
        if (!variableId) return [];
        return [
          {
            serviceId,
            variableId,
            field,
            customHeaderId: customHeaderId ?? null,
            substitutionId: substitutionId ?? null
          }
        ];
      })
    );

  // A half kept from storage is already in id form, and storing it again leaves it as it is.
  const storeSecretReferences = (secret: Record<string, string>, store: (text: string) => string) =>
    Object.fromEntries(Object.entries(secret).map(([part, text]) => [part, store(text)]));

  // The reference is stored by id, so a variable deleted between the key lookup and the commit only shows
  // up at commit, as the deferred foreign key.
  const VARIABLE_DELETED_DURING_SAVE_MESSAGE =
    "A variable this service uses was deleted while it was being saved. Check its variable references and save again.";

  // Basic has no header name in its config, but the proxy always writes Authorization.
  const credentialHeaderName = (credentialType: AgentVaultCredentialType, headerName?: string): string | null => {
    switch (credentialType) {
      case AgentVaultCredentialType.Bearer:
        return headerName || "Authorization";
      case AgentVaultCredentialType.Basic:
        return "Authorization";
      default:
        return null;
    }
  };

  // The proxy writes the credential last, so a collision costs the header rather than the token; refusing it
  // on write is what tells the author. Either half of a PATCH can introduce one, which is why both are read.
  const assertCustomHeadersDoNotShadowCredential = (
    config: TAgentVaultCredentialConfig,
    customHeaders: { name: string }[] | undefined
  ) => {
    if (!customHeaders?.length) return;
    const credentialHeader = credentialHeaderName(
      config.type,
      config.type === AgentVaultCredentialType.Bearer ? config.headerName : undefined
    );
    if (!credentialHeader) return;

    const clash = customHeaders.find((header) => header.name.toLowerCase() === credentialHeader.toLowerCase());
    if (clash) {
      throw new BadRequestError({
        message: `The ${credentialHeader} header is already set by the credential. Rename the custom header or change the credential.`
      });
    }
  };

  // A bundle the caller cannot reach is a 404, never a 403, which would confirm the id exists.
  const resolveReachableBundle = async ({ projectId, ctx, accessBundleId }: TGetAccessBundleDTO) => {
    const reachability = await getAgentVaultReachability({ permissionService, membershipDAL }, { projectId, ctx });

    const bundle = await agentVaultAccessBundleDAL.findByIdInProject({ id: accessBundleId, projectId });
    // Postgres compares uuids case-insensitively but this list does not, so an uppercase id would miss.
    const unreachable =
      reachability.accessBundleIds && !reachability.accessBundleIds.includes(accessBundleId.toLowerCase());
    if (!bundle || unreachable) {
      throw new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });
    }

    return { bundle, ...reachability };
  };

  const listAccessBundles = async ({ projectId, ctx, ...page }: TListAccessBundlesDTO) => {
    const { permission, accessBundleIds } = await getAgentVaultReachability(
      { permissionService, membershipDAL },
      { projectId, ctx }
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Read,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    return agentVaultAccessBundleDAL.findForList({ projectId, accessBundleIds, ...page });
  };

  const getAccessBundleById = async (dto: TGetAccessBundleDTO) => {
    const { bundle, permission } = await resolveReachableBundle(dto);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Read,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
    // Variables are admin only, so a member's services leave variableReferences out. An empty list would claim
    // they use no variables.
    const canReadVariables = permission.can(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const services = await agentVaultServiceDAL.findByAccessBundleId(bundle.id);
    const { customHeaders, substitutions, variableReferences } = await loadTransformations(
      services.map((service) => service.id),
      undefined,
      { withVariableReferences: canReadVariables }
    );

    return {
      id: bundle.id,
      name: bundle.name,
      description: bundle.description ?? null,
      createdAt: bundle.createdAt,
      updatedAt: bundle.updatedAt,
      services: services.map((service) => {
        const projected = projectService(
          service,
          customHeaders.filter((header) => header.serviceId === service.id),
          substitutions.filter((substitution) => substitution.serviceId === service.id),
          variableReferences.filter((reference) => reference.serviceId === service.id)
        );
        return canReadVariables ? projected : { ...projected, variableReferences: undefined };
      })
    };
  };

  const createAccessBundle = async ({ projectId, ctx, name, description }: TCreateAccessBundleDTO) => {
    const { permission } = await getAgentVaultReachability({ permissionService, membershipDAL }, { projectId, ctx });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Create,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const existing = await agentVaultAccessBundleDAL.findOne({ projectId, name });
    if (existing) {
      throw new BadRequestError({ message: `An access bundle named '${name}' already exists` });
    }

    let creatorColumn: TGrantActorColumn | null = null;
    if (ctx.actor === ActorType.USER) creatorColumn = "actorUserId";
    else if (ctx.actor === ActorType.IDENTITY) creatorColumn = "actorIdentityId";

    const create = () =>
      agentVaultAccessBundleDAL.transaction(async (tx) => {
        const bundle = await agentVaultAccessBundleDAL.create({ projectId, name, description }, tx);

        if (creatorColumn) {
          const direct = await membershipDAL.findOne(
            { scope: AccessScope.Project, scopeProjectId: projectId, [creatorColumn]: ctx.actorId },
            tx
          );
          if (direct) {
            await writeGrants(
              {
                projectId,
                orgId: ctx.actorOrgId,
                accessBundleId: bundle.id,
                actors: [{ actorColumn: creatorColumn, actorId: ctx.actorId }]
              },
              tx
            );
          }
        }

        return bundle;
      });

    try {
      return await create();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestError({ message: `An access bundle named '${name}' already exists` });
      }
      throw err;
    }
  };

  const updateAccessBundle = async ({ accessBundleId, name, description, ...rest }: TUpdateAccessBundleDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    if (name && name !== bundle.name) {
      const existing = await agentVaultAccessBundleDAL.findOne({ projectId: rest.projectId, name });
      if (existing) throw new BadRequestError({ message: `An access bundle named '${name}' already exists` });
    }

    try {
      return await agentVaultAccessBundleDAL.updateById(bundle.id, { name, description });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestError({ message: `An access bundle named '${name}' already exists` });
      }
      throw err;
    }
  };

  const deleteAccessBundle = async ({ accessBundleId, ...rest }: TDeleteAccessBundleDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Delete,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    // Bundle row first: its DELETE holds the row lock addMember takes. Roles cascade.
    return agentVaultAccessBundleDAL.transaction(async (tx) => {
      const deleted = await agentVaultAccessBundleDAL.deleteById(bundle.id, tx);
      await membershipDAL.delete(bundleScope(rest.projectId, bundle.id), tx);
      return deleted;
    });
  };

  const checkHostPatternConflicts = async (
    {
      accessBundleId,
      hostPattern,
      excludeServiceId
    }: {
      accessBundleId: string;
      hostPattern: string;
      excludeServiceId?: string;
    },
    // Without a tx this reads the replica outside any lock, so two creates for the same host both pass.
    tx?: Knex
  ) => {
    const siblings = await agentVaultServiceDAL.findByAccessBundleId(accessBundleId, tx);
    const conflicts = findHostPatternConflicts(
      hostPattern,
      siblings.filter((candidate) => candidate.id !== excludeServiceId)
    );
    if (conflicts.length) {
      throw new BadRequestError({ message: describeConflict(conflicts[0]) });
    }
  };

  const createService = async ({
    accessBundleId,
    name,
    hostPattern,
    allowedMethods,
    allowedPathPrefixes,
    credential,
    customHeaders,
    substitutions,
    ...rest
  }: TCreateServiceDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const existing = await agentVaultServiceDAL.findOne({ accessBundleId: bundle.id, name });
    if (existing) {
      throw new BadRequestError({ message: `A service named '${name}' already exists in this access bundle` });
    }

    await checkHostPatternConflicts({ accessBundleId: bundle.id, hostPattern });

    // Encrypt before the lock: KMS is a network call and the transaction has to stay short.
    const { config, secret } = splitCredential(credential);
    assertCustomHeadersDoNotShadowCredential(config, customHeaders);

    const credentialTexts = credentialReferenceTexts(credential);
    const idOfKey = await resolveVariableKeys(bundle.id, [
      ...credentialTexts,
      ...(customHeaders ?? []).map((header) => ({ label: `The custom header '${header.name}'`, text: header.value })),
      ...(substitutions ?? []).map((substitution) => ({
        label: `The substitution for '${substitution.placeholder}'`,
        text: substitution.value
      }))
    ]);
    const store = (text: string) => toStoredVariableReferences(text, idOfKey);

    const { encryptor } = await getProjectCipher(rest.projectId);
    const seal = (value: string) =>
      encryptor({ plainText: Buffer.from(JSON.stringify({ value: store(value) })) }).cipherTextBlob;

    const encryptedCredential = secret
      ? encryptor({ plainText: Buffer.from(JSON.stringify(storeSecretReferences(secret, store))) }).cipherTextBlob
      : null;
    const customHeaderRows = (customHeaders ?? []).map((header, position) => ({
      name: header.name,
      prefix: header.prefix ?? "",
      position,
      encryptedValue: seal(header.value)
    }));
    const substitutionRows = (substitutions ?? []).map((substitution, position) => ({
      placeholder: substitution.placeholder,
      surfaces: substitution.surfaces,
      position,
      encryptedValue: seal(substitution.value)
    }));

    // The pre-check above is only a fast failure. The authoritative one runs under the bundle row lock,
    // the same lock addMembers takes, because no database constraint can express host-pattern overlap.
    const write = () =>
      agentVaultServiceDAL.transaction(async (tx) => {
        const locked = await agentVaultAccessBundleDAL.lockByIdInProject(
          { id: bundle.id, projectId: rest.projectId },
          tx
        );
        if (!locked) throw new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });

        await checkHostPatternConflicts({ accessBundleId: bundle.id, hostPattern }, tx);

        const created = await agentVaultServiceDAL.create(
          {
            accessBundleId: bundle.id,
            name,
            hostPattern,
            allowedMethods: allowedMethods ?? null,
            allowedPathPrefixes: allowedPathPrefixes ?? null,
            credentialType: credential.type,
            credentialConfig: config,
            encryptedCredential
          },
          tx
        );

        const insertedCustomHeaders = customHeaderRows.length
          ? await agentVaultServiceCustomHeaderDAL.insertMany(
              customHeaderRows.map((row) => ({ ...row, serviceId: created.id })),
              tx
            )
          : [];
        const insertedSubstitutions = substitutionRows.length
          ? await agentVaultServiceSubstitutionDAL.insertMany(
              substitutionRows.map((row) => ({ ...row, serviceId: created.id })),
              tx
            )
          : [];

        const customHeaderIdAt = new Map(insertedCustomHeaders.map((row) => [row.position, row.id]));
        const substitutionIdAt = new Map(insertedSubstitutions.map((row) => [row.position, row.id]));
        const referenceRows = toReferenceRows(created.id, idOfKey, [
          ...credentialTexts,
          ...(customHeaders ?? []).map((header, position) => ({
            field: AgentVaultVariableReferenceField.CustomHeader,
            customHeaderId: customHeaderIdAt.get(position),
            text: header.value
          })),
          ...(substitutions ?? []).map((substitution, position) => ({
            field: AgentVaultVariableReferenceField.Substitution,
            substitutionId: substitutionIdAt.get(position),
            text: substitution.value
          }))
        ]);
        if (referenceRows.length) await agentVaultServiceVariableReferenceDAL.insertMany(referenceRows, tx);
        const variableReferences = referenceRows.length
          ? await agentVaultServiceVariableReferenceDAL.findByServiceIds([created.id], tx)
          : [];

        return { created, insertedCustomHeaders, insertedSubstitutions, variableReferences };
      });

    let result;
    try {
      result = await write();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestError({ message: `A service named '${name}' already exists in this access bundle` });
      }
      if (hasPostgresErrorCode(err, DatabaseErrorCode.ForeignKeyViolation)) {
        throw new BadRequestError({ message: VARIABLE_DELETED_DURING_SAVE_MESSAGE });
      }
      throw err;
    }

    return {
      service: projectService(
        result.created,
        result.insertedCustomHeaders,
        result.insertedSubstitutions,
        result.variableReferences
      ),
      accessBundleName: bundle.name
    };
  };

  const updateService = async ({
    accessBundleId,
    serviceId,
    name,
    hostPattern,
    credential,
    allowedMethods,
    allowedPathPrefixes,
    customHeaders,
    substitutions,
    ...rest
  }: TUpdateServiceDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const service = await agentVaultServiceDAL.findOne({ id: serviceId, accessBundleId: bundle.id });
    if (!service) throw new NotFoundError({ message: `Service with ID '${serviceId}' not found` });

    if (name && name !== service.name) {
      const existing = await agentVaultServiceDAL.findOne({ accessBundleId: bundle.id, name });
      if (existing) {
        throw new BadRequestError({ message: `A service named '${name}' already exists in this access bundle` });
      }
    }

    if (hostPattern && hostPattern !== service.hostPattern) {
      await checkHostPatternConflicts({
        accessBundleId: bundle.id,
        hostPattern,
        excludeServiceId: service.id
      });
    }

    // Only the values that arrived. One left out keeps what is sealed, and so keeps its references.
    const credentialTexts = credential ? credentialReferenceTexts(credential) : [];
    const idOfKey = await resolveVariableKeys(bundle.id, [
      ...credentialTexts,
      ...(customHeaders ?? []).flatMap((header) =>
        header.value === undefined ? [] : [{ label: `The custom header '${header.name}'`, text: header.value }]
      ),
      ...(substitutions ?? []).flatMap((substitution) =>
        substitution.value === undefined
          ? []
          : [{ label: `The substitution for '${substitution.placeholder}'`, text: substitution.value }]
      )
    ]);
    const store = (text: string) => toStoredVariableReferences(text, idOfKey);

    let credentialUpdate = {};
    let replacedCredentialFields: AgentVaultVariableReferenceField[] = [];
    let effectiveCredentialConfig = service.credentialConfig as TAgentVaultCredentialConfig;
    if (credential) {
      const needsStoredSecret =
        credential.type === AgentVaultCredentialType.Basic &&
        service.credentialType === AgentVaultCredentialType.Basic &&
        (credential.username === undefined) !== (credential.password === undefined) &&
        Boolean(service.encryptedCredential);
      const cipher = needsStoredSecret ? await getProjectCipher(rest.projectId) : null;
      const storedSecret = cipher
        ? (JSON.parse(cipher.decryptor({ cipherTextBlob: service.encryptedCredential! }).toString("utf-8")) as Record<
            string,
            string
          >)
        : null;

      const { config, secret } = mergeCredential(credential, service, storedSecret);
      let encryptedCredential: Buffer | null | undefined;
      if (secret === null) encryptedCredential = null;
      if (secret) {
        const { encryptor } = cipher ?? (await getProjectCipher(rest.projectId));
        encryptedCredential = encryptor({
          plainText: Buffer.from(JSON.stringify(storeSecretReferences(secret, store)))
        }).cipherTextBlob;
      }

      // A new type or a pass-through replaces the whole secret, so neither half keeps its references.
      if (secret !== undefined) {
        replacedCredentialFields =
          secret === null || credential.type !== service.credentialType
            ? [AgentVaultVariableReferenceField.CredentialValue, AgentVaultVariableReferenceField.CredentialUsername]
            : credentialTexts.map(({ field }) => field);
      }

      credentialUpdate = {
        credentialType: credential.type,
        credentialConfig: config,
        ...(encryptedCredential === undefined ? {} : { encryptedCredential })
      };
      effectiveCredentialConfig = config;
    }

    const cipherForTransformations =
      customHeaders?.length || substitutions?.length ? await getProjectCipher(rest.projectId) : null;
    const seal = (value: string) =>
      cipherForTransformations!.encryptor({ plainText: Buffer.from(JSON.stringify({ value: store(value) })) })
        .cipherTextBlob;

    const customHeaderWrites: TTransformationWrite<{ name: string; prefix: string }>[] | undefined = customHeaders?.map(
      (header) => ({
        id: header.id,
        naturalKey: header.name.toLowerCase(),
        label: header.name,
        // An omitted prefix is cleared, not kept: it comes back in the response so a caller can resend it,
        // which is the thing a sealed value can never do.
        columns: { name: header.name, prefix: header.prefix ?? "" },
        encryptedValue: header.value === undefined ? undefined : seal(header.value)
      })
    );

    const substitutionWrites:
      | TTransformationWrite<{ placeholder: string; surfaces: AgentVaultSubstitutionSurface[] }>[]
      | undefined = substitutions?.map((substitution) => ({
      id: substitution.id,
      naturalKey: substitution.placeholder,
      label: substitution.placeholder,
      columns: { placeholder: substitution.placeholder, surfaces: substitution.surfaces },
      encryptedValue: substitution.value === undefined ? undefined : seal(substitution.value)
    }));

    // Same lock as create, and below the credential work so no KMS call sits inside the transaction. The
    // re-check only earns its place when the pattern actually changes.
    const write = () =>
      agentVaultServiceDAL.transaction(async (tx) => {
        const locked = await agentVaultAccessBundleDAL.lockByIdInProject(
          { id: bundle.id, projectId: rest.projectId },
          tx
        );
        if (!locked) throw new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });

        if (hostPattern && hostPattern !== service.hostPattern) {
          await checkHostPatternConflicts({ accessBundleId: bundle.id, hostPattern, excludeServiceId: service.id }, tx);
        }

        // Both halves read under the lock and on the primary. The service read above the transaction came off
        // a replica, and stale it would admit the very collision this check exists to stop.
        if (credential || customHeaders) {
          const effectiveCustomHeaders =
            customHeaders ??
            (await agentVaultServiceCustomHeaderDAL.findByServiceIds([service.id], tx)).map((row) => ({
              name: row.name
            }));
          if (!credential) {
            const current = await agentVaultServiceDAL.findById(service.id, tx);
            if (!current) throw new NotFoundError({ message: `Service with ID '${serviceId}' not found` });
            effectiveCredentialConfig = current.credentialConfig as TAgentVaultCredentialConfig;
          }
          assertCustomHeadersDoNotShadowCredential(effectiveCredentialConfig, effectiveCustomHeaders);
        }

        const hasColumnUpdate =
          name !== undefined ||
          hostPattern !== undefined ||
          allowedMethods !== undefined ||
          allowedPathPrefixes !== undefined ||
          Object.keys(credentialUpdate).length > 0;

        const updatedService = hasColumnUpdate
          ? await agentVaultServiceDAL.updateById(
              service.id,
              {
                name,
                hostPattern,
                // `null` clears the restriction, `undefined` leaves the column alone.
                ...(allowedMethods === undefined ? {} : { allowedMethods }),
                ...(allowedPathPrefixes === undefined ? {} : { allowedPathPrefixes }),
                ...credentialUpdate
              },
              tx
            )
          : service;

        // Outside the lock, two concurrent PATCHes both pass the ownership check and the loser's writes no-op.
        const applyDiff = async <TRow extends { id: string; encryptedValue: Buffer }, TColumns>(
          dal: {
            findByServiceIds: (ids: string[], tx?: Knex) => Promise<TRow[]>;
            insertMany: (rows: never[], tx?: Knex) => Promise<TRow[]>;
            updateById: (id: string, columns: never, tx?: Knex) => Promise<TRow>;
            delete: (filter: never, tx?: Knex) => Promise<TRow[]>;
          },
          incoming: TTransformationWrite<TColumns>[] | undefined,
          naturalKeyOfRow: (row: TRow) => string,
          subject: string
        ): Promise<TRow[]> => {
          const existing = await dal.findByServiceIds([service.id], tx);
          if (!incoming) return existing;

          const plan = planTransformationDiff({ existing, incoming, naturalKeyOfRow, subject });

          // Sequential: these share the transaction's single connection, and the schema caps the list at 20.
          // eslint-disable-next-line no-restricted-syntax
          for (const update of plan.updates) {
            // eslint-disable-next-line no-await-in-loop
            await dal.updateById(update.id, update.columns as never, tx);
          }
          if (plan.deleteIds.length) await dal.delete({ $in: { id: plan.deleteIds } } as never, tx);

          const created = plan.creates.length
            ? await dal.insertMany(plan.creates.map((row) => ({ ...row, serviceId: service.id })) as never[], tx)
            : [];

          const updatedById = new Map(plan.updates.map((update) => [update.id, update.columns]));
          const survivors = existing
            .filter((row) => !plan.deleteIds.includes(row.id))
            .map((row) => ({ ...row, ...(updatedById.get(row.id) ?? {}) }) as TRow);

          return [...survivors, ...created].sort(
            (a, b) => (a as unknown as { position: number }).position - (b as unknown as { position: number }).position
          );
        };

        const updatedCustomHeaders = await applyDiff(
          agentVaultServiceCustomHeaderDAL,
          customHeaderWrites,
          (row) => row.name.toLowerCase(),
          "custom header"
        );
        const updatedSubstitutions = await applyDiff(
          agentVaultServiceSubstitutionDAL,
          substitutionWrites,
          (row) => row.placeholder,
          "substitution"
        );

        // Every row's position is its index in the list just written, which is how a value finds its row.
        // A row dropped from the list takes its references with it through the foreign key.
        const customHeaderIdAt = new Map(updatedCustomHeaders.map((row) => [row.position, row.id]));
        const substitutionIdAt = new Map(updatedSubstitutions.map((row) => [row.position, row.id]));
        const rewrittenTargets: (TReferenceTarget & { text: string })[] = [
          ...credentialTexts,
          ...(customHeaders ?? []).flatMap((header, position) =>
            header.value === undefined
              ? []
              : [
                  {
                    field: AgentVaultVariableReferenceField.CustomHeader,
                    customHeaderId: customHeaderIdAt.get(position),
                    text: header.value
                  }
                ]
          ),
          ...(substitutions ?? []).flatMap((substitution, position) =>
            substitution.value === undefined
              ? []
              : [
                  {
                    field: AgentVaultVariableReferenceField.Substitution,
                    substitutionId: substitutionIdAt.get(position),
                    text: substitution.value
                  }
                ]
          )
        ];
        const rewrittenCustomHeaderIds = rewrittenTargets.flatMap((target) =>
          target.customHeaderId ? [target.customHeaderId] : []
        );
        const rewrittenSubstitutionIds = rewrittenTargets.flatMap((target) =>
          target.substitutionId ? [target.substitutionId] : []
        );

        if (replacedCredentialFields.length) {
          await agentVaultServiceVariableReferenceDAL.delete(
            { serviceId: service.id, $in: { field: replacedCredentialFields } },
            tx
          );
        }
        if (rewrittenCustomHeaderIds.length) {
          await agentVaultServiceVariableReferenceDAL.delete({ $in: { customHeaderId: rewrittenCustomHeaderIds } }, tx);
        }
        if (rewrittenSubstitutionIds.length) {
          await agentVaultServiceVariableReferenceDAL.delete({ $in: { substitutionId: rewrittenSubstitutionIds } }, tx);
        }
        const referenceRows = toReferenceRows(service.id, idOfKey, rewrittenTargets);
        if (referenceRows.length) await agentVaultServiceVariableReferenceDAL.insertMany(referenceRows, tx);
        const variableReferences = await agentVaultServiceVariableReferenceDAL.findByServiceIds([service.id], tx);

        return { updatedService, updatedCustomHeaders, updatedSubstitutions, variableReferences };
      });

    let result;
    try {
      result = await write();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestError({ message: `A service named '${name}' already exists in this access bundle` });
      }
      if (hasPostgresErrorCode(err, DatabaseErrorCode.ForeignKeyViolation)) {
        throw new BadRequestError({ message: VARIABLE_DELETED_DURING_SAVE_MESSAGE });
      }
      throw err;
    }

    return {
      service: projectService(
        result.updatedService,
        result.updatedCustomHeaders,
        result.updatedSubstitutions,
        result.variableReferences
      ),
      accessBundleName: bundle.name
    };
  };

  const deleteService = async ({ accessBundleId, serviceId, ...rest }: TDeleteServiceDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const service = await agentVaultServiceDAL.findOne({ id: serviceId, accessBundleId: bundle.id });
    if (!service) throw new NotFoundError({ message: `Service with ID '${serviceId}' not found` });

    // Read before the delete, since CASCADE takes these rows with the service.
    const { customHeaders, substitutions, variableReferences } = await loadTransformations([service.id]);
    const deleted = await agentVaultServiceDAL.deleteById(service.id);
    return {
      service: projectService(deleted, customHeaders, substitutions, variableReferences),
      accessBundleName: bundle.name
    };
  };

  type TProjectCipher = Awaited<ReturnType<typeof getProjectCipher>>;

  const sealVariableValue = (encryptor: TProjectCipher["encryptor"], value: string) =>
    encryptor({ plainText: Buffer.from(JSON.stringify({ value })) }).cipherTextBlob;

  const openVariableValue = (decryptor: TProjectCipher["decryptor"], encryptedValue: Buffer) =>
    (JSON.parse(decryptor({ cipherTextBlob: encryptedValue }).toString("utf-8")) as { value: string }).value;

  // The secret check sits in the projection, so no caller can put a secret value on the wire by passing one.
  const projectVariable = (variable: TAgentVaultVariables, serviceIds: string[], value: string | null) => ({
    id: variable.id,
    accessBundleId: variable.accessBundleId,
    key: variable.key,
    isSecret: variable.isSecret,
    value: variable.isSecret ? null : value,
    serviceIds,
    createdAt: variable.createdAt,
    updatedAt: variable.updatedAt
  });

  const serviceIdsUsing = (references: { variableId: string; serviceId: string }[], variableId: string) => [
    ...new Set(
      references.filter((reference) => reference.variableId === variableId).map((reference) => reference.serviceId)
    )
  ];

  // Variables are admin only, reads included: a member can reach a bundle without seeing what it is built
  // from, and Edit is the action only an admin holds.
  const resolveVariableBundle = async (dto: TGetAccessBundleDTO) => {
    const { bundle, permission } = await resolveReachableBundle(dto);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
    return bundle;
  };

  const duplicateVariableKeyMessage = (key: string) => `A variable named '${key}' already exists in this access bundle`;

  const variableInUseMessage = (key: string, serviceNames: string[]) => {
    const names = serviceNames.map((serviceName) => `'${serviceName}'`).join(", ");
    return serviceNames.length === 1
      ? `The variable '${key}' is used by the service ${names}. Remove it from that service before deleting it.`
      : `The variable '${key}' is used by the services ${names}. Remove it from those services before deleting it.`;
  };

  const listVariables = async (dto: TListVariablesDTO) => {
    const bundle = await resolveVariableBundle(dto);

    const variables = await agentVaultVariableDAL.findByAccessBundleId(bundle.id);
    const [references, cipher] = await Promise.all([
      agentVaultServiceVariableReferenceDAL.findByVariableIds(variables.map((variable) => variable.id)),
      variables.some((variable) => !variable.isSecret) ? getProjectCipher(dto.projectId) : null
    ]);

    return variables.map((variable) =>
      projectVariable(
        variable,
        serviceIdsUsing(references, variable.id),
        cipher && !variable.isSecret ? openVariableValue(cipher.decryptor, variable.encryptedValue) : null
      )
    );
  };

  const createVariable = async ({ accessBundleId, key, value, isSecret, ...rest }: TCreateVariableDTO) => {
    const bundle = await resolveVariableBundle({ ...rest, accessBundleId });

    const { encryptor } = await getProjectCipher(rest.projectId);
    const encryptedValue = sealVariableValue(encryptor, value);

    // Under the bundle lock the count and the key check are authoritative. The unique index is the backstop.
    const write = () =>
      agentVaultVariableDAL.transaction(async (tx) => {
        const locked = await agentVaultAccessBundleDAL.lockByIdInProject(
          { id: bundle.id, projectId: rest.projectId },
          tx
        );
        if (!locked) throw new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });

        const existing = await agentVaultVariableDAL.findKeysByAccessBundleId(bundle.id, tx);
        if (existing.some((variable) => variable.key === key)) {
          throw new BadRequestError({ message: duplicateVariableKeyMessage(key) });
        }
        if (existing.length >= AGENT_VAULT_MAX_VARIABLES) {
          throw new BadRequestError({
            message: `An access bundle can hold at most ${AGENT_VAULT_MAX_VARIABLES} variables. Delete one it no longer uses first.`
          });
        }

        return agentVaultVariableDAL.create({ accessBundleId: bundle.id, key, encryptedValue, isSecret }, tx);
      });

    try {
      return { variable: projectVariable(await write(), [], value), accessBundleName: bundle.name };
    } catch (err) {
      if (isUniqueViolation(err)) throw new BadRequestError({ message: duplicateVariableKeyMessage(key) });
      throw err;
    }
  };

  const updateVariable = async ({ accessBundleId, variableId, key, value, isSecret, ...rest }: TUpdateVariableDTO) => {
    const bundle = await resolveVariableBundle({ ...rest, accessBundleId });

    const variable = await agentVaultVariableDAL.findOne({ id: variableId, accessBundleId: bundle.id });
    if (!variable) throw new NotFoundError({ message: `Variable with ID '${variableId}' not found` });

    const cipher =
      value !== undefined || !(isSecret ?? variable.isSecret) ? await getProjectCipher(rest.projectId) : null;
    const encryptedValue = value === undefined ? undefined : sealVariableValue(cipher!.encryptor, value);

    const write = () =>
      agentVaultVariableDAL.transaction(async (tx) => {
        const locked = await agentVaultAccessBundleDAL.lockByIdInProject(
          { id: bundle.id, projectId: rest.projectId },
          tx
        );
        if (!locked) throw new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });

        const current = await agentVaultVariableDAL.findOne({ id: variable.id, accessBundleId: bundle.id }, tx);
        if (!current) throw new NotFoundError({ message: `Variable with ID '${variableId}' not found` });

        if (key !== undefined && key !== current.key) {
          const clash = await agentVaultVariableDAL.findOne({ accessBundleId: bundle.id, key }, tx);
          if (clash) throw new BadRequestError({ message: duplicateVariableKeyMessage(key) });
        }

        // A rename is this row alone. Sealed fields name the variable by id, so nothing that uses it changes.
        const updated = await agentVaultVariableDAL.updateById(
          current.id,
          { key, isSecret, ...(encryptedValue ? { encryptedValue } : {}) },
          tx
        );
        const references = await agentVaultServiceVariableReferenceDAL.findByVariableIds([current.id], tx);
        return { previous: current, updated, references };
      });

    let result;
    try {
      result = await write();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestError({ message: duplicateVariableKeyMessage(key ?? variable.key) });
      }
      throw err;
    }

    const { previous, updated, references } = result;
    // The flag is re-read under the lock, so it can disagree with the replica read the cipher was chosen by.
    let plainValue: string | null = null;
    if (!updated.isSecret) {
      plainValue =
        value ??
        openVariableValue((cipher ?? (await getProjectCipher(rest.projectId))).decryptor, updated.encryptedValue);
    }

    return {
      variable: projectVariable(updated, serviceIdsUsing(references, updated.id), plainValue),
      previousKey: previous.key,
      previousIsSecret: previous.isSecret,
      accessBundleName: bundle.name
    };
  };

  const deleteVariable = async ({ accessBundleId, variableId, ...rest }: TVariableByIdDTO) => {
    const bundle = await resolveVariableBundle({ ...rest, accessBundleId });

    // The refusal here is the real check, under the lock every service write takes. The deferred foreign key
    // only backs it up, and only raises at commit.
    const remove = () =>
      agentVaultVariableDAL.transaction(async (tx) => {
        const locked = await agentVaultAccessBundleDAL.lockByIdInProject(
          { id: bundle.id, projectId: rest.projectId },
          tx
        );
        if (!locked) throw new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });

        const variable = await agentVaultVariableDAL.findOne({ id: variableId, accessBundleId: bundle.id }, tx);
        if (!variable) throw new NotFoundError({ message: `Variable with ID '${variableId}' not found` });

        const references = await agentVaultServiceVariableReferenceDAL.findByVariableIds([variable.id], tx);
        if (references.length) {
          const services = await agentVaultServiceDAL.find(
            { $in: { id: serviceIdsUsing(references, variable.id) } },
            { tx }
          );
          throw new ConflictError({
            message: variableInUseMessage(
              variable.key,
              services.map((service) => service.name)
            )
          });
        }

        return agentVaultVariableDAL.deleteById(variable.id, tx);
      });

    let deleted: TAgentVaultVariables;
    try {
      deleted = await remove();
    } catch (err) {
      if (hasPostgresErrorCode(err, DatabaseErrorCode.ForeignKeyViolation)) {
        throw new ConflictError({
          message:
            "This variable is still used by a service. Remove it from every service that uses it, then delete it."
        });
      }
      throw err;
    }

    const plainValue = deleted.isSecret
      ? null
      : openVariableValue((await getProjectCipher(rest.projectId)).decryptor, deleted.encryptedValue);
    return { variable: projectVariable(deleted, [], plainValue), accessBundleName: bundle.name };
  };

  const getVariableValue = async ({ accessBundleId, variableId, ...rest }: TVariableByIdDTO) => {
    const bundle = await resolveVariableBundle({ ...rest, accessBundleId });

    const variable = await agentVaultVariableDAL.findOne({ id: variableId, accessBundleId: bundle.id });
    if (!variable) throw new NotFoundError({ message: `Variable with ID '${variableId}' not found` });

    const { decryptor } = await getProjectCipher(rest.projectId);
    return {
      variableId: variable.id,
      key: variable.key,
      value: openVariableValue(decryptor, variable.encryptedValue),
      accessBundleName: bundle.name
    };
  };

  const listMembers = async ({ accessBundleId, search, limit, offset, ...rest }: TListMembersDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
    return agentVaultAccessBundleDAL.findMembers({
      projectId: rest.projectId,
      accessBundleId: bundle.id,
      search,
      limit,
      offset
    });
  };

  // The candidates for a grant are the product's own members, since addMembers refuses anyone else, minus
  // whoever already holds this bundle. A member reaching it only through a granted group stays a
  // candidate: an individual grant is a different thing, and it outlives the group membership.
  const listAvailableMembers = async ({ accessBundleId, search, limit, offset, ...rest }: TListMembersDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
    return agentVaultMemberDAL.findProductMembers({
      projectId: rest.projectId,
      orgId: rest.ctx.actorOrgId,
      actorTypes: ALL_GRANTEE_ACTOR_TYPES,
      search,
      limit,
      offset,
      excludeAccessBundleId: bundle.id
    });
  };

  const addMembers = async ({ accessBundleId, userIds, groupIds, machineIdentityIds, ...rest }: TAddMembersDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const requested = new Map<string, TGrantActor>();
    const byColumn: [TGrantActorColumn, string[]][] = [
      ["actorUserId", userIds],
      ["actorGroupId", groupIds],
      ["actorIdentityId", machineIdentityIds]
    ];
    byColumn.forEach(([actorColumn, ids]) => {
      ids.forEach((actorId) => {
        const actor = { actorColumn, actorId };
        requested.set(actorKey(actor), actor);
      });
    });

    const actors = [...requested.values()];
    await assertActorsInProject({ projectId: rest.projectId, actors });

    // The bundle row lock serializes grants for this bundle, so reading the existing ones inside it is
    // enough to dedupe. The unique index per actor per bundle stays as the backstop, and its violation
    // has to be caught outside the transaction.
    const grant = () =>
      membershipDAL.transaction(async (tx) => {
        const locked = await agentVaultAccessBundleDAL.lockByIdInProject(
          { id: bundle.id, projectId: rest.projectId },
          tx
        );
        if (!locked) throw new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });

        const existing = await membershipDAL.find(bundleScope(rest.projectId, bundle.id), { tx });
        const alreadyGranted = new Set(
          existing.flatMap((row) => {
            if (row.actorUserId) return [actorKey({ actorColumn: "actorUserId", actorId: row.actorUserId })];
            if (row.actorIdentityId)
              return [actorKey({ actorColumn: "actorIdentityId", actorId: row.actorIdentityId })];
            if (row.actorGroupId) return [actorKey({ actorColumn: "actorGroupId", actorId: row.actorGroupId })];
            return [];
          })
        );

        const skipped = actors.filter((actor) => alreadyGranted.has(actorKey(actor))).map(toActorRefFromGrant);
        const toGrant = actors.filter((actor) => !alreadyGranted.has(actorKey(actor)));
        if (!toGrant.length) return { created: [] as TMemberships[], skipped };

        const created = await writeGrants(
          { projectId: rest.projectId, orgId: rest.ctx.actorOrgId, accessBundleId: bundle.id, actors: toGrant },
          tx
        );
        return { created, skipped };
      });

    let outcome: { created: TMemberships[]; skipped: TAgentVaultAccessBundleActorRef[] };
    try {
      outcome = await grant();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestError({ message: "That user, machine identity, or group already has this access bundle" });
      }
      throw err;
    }

    return {
      members: outcome.created.map(toMember),
      skipped: outcome.skipped,
      accessBundleName: bundle.name
    };
  };

  const revokeMembers = async ({
    accessBundleId,
    userIds,
    groupIds,
    machineIdentityIds,
    ...rest
  }: TRevokeMembersDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const requested = new Map<string, TGrantActor>();
    const byColumn: [TGrantActorColumn, string[]][] = [
      ["actorUserId", userIds],
      ["actorGroupId", groupIds],
      ["actorIdentityId", machineIdentityIds]
    ];
    byColumn.forEach(([actorColumn, ids]) => {
      ids.forEach((actorId) => requested.set(actorKey({ actorColumn, actorId }), { actorColumn, actorId }));
    });
    const actors = [...requested.values()];

    // The same row lock the grant path takes, so a revoke cannot race a grant or a bundle delete.
    const outcome = await membershipDAL.transaction(async (tx) => {
      const locked = await agentVaultAccessBundleDAL.lockByIdInProject(
        { id: bundle.id, projectId: rest.projectId },
        tx
      );
      if (!locked) throw new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });

      const heldByKey = new Map<string, TMemberships>();
      await Promise.all(
        byColumn.map(async ([actorColumn, ids]) => {
          if (!ids.length) return;
          const rows = await membershipDAL.find(
            { ...bundleScope(rest.projectId, bundle.id), $in: { [actorColumn]: ids } },
            { tx }
          );
          rows.forEach((row) => {
            const actorId = row[actorColumn];
            if (actorId) heldByKey.set(actorKey({ actorColumn, actorId }), row);
          });
        })
      );

      const skipped = actors.filter((actor) => !heldByKey.has(actorKey(actor))).map(toActorRefFromGrant);
      const held = actors.filter((actor) => heldByKey.has(actorKey(actor)));
      if (!held.length) return { removed: [] as TMemberships[], skipped };

      const rows = held.map((actor) => heldByKey.get(actorKey(actor))!);
      await membershipDAL.delete({ $in: { id: rows.map((row) => row.id) } }, tx);
      return { removed: rows, skipped };
    });

    return {
      members: outcome.removed.map(toMember),
      skipped: outcome.skipped,
      accessBundleName: bundle.name
    };
  };

  return {
    listAccessBundles,
    getAccessBundleById,
    createAccessBundle,
    updateAccessBundle,
    deleteAccessBundle,
    createService,
    updateService,
    deleteService,
    listVariables,
    createVariable,
    updateVariable,
    deleteVariable,
    getVariableValue,
    listMembers,
    listAvailableMembers,
    addMembers,
    revokeMembers
  };
};
