import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import {
  AccessScope,
  RESOURCE_SCOPE,
  ResourceType,
  TAgentVaultServiceCustomHeaders,
  TAgentVaultServices,
  TAgentVaultServiceSubstitutions,
  TMemberships
} from "@app/db/schemas";
import { TIdentityGroupMembershipDALFactory } from "@app/ee/services/group/identity-group-membership-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
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
  AgentVaultSubstitutionSurface
} from "../agent-vault/agent-vault-enums";
import { getAgentVaultReachability } from "../agent-vault/agent-vault-permission";
import { TAgentVaultAccessBundleActorRef, TAgentVaultAccessBundleDALFactory } from "./agent-vault-access-bundle-dal";
import {
  TAddMembersDTO,
  TAgentVaultCredentialInput,
  TAgentVaultCredentialSummary,
  TAgentVaultCredentialUpdate,
  TCreateAccessBundleDTO,
  TCreateServiceDTO,
  TDeleteAccessBundleDTO,
  TDeleteServiceDTO,
  TGetAccessBundleDTO,
  TListAccessBundlesDTO,
  TListMembersDTO,
  TRevokeMembersDTO,
  TUpdateAccessBundleDTO,
  TUpdateServiceDTO
} from "./agent-vault-access-bundle-types";
import { TAgentVaultServiceCustomHeaderDALFactory } from "./agent-vault-service-custom-header-dal";
import { TAgentVaultServiceDALFactory } from "./agent-vault-service-dal";
import { TAgentVaultServiceSubstitutionDALFactory } from "./agent-vault-service-substitution-dal";
import { planTransformationDiff, TTransformationWrite } from "./agent-vault-transformation-fns";

type TAgentVaultAccessBundleServiceFactoryDep = {
  agentVaultAccessBundleDAL: TAgentVaultAccessBundleDALFactory;
  agentVaultServiceDAL: TAgentVaultServiceDALFactory;
  agentVaultServiceCustomHeaderDAL: TAgentVaultServiceCustomHeaderDALFactory;
  agentVaultServiceSubstitutionDAL: TAgentVaultServiceSubstitutionDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  membershipDAL: Pick<
    TMembershipDALFactory,
    "findOne" | "find" | "insertMany" | "delete" | "deleteById" | "transaction" | "findResourceMembershipsForActor"
  >;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "insertMany">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "find">;
};

export type TAgentVaultAccessBundleServiceFactory = ReturnType<typeof agentVaultAccessBundleServiceFactory>;

// The old shape capped the array at 100 entries; the cap moves here now that the body is three lists.
export const AGENT_VAULT_MAX_GRANTEES = 100;

export const agentVaultAccessBundleServiceFactory = (deps: TAgentVaultAccessBundleServiceFactoryDep) => {
  const {
    agentVaultAccessBundleDAL,
    agentVaultServiceDAL,
    agentVaultServiceCustomHeaderDAL,
    agentVaultServiceSubstitutionDAL,
    permissionService,
    kmsService,
    membershipDAL,
    membershipRoleDAL,
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

  // Built by hand rather than spread, so the sealed columns stay off the wire even if the response schema is
  // later loosened.
  const projectService = (
    service: TAgentVaultServices,
    customHeaders: TAgentVaultServiceCustomHeaders[],
    substitutions: TAgentVaultServiceSubstitutions[]
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
    createdAt: service.createdAt,
    updatedAt: service.updatedAt
  });

  const loadTransformations = async (serviceIds: string[], tx?: Knex) => {
    const [customHeaders, substitutions] = await Promise.all([
      agentVaultServiceCustomHeaderDAL.findByServiceIds(serviceIds, tx),
      agentVaultServiceSubstitutionDAL.findByServiceIds(serviceIds, tx)
    ]);
    return { customHeaders, substitutions };
  };

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

    const services = await agentVaultServiceDAL.findByAccessBundleId(bundle.id);
    const { customHeaders, substitutions } = await loadTransformations(services.map((service) => service.id));

    return {
      id: bundle.id,
      name: bundle.name,
      description: bundle.description ?? null,
      createdAt: bundle.createdAt,
      updatedAt: bundle.updatedAt,
      services: services.map((service) =>
        projectService(
          service,
          customHeaders.filter((header) => header.serviceId === service.id),
          substitutions.filter((substitution) => substitution.serviceId === service.id)
        )
      )
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

    const { encryptor } = await getProjectCipher(rest.projectId);
    const seal = (value: string) => encryptor({ plainText: Buffer.from(JSON.stringify({ value })) }).cipherTextBlob;

    const encryptedCredential = secret
      ? encryptor({ plainText: Buffer.from(JSON.stringify(secret)) }).cipherTextBlob
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

        return { created, insertedCustomHeaders, insertedSubstitutions };
      });

    let result;
    try {
      result = await write();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestError({ message: `A service named '${name}' already exists in this access bundle` });
      }
      throw err;
    }

    return {
      service: projectService(result.created, result.insertedCustomHeaders, result.insertedSubstitutions)
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

    let credentialUpdate = {};
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
        encryptedCredential = encryptor({ plainText: Buffer.from(JSON.stringify(secret)) }).cipherTextBlob;
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
      cipherForTransformations!.encryptor({ plainText: Buffer.from(JSON.stringify({ value })) }).cipherTextBlob;

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

        return { updatedService, updatedCustomHeaders, updatedSubstitutions };
      });

    let result;
    try {
      result = await write();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestError({ message: `A service named '${name}' already exists in this access bundle` });
      }
      throw err;
    }

    return {
      service: projectService(result.updatedService, result.updatedCustomHeaders, result.updatedSubstitutions)
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
    const { customHeaders, substitutions } = await loadTransformations([service.id]);
    const deleted = await agentVaultServiceDAL.deleteById(service.id);
    return projectService(deleted, customHeaders, substitutions);
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

    // The same bundle row lock the grant path takes, so a revoke cannot race a concurrent grant or a
    // bundle delete and leave a row behind.
    const outcome = await membershipDAL.transaction(async (tx) => {
      const locked = await agentVaultAccessBundleDAL.lockByIdInProject(
        { id: bundle.id, projectId: rest.projectId },
        tx
      );
      if (!locked) throw new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });

      const existing = await membershipDAL.find(bundleScope(rest.projectId, bundle.id), { tx });
      const heldByKey = new Map(
        existing.flatMap((row) => {
          const found = byColumn.find(([actorColumn]) => row[actorColumn]);
          if (!found) return [];
          const actor = { actorColumn: found[0], actorId: row[found[0]]! };
          return [[actorKey(actor), row] as const];
        })
      );

      // An actor who holds no grant is reported rather than refused: the end state the caller asked for
      // is already true, which is what makes a bulk revoke safe to retry.
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
    listMembers,
    addMembers,
    revokeMembers
  };
};
