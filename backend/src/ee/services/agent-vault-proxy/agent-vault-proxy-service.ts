import { ForbiddenError } from "@casl/ability";

import { ActionProjectType, OrgMembershipStatus, ProjectMembershipRole, TAgentVaultProxies } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultProxyActions,
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { PgSqlLock } from "@app/keystore/keystore";
import {
  BadRequestError,
  ForbiddenRequestError,
  InternalServerError,
  NotFoundError,
  UnauthorizedError
} from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { isUniqueViolation } from "../agent-vault/agent-vault-db-error-fns";
import { AgentVaultCredentialType, AgentVaultTrafficPolicy } from "../agent-vault/agent-vault-enums";
import { findReachableAccessBundleIds, liveGroupIdsFrom } from "../agent-vault/agent-vault-permission";
import { expandStoredVariableReferences, findStoredVariableIds } from "../agent-vault/agent-vault-variable-fns";
import { TAgentVaultServiceCustomHeaderDALFactory } from "../agent-vault-access-bundle/agent-vault-service-custom-header-dal";
import { TAgentVaultServiceSubstitutionDALFactory } from "../agent-vault-access-bundle/agent-vault-service-substitution-dal";
import { TAgentVaultSessionDALFactory } from "../agent-vault-session/agent-vault-session-dal";
import { hashSessionToken } from "../agent-vault-session/agent-vault-session-fns";
import { TAgentVaultSessionLogConfigDALFactory } from "../agent-vault-session-log/agent-vault-session-log-config-dal";
import {
  getSessionLogEntitlement,
  TSessionLogLicenseService
} from "../agent-vault-session-log/agent-vault-session-log-license-fns";
import { openSessionLogKey } from "../agent-vault-session-log/agent-vault-session-log-secrets";
import { getEffectiveSessionLogConfig } from "../agent-vault-session-log/agent-vault-session-log-storage-fns";
import { TAgentVaultVariableDALFactory } from "../agent-vault-variable/agent-vault-variable-dal";
import {
  mintAgentVaultProxyJwt,
  RESOURCE_TYPE_AGENT_VAULT_PROXY
} from "../resource-auth-method/resource-auth-method-fns";
import { TResourceAuthMethodServiceFactory } from "../resource-auth-method/resource-auth-method-service";
import { generateProxyRootCa, parseRootCaCertificate } from "./agent-vault-ca-fns";
import { TAgentVaultProxyDALFactory } from "./agent-vault-proxy-dal";
import {
  TAgentVaultProxyConfig,
  TAgentVaultProxyScoped,
  TBootstrapProxyDTO,
  TCreateProxyDTO,
  THeartbeatDTO,
  TListProxiesDTO,
  TProxyByIdDTO,
  TProxyRootCa,
  TResolvedService,
  TResolveSessionDTO,
  TUpdateProxyDTO
} from "./agent-vault-proxy-types";
import { TAgentVaultResolveDALFactory } from "./agent-vault-resolve-dal";

export const AGENT_VAULT_MAX_PROXIES_PER_ORG = 10;

// Health is derived from the last heartbeat and the poll interval, never stored.
const HEARTBEAT_MISSES_BEFORE_UNHEALTHY = 3;

type TAgentVaultProxyServiceFactoryDep = {
  agentVaultProxyDAL: TAgentVaultProxyDALFactory;
  agentVaultResolveDAL: TAgentVaultResolveDALFactory;
  agentVaultServiceCustomHeaderDAL: Pick<TAgentVaultServiceCustomHeaderDALFactory, "findByServiceIds">;
  agentVaultServiceSubstitutionDAL: Pick<TAgentVaultServiceSubstitutionDALFactory, "findByServiceIds">;
  agentVaultVariableDAL: Pick<TAgentVaultVariableDALFactory, "findValuesForResolve">;
  agentVaultSessionDAL: Pick<TAgentVaultSessionDALFactory, "findByTokenHash">;
  agentVaultSessionLogConfigDAL: Pick<TAgentVaultSessionLogConfigDALFactory, "findOne" | "findByProjectIdFromPrimary">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
  orgDAL: Pick<TOrgDALFactory, "findEffectiveOrgMembership">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  licenseService: TSessionLogLicenseService;
  resourceAuthMethodService: Pick<TResourceAuthMethodServiceFactory, "initAtCreate" | "revokeAccess">;
};

