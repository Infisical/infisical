import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import { AccessScope, RESOURCE_SCOPE, ResourceType, TAgentVaultConnections, TMemberships } from "@app/db/schemas";
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
import { AgentVaultCredentialType, AgentVaultResourceRole } from "../agent-vault/agent-vault-enums";
import { getAgentVaultReachability } from "../agent-vault/agent-vault-permission";
import { TAgentVaultAccessBundleDALFactory } from "./agent-vault-access-bundle-dal";
import {
  TAddMembersDTO,
  TAgentVaultCredentialInput,
  TAgentVaultCredentialSummary,
  TAgentVaultCredentialUpdate,
  TCreateAccessBundleDTO,
  TCreateConnectionDTO,
  TDeleteAccessBundleDTO,
  TDeleteConnectionDTO,
  TGetAccessBundleDTO,
  TListAccessBundlesDTO,
  TListMembersDTO,
  TRemoveMemberDTO,
  TUpdateAccessBundleDTO,
  TUpdateConnectionDTO
} from "./agent-vault-access-bundle-types";
import { TAgentVaultConnectionDALFactory } from "./agent-vault-connection-dal";

type TAgentVaultAccessBundleServiceFactoryDep = {
  agentVaultAccessBundleDAL: TAgentVaultAccessBundleDALFactory;
  agentVaultConnectionDAL: TAgentVaultConnectionDALFactory;
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

export const agentVaultAccessBundleServiceFactory = (deps: TAgentVaultAccessBundleServiceFactoryDep) => {
  const {
    agentVaultAccessBundleDAL,
    agentVaultConnectionDAL,
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

  const toMember = (row: TMemberships) => ({
    id: row.id,
    accessBundleId: row.scopeResourceId!,
    userId: row.actorUserId ?? null,
    identityId: row.actorIdentityId ?? null,
    groupId: row.actorGroupId ?? null,
    createdAt: row.createdAt
  });

  type TGrantActorColumn = "actorUserId" | "actorIdentityId" | "actorGroupId";

  type TGrantActor = { actorColumn: TGrantActorColumn; actorId: string };

  const actorKey = ({ actorColumn, actorId }: TGrantActor) => `${actorColumn}:${actorId}`;

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
    stored: TAgentVaultConnections,
    storedSecret: Record<string, string> | null
  ): TCredentialWrite => {
    if (credential.type !== stored.credentialType) {
      if (credential.type === AgentVaultCredentialType.Bearer && credential.value === undefined) {
        throw new BadRequestError({
          message:
            "Changing the credential type to bearer needs the token, because the stored secret belongs to the old type"
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

  const summarizeCredential = (connection: TAgentVaultConnections): TAgentVaultCredentialSummary => {
    const config = connection.credentialConfig as Record<string, string>;
    switch (connection.credentialType as AgentVaultCredentialType) {
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

  const listAccessBundles = async ({ projectId, ctx }: TListAccessBundlesDTO) => {
    const { permission, accessBundleIds } = await getAgentVaultReachability(
      { permissionService, membershipDAL },
      { projectId, ctx }
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Read,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    return agentVaultAccessBundleDAL.findWithCounts({ projectId, accessBundleIds });
  };

  const getAccessBundleById = async (dto: TGetAccessBundleDTO) => {
    const { bundle, permission, isAdmin } = await resolveReachableBundle(dto);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Read,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const connections = await agentVaultConnectionDAL.findByAccessBundleId(bundle.id);
    const members = isAdmin
      ? await agentVaultAccessBundleDAL.findMembers({ projectId: dto.projectId, accessBundleId: bundle.id })
      : undefined;

    return {
      id: bundle.id,
      name: bundle.name,
      description: bundle.description ?? null,
      createdAt: bundle.createdAt,
      connections: connections.map((connection) => ({
        id: connection.id,
        accessBundleId: connection.accessBundleId,
        name: connection.name,
        hostPattern: connection.hostPattern,
        credential: summarizeCredential(connection),
        createdAt: connection.createdAt
      })),
      members
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
      excludeConnectionId
    }: {
      accessBundleId: string;
      hostPattern: string;
      excludeConnectionId?: string;
    },
    // Without a tx this reads the replica outside any lock, so two creates for the same host both pass.
    tx?: Knex
  ) => {
    const siblings = await agentVaultConnectionDAL.findByAccessBundleId(accessBundleId, tx);
    const conflicts = findHostPatternConflicts(
      hostPattern,
      siblings.filter((candidate) => candidate.id !== excludeConnectionId)
    );
    if (conflicts.length) {
      throw new BadRequestError({ message: describeConflict(conflicts[0]) });
    }
  };

  const createConnection = async ({ accessBundleId, name, hostPattern, credential, ...rest }: TCreateConnectionDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const existing = await agentVaultConnectionDAL.findOne({ accessBundleId: bundle.id, name });
    if (existing) {
      throw new BadRequestError({ message: `A connection named '${name}' already exists in this access bundle` });
    }

    await checkHostPatternConflicts({ accessBundleId: bundle.id, hostPattern });

    // Encrypt before the lock: KMS is a network call and the transaction has to stay short.
    const { config, secret } = splitCredential(credential);
    const { encryptor } = await getProjectCipher(rest.projectId);
    const encryptedCredential = secret
      ? encryptor({ plainText: Buffer.from(JSON.stringify(secret)) }).cipherTextBlob
      : null;

    // The pre-check above is only a fast failure. The authoritative one runs under the bundle row lock,
    // the same lock addMembers takes, because no database constraint can express host-pattern overlap.
    const write = () =>
      agentVaultConnectionDAL.transaction(async (tx) => {
        const locked = await agentVaultAccessBundleDAL.lockByIdInProject(
          { id: bundle.id, projectId: rest.projectId },
          tx
        );
        if (!locked) throw new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });

        await checkHostPatternConflicts({ accessBundleId: bundle.id, hostPattern }, tx);

        return agentVaultConnectionDAL.create(
          {
            accessBundleId: bundle.id,
            name,
            hostPattern,
            credentialType: credential.type,
            credentialConfig: config,
            encryptedCredential
          },
          tx
        );
      });

    let connection;
    try {
      connection = await write();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestError({ message: `A connection named '${name}' already exists in this access bundle` });
      }
      throw err;
    }

    return { connection: { ...connection, credential: summarizeCredential(connection) } };
  };

  const updateConnection = async ({
    accessBundleId,
    connectionId,
    name,
    hostPattern,
    credential,
    ...rest
  }: TUpdateConnectionDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const connection = await agentVaultConnectionDAL.findOne({ id: connectionId, accessBundleId: bundle.id });
    if (!connection) throw new NotFoundError({ message: `Connection with ID '${connectionId}' not found` });

    if (name && name !== connection.name) {
      const existing = await agentVaultConnectionDAL.findOne({ accessBundleId: bundle.id, name });
      if (existing) {
        throw new BadRequestError({ message: `A connection named '${name}' already exists in this access bundle` });
      }
    }

    if (hostPattern && hostPattern !== connection.hostPattern) {
      await checkHostPatternConflicts({
        accessBundleId: bundle.id,
        hostPattern,
        excludeConnectionId: connection.id
      });
    }

    let credentialUpdate = {};
    if (credential) {
      const needsStoredSecret =
        credential.type === AgentVaultCredentialType.Basic &&
        connection.credentialType === AgentVaultCredentialType.Basic &&
        (credential.username === undefined) !== (credential.password === undefined) &&
        Boolean(connection.encryptedCredential);
      const cipher = needsStoredSecret ? await getProjectCipher(rest.projectId) : null;
      const storedSecret = cipher
        ? (JSON.parse(
            cipher.decryptor({ cipherTextBlob: connection.encryptedCredential! }).toString("utf-8")
          ) as Record<string, string>)
        : null;

      const { config, secret } = mergeCredential(credential, connection, storedSecret);
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
    }

    // Same lock as create, and below the credential work so no KMS call sits inside the transaction. The
    // re-check only earns its place when the pattern actually changes.
    const write = () =>
      agentVaultConnectionDAL.transaction(async (tx) => {
        const locked = await agentVaultAccessBundleDAL.lockByIdInProject(
          { id: bundle.id, projectId: rest.projectId },
          tx
        );
        if (!locked) throw new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });

        if (hostPattern && hostPattern !== connection.hostPattern) {
          await checkHostPatternConflicts(
            { accessBundleId: bundle.id, hostPattern, excludeConnectionId: connection.id },
            tx
          );
        }

        return agentVaultConnectionDAL.updateById(
          connection.id,
          {
            name,
            hostPattern,
            ...credentialUpdate
          },
          tx
        );
      });

    let updated;
    try {
      updated = await write();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestError({ message: `A connection named '${name}' already exists in this access bundle` });
      }
      throw err;
    }

    return { connection: { ...updated, credential: summarizeCredential(updated) } };
  };

  const deleteConnection = async ({ accessBundleId, connectionId, ...rest }: TDeleteConnectionDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const connection = await agentVaultConnectionDAL.findOne({ id: connectionId, accessBundleId: bundle.id });
    if (!connection) throw new NotFoundError({ message: `Connection with ID '${connectionId}' not found` });

    return agentVaultConnectionDAL.deleteById(connection.id);
  };

  const listMembers = async ({ accessBundleId, ...rest }: TListMembersDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
      ProjectPermissionSub.AgentVaultAccessBundles
    );
    return agentVaultAccessBundleDAL.findMembers({ projectId: rest.projectId, accessBundleId: bundle.id });
  };

  const addMembers = async ({ accessBundleId, members, ...rest }: TAddMembersDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const requested = new Map<string, TGrantActor>();
    members.forEach(({ userId, identityId, groupId }) => {
      const supplied = [userId, identityId, groupId].filter(Boolean);
      if (supplied.length !== 1) {
        throw new BadRequestError({
          message: "Grant an access bundle to exactly one user, machine identity or group per entry"
        });
      }

      let actorColumn: TGrantActorColumn = "actorGroupId";
      if (userId) actorColumn = "actorUserId";
      else if (identityId) actorColumn = "actorIdentityId";
      const actor = { actorColumn, actorId: (userId ?? identityId ?? groupId)! };
      requested.set(actorKey(actor), actor);
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

        const toGrant = actors.filter((actor) => !alreadyGranted.has(actorKey(actor)));
        if (!toGrant.length) return [];

        return writeGrants(
          { projectId: rest.projectId, orgId: rest.ctx.actorOrgId, accessBundleId: bundle.id, actors: toGrant },
          tx
        );
      });

    let created: TMemberships[] = [];
    try {
      created = await grant();
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new BadRequestError({ message: "That user, machine identity or group already has this access bundle" });
      }
      throw err;
    }

    return {
      members: created.map(toMember),
      skippedCount: actors.length - created.length,
      accessBundleName: bundle.name
    };
  };

  const removeMember = async ({ accessBundleId, memberId, ...rest }: TRemoveMemberDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const member = await membershipDAL.findOne({ ...bundleScope(rest.projectId, bundle.id), id: memberId });
    if (!member) throw new NotFoundError({ message: `Access bundle membership with ID '${memberId}' not found` });

    await membershipDAL.deleteById(member.id);
    return { id: member.id, accessBundleName: bundle.name };
  };

  return {
    listAccessBundles,
    getAccessBundleById,
    createAccessBundle,
    updateAccessBundle,
    deleteAccessBundle,
    createConnection,
    updateConnection,
    deleteConnection,
    listMembers,
    addMembers,
    removeMember
  };
};
