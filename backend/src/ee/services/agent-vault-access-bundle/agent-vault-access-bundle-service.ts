import { ForbiddenError } from "@casl/ability";

import { AccessScope, TAgentVaultConnections } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";

import { describeConflict, findHostPatternConflicts } from "../agent-vault/agent-vault-conflict-fns";
import {
  AgentVaultBasicConfigSchema,
  AgentVaultBearerConfigSchema,
  TAgentVaultCredentialConfig
} from "../agent-vault/agent-vault-credential-schemas";
import { AgentVaultCredentialType } from "../agent-vault/agent-vault-enums";
import { getAgentVaultReachability } from "../agent-vault/agent-vault-permission";
import { TAgentVaultAccessBundleMemberDALFactory } from "../agent-vault-member/agent-vault-access-bundle-member-dal";
import { TAgentVaultAccessBundleDALFactory } from "./agent-vault-access-bundle-dal";
import {
  TAddMemberDTO,
  TAgentVaultCredentialInput,
  TAgentVaultCredentialUpdate,
  TAgentVaultCredentialSummary,
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
  agentVaultAccessBundleMemberDAL: TAgentVaultAccessBundleMemberDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  membershipDAL: Pick<TMembershipDALFactory, "findOne">;
};

export type TAgentVaultAccessBundleServiceFactory = ReturnType<typeof agentVaultAccessBundleServiceFactory>;