export type TAgentVaultProxyServiceFactory = ReturnType<typeof agentVaultProxyServiceFactory>;

export const agentVaultProxyServiceFactory = ({
  agentVaultProxyDAL,
  agentVaultResolveDAL,
  agentVaultServiceCustomHeaderDAL,
  agentVaultServiceSubstitutionDAL,
  agentVaultVariableDAL,
  agentVaultSessionDAL,
  agentVaultSessionLogConfigDAL,
  membershipDAL,
  orgDAL,
  permissionService,
  kmsService,
  licenseService,
  resourceAuthMethodService
}: TAgentVaultProxyServiceFactoryDep) => {
  const isHealthy = (proxy: Pick<TAgentVaultProxies, "heartbeat" | "pollInterval" | "heartbeatTTL">) => {
    if (!proxy.heartbeat) return false;
    // Judged against the interval the proxy is running, not the one an admin may have just saved: it
    // only learns a new interval on its next poll, which is still scheduled at the old one. Lowering
    // the interval would otherwise report a live proxy as unreachable until that poll landed.
    const interval = proxy.heartbeatTTL ?? proxy.pollInterval;
    return proxy.heartbeat.getTime() > Date.now() - interval * HEARTBEAT_MISSES_BEFORE_UNHEALTHY * 1000;
  };

  const toConfig = (proxy: TAgentVaultProxies): TAgentVaultProxyConfig => ({
    trafficPolicy: proxy.trafficPolicy as AgentVaultTrafficPolicy,
    allowedHosts: proxy.allowedHosts ?? null,
    pollInterval: proxy.pollInterval
  });

  const toMemberView = (proxy: TAgentVaultProxies) => ({
    id: proxy.id,
    name: proxy.name,
    heartbeat: proxy.heartbeat ?? null,
    isHealthy: isHealthy(proxy),
    rootCaFingerprint: proxy.rootCaFingerprint ?? null,
    rootCaExpiresAt: proxy.rootCaExpiresAt ?? null
  });

  const toAdminView = (proxy: TAgentVaultProxies) => ({
    ...toMemberView(proxy),
    ...toConfig(proxy),
    createdAt: proxy.createdAt
  });

  const $authorize = async (
    { projectId, ctx }: TAgentVaultProxyScoped,
    action: ProjectPermissionAgentVaultProxyActions
  ) => {
    const { permission, hasRole } = await permissionService.getProjectPermission({
      actor: ctx.actor,
      actorId: ctx.actorId,
      projectId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId,
      actionProjectType: ActionProjectType.AgentVault
    });
    ForbiddenError.from(permission).throwUnlessCan(action, ProjectPermissionSub.AgentVaultProxies);
    return { isAdmin: hasRole(ProjectMembershipRole.Admin) };
  };

  const $findProxyOr404 = async ({ projectId, proxyId }: { projectId: string; proxyId: string }) => {
    const proxy = await agentVaultProxyDAL.findByIdInProject({ id: proxyId, projectId });
    if (!proxy) throw new NotFoundError({ message: `Proxy with ID '${proxyId}' not found` });
    return proxy;
  };

  const getProxyForAuth = (proxyId: string) => agentVaultProxyDAL.findByIdWithOrg(proxyId);

  const $sealRootCaKey = async (projectId: string, privateKey: string) => {
    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    return encryptor({ plainText: Buffer.from(privateKey) }).cipherTextBlob;
  };

  const $openRootCa = async (proxy: TAgentVaultProxies): Promise<TProxyRootCa | null> => {
    if (!proxy.rootCaCertificate || !proxy.encryptedRootCaPrivateKey) return null;
    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: proxy.projectId
    });
    return {
      certificate: proxy.rootCaCertificate,
      privateKey: decryptor({ cipherTextBlob: proxy.encryptedRootCaPrivateKey }).toString()
    };
  };

  // Key generation is CPU-bound and the KMS may be remote, so a CA is always made before any write. Create and
  // rotate record its fingerprint too, so it can be pinned before any start; a start serving another CA replaces it.
  const $newRootCa = async (projectId: string) => {
    const generated = await generateProxyRootCa();
    return {
      privateKey: generated.privateKey,
      stored: {
        rootCaCertificate: generated.certificate,
        encryptedRootCaPrivateKey: await $sealRootCaKey(projectId, generated.privateKey)
      },
      reported: {
        rootCaFingerprint: generated.fingerprint,
        rootCaExpiresAt: generated.expiresAt
      }
    };
  };

  // Every proxy created or rotated gets a CA. Only proxies enrolled before that reach the fill-in path, and
  // several of their starts can race: storeRootCaIfMissing lets one win and the rest read its CA back. A
  // rotation can also land while the CA is being made, and its CA must never reach the old token.
  // recorded: this call already wrote the fingerprint, so the caller has nothing left to record.
  const $getOrCreateRootCa = async (
    proxy: TAgentVaultProxies
  ): Promise<{ rootCa: TProxyRootCa; recorded: boolean }> => {
    const existing = await $openRootCa(proxy);
    if (existing) return { rootCa: existing, recorded: false };

    const { stored, reported, privateKey } = await $newRootCa(proxy.projectId);
    const filled = await agentVaultProxyDAL.storeRootCaIfMissing(proxy.id, proxy.tokenVersion, {
      ...stored,
      ...reported
    });
    if (filled) return { rootCa: { certificate: stored.rootCaCertificate, privateKey }, recorded: true };

    // Read on the primary, inside a transaction: the replica may not have the winner's CA yet.
    const winner = await agentVaultProxyDAL.transaction((tx) => agentVaultProxyDAL.findById(proxy.id, tx));
    if (!winner) throw new UnauthorizedError({ message: "This proxy no longer exists" });
    if (winner.tokenVersion !== proxy.tokenVersion) {
      throw new UnauthorizedError({ name: "ProxyTokenRejected", message: "Agent Vault proxy token has been revoked" });
    }
    const opened = await $openRootCa(winner);
    if (!opened) throw new InternalServerError({ message: "Failed to load this proxy's certificate authority" });
    return { rootCa: opened, recorded: false };
  };

  const listProxies = async ({ search, orderBy, orderDirection, limit, offset, ...dto }: TListProxiesDTO) => {
    const { isAdmin } = await $authorize(dto, ProjectPermissionAgentVaultProxyActions.Read);
    const { proxies, totalCount } = await agentVaultProxyDAL.findForList({
      projectId: dto.projectId,
      search,
      orderBy,
      orderDirection,
      limit,
      offset
    });
    return { proxies: proxies.map((proxy) => (isAdmin ? toAdminView(proxy) : toMemberView(proxy))), totalCount };
  };

  const $resourceActor = (ctx: TCreateProxyDTO["ctx"]) => ({
    type: ctx.actor,
    id: ctx.actorId,
    orgId: ctx.actorOrgId,
    rootOrgId: ctx.actorOrgId,
    parentOrgId: ctx.actorOrgId,
    authMethod: ctx.actorAuthMethod
  });

  const $signProxyToken = (proxyId: string, orgId: string, tokenVersion: number) =>
    mintAgentVaultProxyJwt({ agentVaultProxyId: proxyId, orgId, tokenVersion, accessTokenTTL: 0 });

  const createProxy = async ({ projectId, ctx, name, ...settings }: TCreateProxyDTO) => {
    await $authorize({ projectId, ctx }, ProjectPermissionAgentVaultProxyActions.Create);

    const existing = await agentVaultProxyDAL.findOne({ projectId, name });
    if (existing) throw new BadRequestError({ message: `A proxy named '${name}' already exists` });

    const { stored, reported } = await $newRootCa(projectId);
    const rootCa = { ...stored, ...reported };

    const create = () =>
      agentVaultProxyDAL.transaction(async (tx) => {
        // Serialised per project so two creates at once can't both slip under the cap.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.CreateAgentVaultProxy(projectId)]);
        if ((await agentVaultProxyDAL.countByProjectId(projectId, tx)) >= AGENT_VAULT_MAX_PROXIES_PER_ORG) {
          throw new BadRequestError({
            message: `Agent Vault allows up to ${AGENT_VAULT_MAX_PROXIES_PER_ORG} proxies per organization. Delete one you no longer use to add another.`
          });
        }

        // tokenVersion starts at 1: Revoke Access only counts a resource as revocable once it is above 0.
        const created = await agentVaultProxyDAL.create(
          {
            projectId,
            name,
            trafficPolicy: settings.trafficPolicy ?? AgentVaultTrafficPolicy.AnyHost,
            allowedHosts: settings.allowedHosts ?? null,
            pollInterval: settings.pollInterval ?? 60,
            tokenVersion: 1,
            ...rootCa
          },
          tx
        );

        await resourceAuthMethodService.initAtCreate(
          { resource: { type: RESOURCE_TYPE_AGENT_VAULT_PROXY, id: created.id }, authMethod: { method: "token" } },
          tx
        );

        const withOrg = await agentVaultProxyDAL.findByIdWithOrg(created.id, tx);
        if (!withOrg) throw new InternalServerError({ message: "Failed to create the proxy" });
        return withOrg;
      });

    let proxy;
    try {
      proxy = await create();
    } catch (err) {
      if (isUniqueViolation(err)) throw new BadRequestError({ message: `A proxy named '${name}' already exists` });
      throw err;
    }

    return { proxy: toAdminView(proxy), proxyToken: $signProxyToken(proxy.id, proxy.orgId, proxy.tokenVersion) };
  };

  // One UPDATE bumps tokenVersion and swaps the CA, so no token ever pairs with the wrong CA. Two rotations at
  // once queue on the row lock, and each response carries the version and CA its own UPDATE returned.
  const rotateProxyToken = async ({ projectId, ctx, proxyId }: TProxyByIdDTO) => {
    await $authorize({ projectId, ctx }, ProjectPermissionAgentVaultProxyActions.IssueToken);
    const proxy = await $findProxyOr404({ projectId, proxyId });

    const { stored, reported } = await $newRootCa(proxy.projectId);

    const rotated = await agentVaultProxyDAL.transaction(async (tx) => {
      const updated = await agentVaultProxyDAL.updateById(
        proxy.id,
        {
          $incr: { tokenVersion: 1 },
          heartbeat: null,
          heartbeatTTL: null,
          ...stored,
          ...reported
        },
        tx
      );
      if (!updated) throw new NotFoundError({ message: `Proxy with ID '${proxyId}' not found` });
      const withOrg = await agentVaultProxyDAL.findByIdWithOrg(proxy.id, tx);
      if (!withOrg) throw new NotFoundError({ message: `Proxy with ID '${proxyId}' not found` });
      return withOrg;
    });

    return {
      proxy: toAdminView(rotated),
      proxyToken: $signProxyToken(rotated.id, rotated.orgId, rotated.tokenVersion)
    };
  };

  const updateProxy = async ({ projectId, ctx, proxyId, name, ...settings }: TUpdateProxyDTO) => {
    await $authorize({ projectId, ctx }, ProjectPermissionAgentVaultProxyActions.Edit);
    const proxy = await $findProxyOr404({ projectId, proxyId });

    if (name && name !== proxy.name) {
      const existing = await agentVaultProxyDAL.findOne({ projectId, name });
      if (existing) throw new BadRequestError({ message: `A proxy named '${name}' already exists` });
    }

    try {
      const updated = await agentVaultProxyDAL.updateById(proxy.id, { name, ...settings });
      return toAdminView(updated);
    } catch (err) {
      if (isUniqueViolation(err)) throw new BadRequestError({ message: `A proxy named '${name}' already exists` });
      throw err;
    }
  };

  const deleteProxy = async ({ projectId, ctx, proxyId }: TProxyByIdDTO) => {
    await $authorize({ projectId, ctx }, ProjectPermissionAgentVaultProxyActions.Delete);
    const proxy = await $findProxyOr404({ projectId, proxyId });
    await agentVaultProxyDAL.deleteById(proxy.id);
    return { id: proxy.id, name: proxy.name };
  };

  const revokeProxyAccess = async ({ projectId, ctx, proxyId }: TProxyByIdDTO) => {
    await $authorize({ projectId, ctx }, ProjectPermissionAgentVaultProxyActions.Revoke);
    const proxy = await $findProxyOr404({ projectId, proxyId });
    await resourceAuthMethodService.revokeAccess({
      resource: { type: RESOURCE_TYPE_AGENT_VAULT_PROXY, id: proxy.id },
      actor: $resourceActor(ctx)
    });
    return toAdminView({ ...proxy, heartbeat: null });
  };

  // Every proxy calls this on start. One serving its own CA reports it and gets none back; either way the row
  // ends up showing the CA the most recent start serves.
  const bootstrap = async ({ proxyId, tokenVersion, servedCaCertificate }: TBootstrapProxyDTO) => {
    const proxy = await agentVaultProxyDAL.findByIdWithOrg(proxyId);
    if (!proxy) throw new UnauthorizedError({ message: "This proxy no longer exists" });
    // The auth check ran on an earlier read; a rotation landing in between must not hand the old token the new CA.
    if (proxy.tokenVersion !== tokenVersion) {
      throw new UnauthorizedError({ name: "ProxyTokenRejected", message: "Agent Vault proxy token has been revoked" });
    }

    const servedCa = servedCaCertificate ? parseRootCaCertificate(servedCaCertificate) : null;
    const infisicalCa = servedCa ? null : await $getOrCreateRootCa(proxy);
    const reported = servedCa ?? parseRootCaCertificate((infisicalCa as { rootCa: TProxyRootCa }).rootCa.certificate);

    // Tied to the checked version, so a start whose token was rotated in between can't overwrite the rotation.
    if (!infisicalCa?.recorded && proxy.rootCaFingerprint !== reported.fingerprint) {
      const [recorded] = await agentVaultProxyDAL.update(
        { id: proxy.id, tokenVersion },
        { rootCaFingerprint: reported.fingerprint, rootCaExpiresAt: reported.expiresAt }
      );
      if (!recorded) {
        throw new UnauthorizedError({
          name: "ProxyTokenRejected",
          message: "Agent Vault proxy token has been revoked"
        });
      }
    }

    return { proxyId: proxy.id, name: proxy.name, config: toConfig(proxy), rootCa: infisicalCa?.rootCa };
  };

  const heartbeat = async ({ proxyId }: THeartbeatDTO) => {
    const proxy = await agentVaultProxyDAL.recordHeartbeat(proxyId);
    if (!proxy) throw new UnauthorizedError({ message: "This proxy no longer exists" });
    return { config: toConfig(proxy) };
  };

  const $decryptCredential = (
    row: { credentialType: string; credentialConfig: unknown; encryptedCredential: Buffer | null },
    decryptor: ((input: { cipherTextBlob: Buffer }) => Buffer) | null
  ): TResolvedService["credential"] => {
    const config = (row.credentialConfig ?? {}) as Record<string, string>;
    if (row.credentialType === AgentVaultCredentialType.Passthrough || !row.encryptedCredential) {
      return { type: "passthrough" };
    }
    if (!decryptor) throw new InternalServerError({ message: "Failed to resolve the session's credentials" });

    const secret = JSON.parse(decryptor({ cipherTextBlob: row.encryptedCredential }).toString("utf-8")) as Record<
      string,
      string
    >;

    if (row.credentialType === AgentVaultCredentialType.Bearer) {
      return {
        type: "bearer",
        headerName: config.headerName,
        headerPrefix: config.headerPrefix,
        value: secret.value
      };
    }
    return { type: "basic", username: secret.username ?? "", password: secret.password ?? "" };
  };

  // The ids come out of the decrypted fields rather than the reference rows, so a service saved mid-poll can
  // never leave the two describing different versions of a field. An id with nothing behind it stays as text:
  // dropping the service instead would also drop its method and path restrictions.
  const $expandVariableReferences = async ({
    sessionId,
    projectId,
    services,
    decryptValue
  }: {
    sessionId: string;
    projectId: string;
    services: TResolvedService[];
    decryptValue: (encryptedValue: Buffer) => string;
  }): Promise<TResolvedService[]> => {
    const sealedTextsOf = ({ credential, customHeaders, substitutions }: TResolvedService) => [
      ...(credential.type === AgentVaultCredentialType.Bearer ? [credential.value] : []),
      ...(credential.type === AgentVaultCredentialType.Basic ? [credential.username, credential.password] : []),
      ...customHeaders.map((header) => header.value),
      ...substitutions.map((substitution) => substitution.value)
    ];

    const variableIds = [
      ...new Set(services.flatMap((service) => sealedTextsOf(service).flatMap(findStoredVariableIds)))
    ];
    if (!variableIds.length) return services;

    const variables = new Map(
      (await agentVaultVariableDAL.findValuesForResolve({ variableIds, projectId })).map((variable) => [
        variable.id,
        variable
      ])
    );

    const opened = new Map<string, string>();
    const unresolvedServiceIds = new Set<string>();

    const expanded = services.map((service) => {
      const valueOf = (variableId: string) => {
        // The lookup is scoped to the session's project, so a stored id never reaches another org's variable.
        const variable = variables.get(variableId);
        if (!variable) {
          unresolvedServiceIds.add(service.id);
          return undefined;
        }
        let value = opened.get(variableId);
        if (value === undefined) {
          value = decryptValue(variable.encryptedValue);
          opened.set(variableId, value);
        }
        return value;
      };
      const expand = (text: string) => expandStoredVariableReferences(text, valueOf);

      let { credential } = service;
      if (credential.type === AgentVaultCredentialType.Bearer) {
        credential = { ...credential, value: expand(credential.value) };
      }
      // A typed username is trimmed on save, and a username can't start or end with a space (RFC 8265), so one a
      // variable fills in is trimmed too. Every other field keeps its spaces, as it does when typed.
      if (credential.type === AgentVaultCredentialType.Basic) {
        credential = {
          ...credential,
          username: expand(credential.username).trim(),
          password: expand(credential.password)
        };
      }

      return {
        ...service,
        credential,
        customHeaders: service.customHeaders.map((header) => ({ ...header, value: expand(header.value) })),
        substitutions: service.substitutions.map((substitution) => ({
          ...substitution,
          value: expand(substitution.value)
        }))
      };
    });

    if (unresolvedServiceIds.size) {
      logger.error(
        `agentVaultResolve: stored variable reference with no variable [sessionId=${sessionId}] [serviceIds=${[...unresolvedServiceIds].join(",")}]`
      );
    }
    return expanded;
  };

  /** The only endpoint that decrypts a credential. The proxy's JWT authorizes; the session token is a selector. */
  const resolveSession = async ({ proxyId, orgId, sessionToken, hasSessionLogKey }: TResolveSessionDTO) => {
    const session = await agentVaultSessionDAL.findByTokenHash(hashSessionToken(sessionToken));
    if (!session) throw new NotFoundError({ message: "Session not found" });

    // A mismatch is 404, not 403, so a proxy cannot probe another tenant for session ids.
    const proxy = await agentVaultProxyDAL.findByIdWithOrg(proxyId);
    if (!proxy || proxy.projectId !== session.projectId || proxy.orgId !== orgId) {
      throw new NotFoundError({ message: "Session not found" });
    }

    if (session.revokedAt) throw new UnauthorizedError({ message: "This session has been revoked" });
    if (session.expiresAt && session.expiresAt <= new Date()) {
      throw new UnauthorizedError({ message: "This session has expired" });
    }
    // The actor columns are SET NULL so the row outlives its owner for history. A null id must not reach the
    // lookups below: knex compiles `where col = null` to `IS NULL`, which matches every user row and made an
    // ownerless session resolve as an admin.
    if (!session.userId && !session.identityId) {
      throw new UnauthorizedError({ message: "The identity this session belonged to has been deleted" });
    }

    const actor = session.userId
      ? { type: ActorType.USER as const, id: session.userId }
      : { type: ActorType.IDENTITY as const, id: session.identityId! };

    // Deactivation writes isActive on the org-scope membership row, which getProjectPermission never reads.
    const orgMembership = await orgDAL.findEffectiveOrgMembership({
      actorType: actor.type,
      actorId: actor.id,
      orgId,
      status: OrgMembershipStatus.Accepted
    });
    if (!orgMembership?.isActive) {
      throw new UnauthorizedError({
        message: "The identity this session belongs to is no longer active in this organization"
      });
    }

    // The role is re-derived here, never trusted from mint, and it has to be a live role: a time-limited one
    // leaves its row behind when it lapses. actorAuthMethod is passed as null *explicitly* — validateOrgSSO
    // throws on `undefined` but passes on `null`, and the session row stores no auth method.
    let isAdmin: boolean;
    let liveGroupIds: string[];
    try {
      const { permission, hasRole, memberships } = await permissionService.getProjectPermission({
        actor: actor.type,
        actorId: actor.id,
        projectId: session.projectId,
        actorAuthMethod: null,
        actorOrgId: orgId,
        actionProjectType: ActionProjectType.AgentVault
      });
      if (!permission.can(ProjectPermissionAgentVaultSessionActions.Read, ProjectPermissionSub.AgentVaultSessions)) {
        throw new UnauthorizedError({ message: "The role this session's actor held has expired" });
      }
      isAdmin = hasRole(ProjectMembershipRole.Admin);
      liveGroupIds = liveGroupIdsFrom(memberships);
    } catch (error) {
      // A 403 reads to the proxy as "Infisical is unreachable", which would keep a removed member's agent
      // running through its grace window.
      if (error instanceof ForbiddenRequestError && error.name === "ProjectMembershipNotFound") {
        throw new UnauthorizedError({ message: "The actor no longer has Agent Vault access" });
      }
      throw error;
    }

    const accessBundleIds = isAdmin
      ? null
      : await findReachableAccessBundleIds(membershipDAL, {
          projectId: session.projectId,
          actor,
          groupIds: liveGroupIds
        });

    const rows = await agentVaultResolveDAL.findResolvableServices({
      sessionId: session.id,
      projectId: session.projectId,
      accessBundleIds
    });

    const serviceIds = rows.map((row) => row.id);
    const [customHeaderRows, substitutionRows] = await Promise.all([
      agentVaultServiceCustomHeaderDAL.findByServiceIds(serviceIds),
      agentVaultServiceSubstitutionDAL.findByServiceIds(serviceIds)
    ]);

    const sessionLogConfig = await getEffectiveSessionLogConfig({ agentVaultSessionLogConfigDAL }, session.projectId, {
      fromPrimary: false
    });
    const entitlement =
      sessionLogConfig?.enabled && Boolean(session.encryptedSessionLogKey)
        ? (await getSessionLogEntitlement(licenseService, proxy.orgId, sessionLogConfig.storage.type)).entitlement
        : "unlicensed";
    // While the plan can't be confirmed, a proxy that already holds the key keeps recording, and no key goes out.
    const sessionLogsEnabled = entitlement === "licensed" || (entitlement === "unknown" && hasSessionLogKey);
    const sessionLogKeyNeeded = entitlement === "licensed" && !hasSessionLogKey;

    // A bundle of pass-through services has nothing sealed, so deriving the project data key would be
    // a kms_keys read (or an external KMS round trip) per resolve for nothing.
    const hasSealedValue =
      rows.some((row) => row.encryptedCredential) ||
      customHeaderRows.length > 0 ||
      substitutionRows.length > 0 ||
      sessionLogKeyNeeded;
    const decryptor = hasSealedValue
      ? (
          await kmsService.createCipherPairWithDataKey({
            type: KmsDataKey.SecretManager,
            projectId: session.projectId
          })
        ).decryptor
      : null;

    const $decryptValue = (encryptedValue: Buffer) => {
      if (!decryptor) throw new InternalServerError({ message: "Failed to resolve the session's credentials" });
      return (JSON.parse(decryptor({ cipherTextBlob: encryptedValue }).toString("utf-8")) as { value: string }).value;
    };

    const decryptedServices: TResolvedService[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      accessBundleName: row.accessBundleName,
      hostPattern: row.hostPattern,
      allowedMethods: row.allowedMethods,
      allowedPathPrefixes: row.allowedPathPrefixes,
      credential: $decryptCredential(row, decryptor),
      customHeaders: customHeaderRows
        .filter((header) => header.serviceId === row.id)
        .map((header) => ({ name: header.name, prefix: header.prefix, value: $decryptValue(header.encryptedValue) })),
      substitutions: substitutionRows
        .filter((substitution) => substitution.serviceId === row.id)
        .map((substitution) => ({
          placeholder: substitution.placeholder,
          surfaces: substitution.surfaces,
          value: $decryptValue(substitution.encryptedValue)
        }))
    }));

    const services = await $expandVariableReferences({
      sessionId: session.id,
      projectId: session.projectId,
      services: decryptedServices,
      decryptValue: $decryptValue
    });

    // A key that can't be opened turns logs off for this session instead of cutting the agent off from its services.
    const $sessionLogs = (): { enabled: boolean; sessionKey: string | null } => {
      if (!sessionLogKeyNeeded || !session.encryptedSessionLogKey) {
        return { enabled: sessionLogsEnabled, sessionKey: null };
      }
      try {
        const sessionKey = openSessionLogKey({
          sessionId: session.id,
          payload: decryptor!({ cipherTextBlob: session.encryptedSessionLogKey })
        }).toString("base64");
        return { enabled: sessionLogsEnabled, sessionKey };
      } catch (error) {
        logger.error(
          error,
          `agentVaultResolve: could not open the session log key, session logs are off for this session [sessionId=${session.id}] [proxyId=${proxyId}]`
        );
        return { enabled: false, sessionKey: null };
      }
    };
    const sessionLogs = $sessionLogs();

    logger.info(
      `agentVaultResolve: resolved [sessionId=${session.id}] [proxyId=${proxyId}] [services=${services.length}]`
    );

    return {
      sessionId: session.id,
      expiresAt: session.expiresAt ?? null,
      services,
      sessionLogs
    };
  };

  return {
    getProxyForAuth,
    listProxies,
    createProxy,
    rotateProxyToken,
    updateProxy,
    deleteProxy,
    revokeProxyAccess,
    bootstrap,
    heartbeat,
    resolveSession
  };
};
