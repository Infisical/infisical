import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, ForbiddenRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectFolderGrantDALFactory } from "@app/services/project-folder-grant/project-folder-grant-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { expandSecretReferencesFactory } from "@app/services/secret-v2-bridge/secret-reference-fns";
import { TSecretV2BridgeDALFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-dal";

import { agentPolicyCredentialDALFactory, agentPolicyRuleDALFactory } from "../agent-policy/agent-policy-child-dals";
import { TAgentPolicyDALFactory } from "../agent-policy/agent-policy-dal";
import { TAgentProxyDALFactory } from "../agent-proxy/agent-proxy-dal";
import { TAgentProxyCaServiceFactory } from "../agent-proxy-ca/agent-proxy-ca-service";
import { TLicenseServiceFactory } from "../license/license-service";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "../permission/project-permission";
import { TUserPolicyDALFactory, TUserPolicyRuleDALFactory } from "../user-policy/user-policy-dal";
import { TAgentSessionDALFactory } from "./agent-session-dal";

export type TAgentSessionServiceFactory = ReturnType<typeof agentSessionServiceFactory>;

type TAgentSessionServiceFactoryDep = {
  agentSessionDAL: TAgentSessionDALFactory;
  agentPolicyDAL: Pick<TAgentPolicyDALFactory, "findByAgent">;
  agentPolicyRuleDAL: Pick<ReturnType<typeof agentPolicyRuleDALFactory>, "findByPolicyIds">;
  agentPolicyCredentialDAL: Pick<ReturnType<typeof agentPolicyCredentialDALFactory>, "findByPolicyIds">;
  userPolicyDAL: Pick<TUserPolicyDALFactory, "findByUser" | "findProjectMemberUserIds">;
  userPolicyRuleDAL: Pick<TUserPolicyRuleDALFactory, "findByPolicyIds">;
  agentProxyDAL: Pick<TAgentProxyDALFactory, "findById">;
  agentProxyCaService: Pick<TAgentProxyCaServiceFactory, "getRootCa">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findById" | "find">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "findOne" | "findByFolderId">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  orgDAL: Pick<TOrgDALFactory, "findOrgById">;
  projectFolderGrantDAL: Pick<TProjectFolderGrantDALFactory, "find">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

const SESSION_TOKEN_PREFIX = "ist";

// Sessions are minted per agent run and never expire, so the list is capped rather than paginated: what
// an operator wants from it is the recent picture, and the ordering already puts that first.
const MAX_LISTED_SESSIONS = 200;

const hashToken = (token: string) => crypto.nativeCrypto.createHash("sha256").update(token).digest("hex");

export const agentSessionServiceFactory = ({
  agentSessionDAL,
  agentPolicyDAL,
  agentPolicyRuleDAL,
  agentPolicyCredentialDAL,
  userPolicyDAL,
  userPolicyRuleDAL,
  agentProxyDAL,
  agentProxyCaService,
  identityDAL,
  projectDAL,
  folderDAL,
  secretV2BridgeDAL,
  kmsService,
  orgDAL,
  projectFolderGrantDAL,
  licenseService,
  permissionService
}: TAgentSessionServiceFactoryDep) => {
  const $checkLicense = async (orgId: string) => {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.secretsBrokering) {
      throw new BadRequestError({
        message: "Failed to use secrets brokering due to plan restriction. Upgrade your plan to use agent policies."
      });
    }
  };

  // A session is agent-policy state at runtime, so it is read and revoked with the same permission the
  // policies themselves use rather than a subject of its own.
  const $assertPolicyPermission = async (
    actor: OrgServiceActor,
    projectId: string,
    action: ProjectPermissionActions
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });
    ForbiddenError.from(permission).throwUnlessCan(action, ProjectPermissionSub.AgentPolicies);
  };

  // Resolves the email an agent hands us to exactly one user in the agent's org. users.email is neither
  // unique nor mandatory (username is the unique login), so the org membership is what disambiguates,
  // and an email matching two members is refused rather than guessed.
  const $resolveUserByEmail = async (orgId: string, email: string) => {
    const normalized = email.trim().toLowerCase();
    const matches = await agentSessionDAL.findOrgUsersByEmail(orgId, normalized);

    if (!matches.length) {
      throw new NotFoundError({
        message: `No member of this organization has the email "${email}". Invite them before an agent can act on their behalf.`
      });
    }
    if (matches.length > 1) {
      throw new BadRequestError({
        message: `The email "${email}" matches more than one member of this organization, so the agent cannot act on their behalf. Ask an admin to resolve the duplicate accounts.`
      });
    }
    return matches[0];
  };

  const mintSession = async (
    { projectId, userEmail }: { projectId: string; userEmail: string },
    actor: OrgServiceActor
  ) => {
    await $checkLicense(actor.orgId);

    if (actor.type !== ActorType.IDENTITY) {
      throw new ForbiddenRequestError({ message: "Only a machine identity marked as an agent can start a session" });
    }

    const identity = await identityDAL.findById(actor.id);
    if (!identity || identity.orgId !== actor.orgId) {
      throw new NotFoundError({ message: "Machine identity not found in this organization" });
    }
    if (!identity.isAgent) {
      throw new ForbiddenRequestError({
        message: `Machine identity "${identity.name}" is not marked as an agent. Enable the Agent option on the identity to let it start sessions on a user's behalf.`
      });
    }

    const project = await projectDAL.findById(projectId);
    if (!project || project.orgId !== actor.orgId) {
      throw new NotFoundError({ message: `Project with ID "${projectId}" not found` });
    }

    const user = await $resolveUserByEmail(actor.orgId, userEmail);

    // Each mint is its own session row. Tokens do not expire, so re-minting must not invalidate a token
    // an agent is already running with; the caller is expected to cache the token (per Slack thread, for
    // example) rather than mint per message.
    const token = `${SESSION_TOKEN_PREFIX}_${crypto.randomBytes(32).toString("base64url")}`;
    await agentSessionDAL.create({
      tokenHash: hashToken(token),
      identityId: identity.id,
      userId: user.id,
      projectId
    });

    // Placeholders come from the agent's own policies: they are what the agent puts on the wire, and
    // whether a given request is actually allowed is only knowable per request, at the proxy.
    const policies = await agentPolicyDAL.findByAgent(projectId, identity.id);
    const credentials = await agentPolicyCredentialDAL.findByPolicyIds(policies.map((policy) => policy.id));

    const placeholders = credentials
      .filter((credential) => credential.placeholderKey && credential.placeholderValue)
      .map((credential) => ({
        key: credential.placeholderKey as string,
        value: credential.placeholderValue as string
      }));

    const duplicateKeys = placeholders
      .map((placeholder) => placeholder.key)
      .filter((key, index, all) => all.indexOf(key) !== index);
    if (duplicateKeys.length) {
      logger.warn(
        `Agent session has policies that share an environment variable name [identityId=${identity.id}] [projectId=${projectId}] [keys=${[...new Set(duplicateKeys)].join(",")}]`
      );
    }

    const rootCa = await agentProxyCaService.getRootCa(actor);

    return {
      token,
      user: { id: user.id, email: user.email ?? null, username: user.username },
      placeholders,
      proxyCaCertificate: rootCa.certificate
    };
  };

  const revokeSession = async ({ token }: { token: string }, actor: OrgServiceActor) => {
    const session = await agentSessionDAL.findOne({ tokenHash: hashToken(token) });
    if (!session) {
      throw new NotFoundError({ message: "Session not found" });
    }
    if (session.identityId !== actor.id) {
      throw new ForbiddenRequestError({ message: "Only the agent that started this session can revoke it" });
    }
    await agentSessionDAL.updateById(session.id, { revokedAt: new Date() });
  };

  const listSessions = async ({ projectId }: { projectId: string }, actor: OrgServiceActor) => {
    await $checkLicense(actor.orgId);
    await $assertPolicyPermission(actor, projectId, ProjectPermissionActions.Read);

    const sessions = await agentSessionDAL.findByProjectId(projectId, MAX_LISTED_SESSIONS);

    return sessions.map((session) => ({
      id: session.id,
      identityId: session.identityId,
      agentName: session.agentName,
      // An agent that lost its flag keeps its sessions in the table, but resolveSession refuses them, so
      // the list says so rather than showing a session that cannot actually broker anything.
      isAgentEnabled: Boolean(session.isAgent),
      userId: session.userId,
      userEmail: (session.userEmail as string | null) ?? null,
      username: session.userUsername,
      firstName: (session.userFirstName as string | null) ?? null,
      lastName: (session.userLastName as string | null) ?? null,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt ?? null,
      revokedAt: session.revokedAt ?? null
    }));
  };

  // The human counterpart to revokeSession: an operator killing an agent's session from the UI rather
  // than the agent ending its own. Revoking twice is not an error, so a double click cannot 404.
  const revokeSessionById = async ({ sessionId }: { sessionId: string }, actor: OrgServiceActor) => {
    await $checkLicense(actor.orgId);

    const session = await agentSessionDAL.findById(sessionId);
    if (!session) {
      throw new NotFoundError({ message: `Agent session with ID "${sessionId}" not found` });
    }
    await $assertPolicyPermission(actor, session.projectId, ProjectPermissionActions.Delete);

    const revoked = session.revokedAt
      ? session
      : await agentSessionDAL.updateById(session.id, { revokedAt: new Date() });

    return {
      id: revoked.id,
      identityId: revoked.identityId,
      userId: revoked.userId,
      projectId: revoked.projectId,
      revokedAt: revoked.revokedAt ?? null
    };
  };

  // Reads the referenced secret values directly. The agent proxy holds no project permissions of its
  // own; the permission check happened when the policy was written, where the author had to hold
  // ReadValue on every secret they attached.
  const $resolveCredentialValues = async (
    projectId: string,
    credentials: { id: string; environment?: unknown; secretPath: string; secretKey: string }[]
  ) => {
    const values = new Map<string, string>();
    if (!credentials.length) return values;

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    const decryptSecretValue = (value?: Buffer | null) =>
      value ? decryptor({ cipherTextBlob: value }).toString() : "";

    const project = await projectDAL.findById(projectId);
    const { expandSecretReferences } = expandSecretReferencesFactory({
      projectId,
      decryptSecretValue,
      secretDAL: secretV2BridgeDAL,
      folderDAL,
      canExpandValue: () => true,
      actorOrgId: project?.orgId,
      orgDAL,
      licenseService,
      projectFolderGrantDAL,
      projectDAL,
      kmsService
    });

    // Sequential: a policy references a handful of secrets, and each lookup is a folder plus a row.
    for await (const credential of credentials) {
      const environment = credential.environment as string;
      const folder = await folderDAL.findBySecretPath(projectId, environment, credential.secretPath);
      const secret = folder
        ? await secretV2BridgeDAL.findOne({ folderId: folder.id, key: credential.secretKey })
        : undefined;

      if (!folder || !secret) {
        // Dropped rather than sent empty: an empty Authorization header reads as a real request upstream.
        logger.warn(
          `Agent policy credential no longer resolves to a secret [projectId=${projectId}] [environment=${environment}] [secretPath=${credential.secretPath}] [secretKey=${credential.secretKey}]`
        );
      } else {
        const raw = decryptSecretValue(secret.encryptedValue);
        const expanded = await expandSecretReferences({
          environment,
          secretPath: credential.secretPath,
          skipMultilineEncoding: secret.skipMultilineEncoding,
          value: raw,
          secretKey: credential.secretKey
        });
        values.set(credential.id, expanded || raw);
      }
    }

    return values;
  };

  // The proxy's read. Everything is resolved live so revocation needs no cache invalidation: losing the
  // agent flag, leaving the project, or having the policy deleted all take effect on the next refresh.
  const resolveSession = async ({ token, agentProxyId }: { token: string; agentProxyId: string }) => {
    const agentProxy = await agentProxyDAL.findById(agentProxyId);
    if (!agentProxy) {
      throw new NotFoundError({ message: "Agent proxy not found" });
    }

    const session = await agentSessionDAL.findOne({ tokenHash: hashToken(token) });
    if (!session || session.revokedAt) {
      throw new UnauthorizedError({ message: "Session token is not valid" });
    }

    const project = await projectDAL.findById(session.projectId);
    if (!project || project.orgId !== agentProxy.orgId) {
      throw new UnauthorizedError({ message: "Session token is not valid for this agent proxy" });
    }

    await $checkLicense(agentProxy.orgId);

    const identity = await identityDAL.findById(session.identityId);
    if (!identity?.isAgent) {
      throw new UnauthorizedError({ message: "The agent for this session is no longer enabled" });
    }

    const stillMember = await userPolicyDAL.findProjectMemberUserIds(session.projectId, [session.userId]);
    if (!stillMember.length) {
      throw new UnauthorizedError({ message: "The user for this session no longer has access to this project" });
    }

    const [agentPolicies, userPolicies] = await Promise.all([
      agentPolicyDAL.findByAgent(session.projectId, session.identityId),
      userPolicyDAL.findByUser(session.projectId, session.userId)
    ]);

    const [agentRules, userRules, credentials] = await Promise.all([
      agentPolicyRuleDAL.findByPolicyIds(agentPolicies.map((policy) => policy.id)),
      userPolicyRuleDAL.findByPolicyIds(userPolicies.map((policy) => policy.id)),
      agentPolicyCredentialDAL.findByPolicyIds(agentPolicies.map((policy) => policy.id))
    ]);

    const values = await $resolveCredentialValues(session.projectId, credentials);

    await agentSessionDAL.updateById(session.id, { lastUsedAt: new Date() });

    return {
      session: {
        id: session.id,
        identityId: identity.id,
        agentName: identity.name,
        userId: session.userId,
        projectId: session.projectId
      },
      allowedHosts: agentProxy.allowedHosts ?? [],
      agentPolicies: agentPolicies.map((policy) => ({
        id: policy.id,
        name: policy.name,
        target: policy.target,
        rules: agentRules
          .filter((rule) => rule.policyId === policy.id)
          .map((rule) => ({ hostPattern: rule.hostPattern, methods: rule.methods })),
        credentials: credentials
          .filter((credential) => credential.policyId === policy.id)
          .flatMap((credential) => {
            const value = values.get(credential.id);
            // A credential whose secret has since been deleted is dropped rather than sent as an empty
            // string: an empty Authorization header looks like a valid request to the upstream.
            if (value === undefined) return [];
            return [
              {
                role: credential.role,
                headerName: credential.headerName ?? null,
                headerPrefix: credential.headerPrefix ?? null,
                headerPurpose: credential.headerPurpose ?? null,
                placeholderValue: credential.placeholderValue ?? null,
                substitutionSurfaces: credential.substitutionSurfaces ?? [],
                value
              }
            ];
          })
      })),
      userPolicies: userPolicies.map((policy) => ({
        id: policy.id,
        name: policy.name,
        target: policy.target,
        rules: userRules
          .filter((rule) => rule.policyId === policy.id)
          .map((rule) => ({ hostPattern: rule.hostPattern, methods: rule.methods }))
      }))
    };
  };

  return {
    mintSession,
    revokeSession,
    revokeSessionById,
    listSessions,
    resolveSession
  };
};
