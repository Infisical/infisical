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
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
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
import { AgentVaultCredentialType, AgentVaultResourceRole } from "../agent-vault/agent-vault-enums";
import { getAgentVaultReachability } from "../agent-vault/agent-vault-permission";
import { TAgentVaultAccessBundleDALFactory } from "./agent-vault-access-bundle-dal";
import {
  TAddMemberDTO,
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
    "findOne" | "find" | "create" | "delete" | "deleteById" | "transaction" | "findResourceMembershipsForActor"
  >;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create">;
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

  // A grant is a resource-scoped row in the shared memberships table plus one consumer role, so the
  // platform's reapers and FK cascades remove it with the actor. Nothing here cascades from the bundle:
  // scopeResourceId carries no FK, so deleteAccessBundle reaps by hand.
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

  const writeGrant = async (
    {
      projectId,
      orgId,
      accessBundleId,
      actorColumn,
      actorId
    }: { projectId: string; orgId: string; accessBundleId: string; actorColumn: TGrantActorColumn; actorId: string },
    tx: Knex
  ) => {
    const membership = await membershipDAL.create(
      { ...bundleScope(projectId, accessBundleId), scopeOrgId: orgId, [actorColumn]: actorId, isActive: true },
      tx
    );
    await membershipRoleDAL.create({ membershipId: membership.id, role: AgentVaultResourceRole.Consumer }, tx);
    return membership;
  };

  // Grants follow product membership at the same level: a group that is in Agent Vault is granted as a
  // group, and its members mint as themselves. So a person who is in the product only through a group
  // is turned away here as well, but told why, since "not a member" would be wrong.
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

  // A grant to someone outside the Agent Vault project does nothing: reachability is intersected with
  // project membership on every resolve, so the row would sit there looking like access that works.
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

    if (!groupId && (await isInProjectThroughGroup({ projectId, userId, identityId }))) {
      throw new BadRequestError({
        message:
          "That user or machine identity is in Agent Vault through a group. Grant the access bundle to the group, or add them directly under Access Control first."
      });
    }

    throw new BadRequestError({
      message:
        "That user, machine identity or group is not a member of Agent Vault. Add them under Access Control first."
    });
  };

  // Project scope, not org scope: org scope has no cache and costs three DB queries every time.
  const getProjectCipher = (projectId: string) =>
    kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

  // `null` clears the sealed column, `undefined` leaves it exactly as it is. The two are not
  // interchangeable: $decryptCredential in the proxy service treats a NULL secret as passthrough, so a
  // bearer row that lost its secret would stop attaching a credential rather than fail, and the agent's
  // request would leave unauthenticated with nothing in the logs to say why.
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
        // The create schema refuses two empty halves, but a type change reaches here with whatever the
        // patch omitted, and an empty pair seals `Basic ` over a bare colon, which authenticates nobody.
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

  /**
   * The update counterpart: every field is optional, and an absent one keeps what is stored. The
   * create schema is deliberately not reused, because its `.default()`s would turn an omitted
   * headerName into a reset and quietly move a DD-API-KEY credential back onto Authorization.
   */
  const mergeCredential = (
    credential: TAgentVaultCredentialUpdate,
    stored: TAgentVaultConnections,
    storedSecret: Record<string, string> | null
  ): TCredentialWrite => {
    // A different type has no stored config to merge onto, and the sealed secret belongs to the type
    // being replaced, so the credential has to arrive whole.
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
        // Both halves live in the sealed blob, so a patch to either one re-seals the pair with the
        // other half taken from what is stored.
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

  // A bundle the caller cannot reach is a 404, never a 403: a 403 would confirm that the id exists.
  const resolveReachableBundle = async ({ projectId, ctx, accessBundleId }: TGetAccessBundleDTO) => {
    const reachability = await getAgentVaultReachability({ permissionService, membershipDAL }, { projectId, ctx });

    const bundle = await agentVaultAccessBundleDAL.findByIdInProject({ id: accessBundleId, projectId });
    const unreachable = reachability.accessBundleIds && !reachability.accessBundleIds.includes(accessBundleId);
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

    return agentVaultAccessBundleDAL.findForList({ projectId, accessBundleIds });
  };

  const getAccessBundleById = async (dto: TGetAccessBundleDTO) => {
    const { bundle, permission, isAdmin } = await resolveReachableBundle(dto);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Read,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const connections = await agentVaultConnectionDAL.findByAccessBundleId(bundle.id);
    // Members are an administration detail: a member sees the connections and nothing about who else
    // holds the bundle.
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

    // The creator is granted the bundle they just made, as PAM does when a folder is created. Only an
    // admin can create, and an admin already reaches every bundle, so the grant matters the day they are
    // demoted to member. It is written only for a creator who is directly in the product: the grant path
    // refuses individual grants to someone who is in only through a group, and the creator grant follows
    // the same rule, or it would be the one row no removal path reaps once the group goes.
    let creatorColumn: TGrantActorColumn | null = null;
    if (ctx.actor === ActorType.USER) creatorColumn = "actorUserId";
    else if (ctx.actor === ActorType.IDENTITY) creatorColumn = "actorIdentityId";

    return agentVaultAccessBundleDAL.transaction(async (tx) => {
      const bundle = await agentVaultAccessBundleDAL.create({ projectId, name, description }, tx);

      if (creatorColumn) {
        const direct = await membershipDAL.findOne(
          { scope: AccessScope.Project, scopeProjectId: projectId, [creatorColumn]: ctx.actorId },
          tx
        );
        if (direct) {
          await writeGrant(
            {
              projectId,
              orgId: ctx.actorOrgId,
              accessBundleId: bundle.id,
              actorColumn: creatorColumn,
              actorId: ctx.actorId
            },
            tx
          );
        }
      }

      return bundle;
    });
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

    return agentVaultAccessBundleDAL.updateById(bundle.id, { name, description });
  };

  const deleteAccessBundle = async ({ accessBundleId, ...rest }: TDeleteAccessBundleDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Delete,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    // Bundle row first: its DELETE holds the row lock addMember takes, so a concurrent grant either waits
    // and finds no bundle, or landed already and is reaped by the second statement. Roles cascade.
    return agentVaultAccessBundleDAL.transaction(async (tx) => {
      const deleted = await agentVaultAccessBundleDAL.deleteById(bundle.id, tx);
      await membershipDAL.delete(bundleScope(rest.projectId, bundle.id), tx);
      return deleted;
    });
  };

  // Rejects a candidate that shares any normalized host:port with another connection in the same bundle,
  // and warns about the same collision across bundles, where the session's bundle order settles it.
  const checkHostPatternConflicts = async ({
    projectId,
    accessBundleId,
    hostPattern,
    excludeConnectionId
  }: {
    projectId: string;
    accessBundleId: string;
    hostPattern: string;
    excludeConnectionId?: string;
  }) => {
    const candidates = await agentVaultConnectionDAL.findForConflictCheck({ projectId, excludeConnectionId });

    const sameBundle = findHostPatternConflicts(
      hostPattern,
      candidates.filter((candidate) => candidate.accessBundleId === accessBundleId)
    );
    if (sameBundle.length) {
      throw new BadRequestError({ message: describeConflict(sameBundle[0]) });
    }

    return findHostPatternConflicts(
      hostPattern,
      candidates.filter((candidate) => candidate.accessBundleId !== accessBundleId)
    );
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

    const warnings = await checkHostPatternConflicts({
      projectId: rest.projectId,
      accessBundleId: bundle.id,
      hostPattern
    });

    const { config, secret } = splitCredential(credential);
    const { encryptor } = await getProjectCipher(rest.projectId);
    const encryptedCredential = secret
      ? encryptor({ plainText: Buffer.from(JSON.stringify(secret)) }).cipherTextBlob
      : null;

    const connection = await agentVaultConnectionDAL.create({
      accessBundleId: bundle.id,
      name,
      hostPattern,
      credentialType: credential.type,
      credentialConfig: config,
      encryptedCredential
    });

    return { connection: { ...connection, credential: summarizeCredential(connection) }, warnings };
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

    let warnings: Awaited<ReturnType<typeof checkHostPatternConflicts>> = [];
    if (hostPattern && hostPattern !== connection.hostPattern) {
      warnings = await checkHostPatternConflicts({
        projectId: rest.projectId,
        accessBundleId: bundle.id,
        hostPattern,
        excludeConnectionId: connection.id
      });
    }

    // An omitted credential leaves both halves alone. A present one patches the config, and touches the
    // sealed secret only when the payload actually carried part of it.
    let credentialUpdate = {};
    if (credential) {
      // A basic patch naming one half needs the other from the sealed pair, so this is the one place on
      // the write path that opens a stored secret.
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

    const updated = await agentVaultConnectionDAL.updateById(connection.id, {
      name,
      hostPattern,
      ...credentialUpdate
    });

    return { connection: { ...updated, credential: summarizeCredential(updated) }, warnings };
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

  const addMember = async ({ accessBundleId, userId, identityId, groupId, ...rest }: TAddMemberDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const supplied = [userId, identityId, groupId].filter(Boolean);
    if (supplied.length !== 1) {
      throw new BadRequestError({ message: "Grant an access bundle to exactly one user, machine identity or group" });
    }

    await assertActorInProject({ projectId: rest.projectId, userId, identityId, groupId });

    let actorColumn: TGrantActorColumn = "actorGroupId";
    if (userId) actorColumn = "actorUserId";
    else if (identityId) actorColumn = "actorIdentityId";
    const actorId = (userId ?? identityId ?? groupId)!;

    // The shared table's unique index per actor per bundle is the duplicate check, so the catch sits
    // outside the transaction and the rollback has finished before the 400 goes out.
    try {
      const created = await membershipDAL.transaction(async (tx) => {
        const locked = await agentVaultAccessBundleDAL.lockByIdInProject(
          { id: bundle.id, projectId: rest.projectId },
          tx
        );
        if (!locked) throw new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });

        return writeGrant(
          { projectId: rest.projectId, orgId: rest.ctx.actorOrgId, accessBundleId: bundle.id, actorColumn, actorId },
          tx
        );
      });

      // The inserted row, as PAM and the generic member add return it; the bundle's name rides back for
      // the audit event, which pairs every id it records with a label.
      return { ...toMember(created), accessBundleName: bundle.name };
    } catch (err) {
      if (
        err instanceof DatabaseError &&
        (err.error as { code?: string })?.code === DatabaseErrorCode.UniqueViolation
      ) {
        throw new BadRequestError({ message: "That user, machine identity or group already has this access bundle" });
      }
      throw err;
    }
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
    addMember,
    removeMember
  };
};