export const agentVaultAccessBundleServiceFactory = (deps: TAgentVaultAccessBundleServiceFactoryDep) => {
  const {
    agentVaultAccessBundleDAL,
    agentVaultConnectionDAL,
    agentVaultAccessBundleMemberDAL,
    permissionService,
    kmsService,
    membershipDAL
  } = deps;

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

    if (!membership) {
      throw new BadRequestError({
        message:
          "That user, machine identity or group is not a member of Agent Vault. Add them under Access Control first."
      });
    }
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
        const config = AgentVaultBasicConfigSchema.parse({
          username: credential.username,
          hasPassword: credential.password.length > 0
        });
        return { config: { type: credential.type, ...config }, secret: { password: credential.password } };
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
  const mergeCredential = (credential: TAgentVaultCredentialUpdate, stored: TAgentVaultConnections): TCredentialWrite => {
    // A different type has no stored config to merge onto, and the sealed secret belongs to the type
    // being replaced, so the credential has to arrive whole.
    if (credential.type !== stored.credentialType) {
      if (credential.type === AgentVaultCredentialType.Bearer && credential.value === undefined) {
        throw new BadRequestError({
          message: "Changing the credential type to bearer needs the token, because the stored secret belongs to the old type"
        });
      }
      return splitCredential(
        credential.type === AgentVaultCredentialType.Basic
          ? { type: credential.type, username: credential.username ?? "", password: credential.password ?? "" }
          : (credential as TAgentVaultCredentialInput)
      );
    }

    const prev = (stored.credentialConfig ?? {}) as { headerName?: string; headerPrefix?: string; username?: string; hasPassword?: boolean };

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
        const username = credential.username ?? prev.username ?? "";
        // Rows written before hasPassword existed always carried a non-empty password, so they read as true.
        const hasPassword = credential.password === undefined ? (prev.hasPassword ?? true) : credential.password.length > 0;
        if (!username && !hasPassword) {
          throw new BadRequestError({ message: "A basic credential needs a username, a password, or both" });
        }
        return {
          config: { type: credential.type, username, hasPassword },
          secret: credential.password === undefined ? undefined : { password: credential.password }
        };
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
        return {
          type: AgentVaultCredentialType.Basic,
          username: config.username,
          hasPassword: Boolean(config.hasPassword ?? true)
        };
      default:
        return { type: AgentVaultCredentialType.Passthrough };
    }
  };

  // A bundle the caller cannot reach is a 404, never a 403: a 403 would confirm that the id exists.
  const resolveReachableBundle = async ({ projectId, ctx, accessBundleId }: TGetAccessBundleDTO) => {
    const reachability = await getAgentVaultReachability(
      { permissionService, agentVaultAccessBundleMemberDAL },
      { projectId, ctx }
    );

    const bundle = await agentVaultAccessBundleDAL.findByIdInProject({ id: accessBundleId, projectId });
    const unreachable = reachability.accessBundleIds && !reachability.accessBundleIds.includes(accessBundleId);
    if (!bundle || unreachable) {
      throw new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });
    }

    return { bundle, ...reachability };
  };

  const listAccessBundles = async ({ projectId, ctx }: TListAccessBundlesDTO) => {
    const { permission, accessBundleIds } = await getAgentVaultReachability(
      { permissionService, agentVaultAccessBundleMemberDAL },
      { projectId, ctx }
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Read,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const bundles = await agentVaultAccessBundleDAL.findForList({ projectId, accessBundleIds });
    const memberCounts = await agentVaultAccessBundleMemberDAL.countByAccessBundleIds(bundles.map((b) => b.id));

    return bundles.map((bundle) => ({ ...bundle, memberCount: memberCounts[bundle.id] ?? 0 }));
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
    const members = isAdmin ? await agentVaultAccessBundleMemberDAL.findByAccessBundleId(bundle.id) : undefined;

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
        credential: summarizeCredential(connection)
      })),
      members
    };
  };

  const createAccessBundle = async ({ projectId, ctx, name, description }: TCreateAccessBundleDTO) => {
    const { permission } = await getAgentVaultReachability(
      { permissionService, agentVaultAccessBundleMemberDAL },
      { projectId, ctx }
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Create,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const existing = await agentVaultAccessBundleDAL.findOne({ projectId, name });
    if (existing) {
      throw new BadRequestError({ message: `An access bundle named '${name}' already exists` });
    }

    return agentVaultAccessBundleDAL.create({ projectId, name, description });
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

    return agentVaultAccessBundleDAL.deleteById(bundle.id);
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
    // sealed secret only when the payload actually carried it.
    let credentialUpdate = {};
    if (credential) {
      const { config, secret } = mergeCredential(credential, connection);
      credentialUpdate = {
        credentialType: credential.type,
        credentialConfig: config,
        ...(secret === undefined
          ? {}
          : {
              encryptedCredential: secret
                ? (await getProjectCipher(rest.projectId)).encryptor({
                    plainText: Buffer.from(JSON.stringify(secret))
                  }).cipherTextBlob
                : null
            })
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
    return agentVaultAccessBundleMemberDAL.findByAccessBundleId(bundle.id);
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

    const existing = await agentVaultAccessBundleMemberDAL.findOne({
      accessBundleId: bundle.id,
      ...(userId ? { userId } : {}),
      ...(identityId ? { identityId } : {}),
      ...(groupId ? { groupId } : {})
    });
    if (existing) {
      throw new BadRequestError({ message: "That user, machine identity or group already has this access bundle" });
    }

    // The inserted row, as PAM and the generic member add return it. Re-reading the list here would go to
    // the replica and could miss the row we just wrote; the frontend refetches the list it renders anyway.
    return agentVaultAccessBundleMemberDAL.create({
      accessBundleId: bundle.id,
      userId,
      identityId,
      groupId
    });
  };

  const removeMember = async ({ accessBundleId, memberId, ...rest }: TRemoveMemberDTO) => {
    const { bundle, permission } = await resolveReachableBundle({ ...rest, accessBundleId });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.ManageMembers,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const member = await agentVaultAccessBundleMemberDAL.findOne({ id: memberId, accessBundleId: bundle.id });
    if (!member) throw new NotFoundError({ message: `Access bundle membership with ID '${memberId}' not found` });

    return agentVaultAccessBundleMemberDAL.deleteById(member.id);
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
