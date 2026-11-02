import { ForbiddenError } from "@casl/ability";

import {
  ActionProjectType,
  OrgMembershipStatus,
  ProjectMembershipRole,
  TAgentVaultProxies,
  TAgentVaultSessions
} from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultProxyActions,
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { PgSqlLock } from "@app/keystore/keystore";
import {
  BadRequestError,
  ConflictError,
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
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAgentVaultServiceCustomHeaderDALFactory } from "../agent-vault-access-bundle/agent-vault-service-custom-header-dal";
import { TAgentVaultServiceSubstitutionDALFactory } from "../agent-vault-access-bundle/agent-vault-service-substitution-dal";
import { TAgentVaultDelegationDALFactory } from "../agent-vault-delegation/agent-vault-delegation-dal";
import {
  AGENT_VAULT_SERVICE_MOVED_MESSAGE,
  TAgentVaultOauthServiceFactory
} from "../agent-vault-oauth/agent-vault-oauth-service";
import { toResolvedOauthCredential } from "../agent-vault-oauth/agent-vault-oauth-token-fns";
import { TAgentVaultOauthConfig } from "../agent-vault-oauth/agent-vault-oauth-types";
import { TAgentVaultPersonalValueDALFactory } from "../agent-vault-personal-value/agent-vault-personal-value-dal";
import { TAgentVaultSessionLogConfigDALFactory } from "../agent-vault-session-log/agent-vault-session-log-config-dal";
import {
  getSessionLogEntitlement,
  TSessionLogLicenseService
} from "../agent-vault-session-log/agent-vault-session-log-license-fns";
import { openSessionLogKey } from "../agent-vault-session-log/agent-vault-session-log-secrets";
import { getEffectiveSessionLogConfig } from "../agent-vault-session-log/agent-vault-session-log-storage-fns";
import { TAgentVaultSessionDALFactory } from "../agent-vault-session/agent-vault-session-dal";
import { hashSessionToken } from "../agent-vault-session/agent-vault-session-fns";
import { deserializeSkillFiles } from "../agent-vault-skill/agent-vault-skill-fns";
import { TAgentVaultVariableDALFactory } from "../agent-vault-variable/agent-vault-variable-dal";
import { isUniqueViolation } from "../agent-vault/agent-vault-db-error-fns";
import {
  AgentVaultCredentialType,
  AgentVaultOauthStatus,
  AgentVaultServiceType,
  AgentVaultTrafficPolicy,
  AgentVaultVariableReferenceField,
  TAgentVaultMemberProvidedField
} from "../agent-vault/agent-vault-enums";
import { TAgentVaultOwner } from "../agent-vault/agent-vault-owner-fns";
import {
  findReachableAccessBundleIds,
  intersectAccessBundleIds,
  liveGroupIdsFrom
} from "../agent-vault/agent-vault-permission";
import { getServiceServerUrl } from "../agent-vault/agent-vault-service-type-fns";
import { expandStoredVariableReferences, findStoredVariableIds } from "../agent-vault/agent-vault-variable-fns";
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
  TAuthorizeSessionDTO,
  TBootstrapProxyDTO,
  TCreateProxyDTO,
  TGetSessionSkillsDTO,
  THeartbeatDTO,
  TListProxiesDTO,
  TProxyByIdDTO,
  TProxyRootCa,
  TRefreshCredentialDTO,
  TReportMissingScopesDTO,
  TResolvedService,
  TResolveSessionDTO,
  TUpdateProxyDTO
} from "./agent-vault-proxy-types";
import { TAgentVaultResolveDALFactory, TResolveServiceRow } from "./agent-vault-resolve-dal";

export const AGENT_VAULT_MAX_PROXIES_PER_ORG = 10;

// Health is derived from the last heartbeat and the poll interval, never stored.
const HEARTBEAT_MISSES_BEFORE_UNHEALTHY = 3;

const RESOLVE_REFRESH_BUDGET_MS = 4_000;

type TAgentVaultProxyServiceFactoryDep = {
  agentVaultProxyDAL: TAgentVaultProxyDALFactory;
  agentVaultResolveDAL: TAgentVaultResolveDALFactory;
  agentVaultServiceCustomHeaderDAL: Pick<TAgentVaultServiceCustomHeaderDALFactory, "findByServiceIds">;
  agentVaultServiceSubstitutionDAL: Pick<TAgentVaultServiceSubstitutionDALFactory, "findByServiceIds">;
  agentVaultVariableDAL: Pick<TAgentVaultVariableDALFactory, "findValuesForResolve">;
  agentVaultPersonalValueDAL: Pick<TAgentVaultPersonalValueDALFactory, "findForResolve">;
  agentVaultSessionDAL: Pick<TAgentVaultSessionDALFactory, "findByTokenHash">;
  agentVaultDelegationDAL: Pick<TAgentVaultDelegationDALFactory, "identityCoversUser">;
  agentVaultSessionLogConfigDAL: Pick<TAgentVaultSessionLogConfigDALFactory, "findOne" | "findByProjectIdFromPrimary">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
  orgDAL: Pick<TOrgDALFactory, "findEffectiveOrgMembership">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  userDAL: Pick<TUserDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  licenseService: TSessionLogLicenseService;
  resourceAuthMethodService: Pick<TResourceAuthMethodServiceFactory, "initAtCreate" | "revokeAccess">;
  agentVaultOauthService: Pick<TAgentVaultOauthServiceFactory, "refreshServiceToken" | "reportMissingScopes">;
};

export type TAgentVaultProxyServiceFactory = ReturnType<typeof agentVaultProxyServiceFactory>;

// A session on a user's behalf uses that user's personal values, never those of the identity that owns it. Called only
// after the session is authorized, which refuses one whose owner or user is gone.
const personalValuesOwner = (
  session: Pick<TAgentVaultSessions, "userId" | "identityId" | "onBehalfOfUserId">
): TAgentVaultOwner => {
  if (session.onBehalfOfUserId) return { userId: session.onBehalfOfUserId };
  if (session.userId) return { userId: session.userId };
  return { identityId: session.identityId! };
};

// Opens each variable at most once per resolve. An id with no row stays as text, and the service that used it is
// recorded so one log line can name every service affected.
const createVariableLookup = (
  rows: { id: string; encryptedValue: Buffer }[],
  decryptValue: (encryptedValue: Buffer) => string
) => {
  const encrypted = new Map(rows.map((row) => [row.id, row.encryptedValue]));
  const opened = new Map<string, string>();
  const unresolvedServiceIds = new Set<string>();
  const valueOfFor = (serviceId: string) => (variableId: string) => {
    const encryptedValue = encrypted.get(variableId);
    if (!encryptedValue) {
      unresolvedServiceIds.add(serviceId);
      return undefined;
    }
    let value = opened.get(variableId);
    if (value === undefined) {
      value = decryptValue(encryptedValue);
      opened.set(variableId, value);
    }
    return value;
  };
  return { valueOfFor, unresolvedServiceIds };
};

export const agentVaultProxyServiceFactory = ({
  agentVaultProxyDAL,
  agentVaultResolveDAL,
  agentVaultServiceCustomHeaderDAL,
  agentVaultServiceSubstitutionDAL,
  agentVaultVariableDAL,
  agentVaultPersonalValueDAL,
  agentVaultSessionDAL,
  agentVaultDelegationDAL,
  agentVaultSessionLogConfigDAL,
  membershipDAL,
  orgDAL,
  projectDAL,
  userDAL,
  permissionService,
  kmsService,
  licenseService,
  resourceAuthMethodService,
  agentVaultOauthService
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
      return { type: AgentVaultCredentialType.Passthrough };
    }
    if (!decryptor) throw new InternalServerError({ message: "Failed to resolve the session's credentials" });

    const secret = JSON.parse(decryptor({ cipherTextBlob: row.encryptedCredential }).toString("utf-8")) as Record<
      string,
      string
    >;

    if (row.credentialType === AgentVaultCredentialType.Bearer) {
      return {
        type: AgentVaultCredentialType.Bearer,
        headerName: config.headerName,
        headerPrefix: config.headerPrefix,
        value: secret.value
      };
    }
    if (row.credentialType === AgentVaultCredentialType.OAuth) {
      return toResolvedOauthCredential(row.credentialConfig as TAgentVaultOauthConfig, secret.accessToken);
    }
    return { type: AgentVaultCredentialType.Basic, username: secret.username ?? "", password: secret.password ?? "" };
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
    // An OAuth token is issued by the provider, never typed, so it holds no reference to expand.
    const sealedTextsOf = ({ credential, customHeaders, substitutions }: TResolvedService) => [
      ...(credential.type === AgentVaultCredentialType.Bearer && !credential.source ? [credential.value] : []),
      ...(credential.type === AgentVaultCredentialType.Basic ? [credential.username, credential.password] : []),
      ...customHeaders.map((header) => header.value),
      ...substitutions.map((substitution) => substitution.value)
    ];

    const variableIds = [
      ...new Set(services.flatMap((service) => sealedTextsOf(service).flatMap(findStoredVariableIds)))
    ];
    if (!variableIds.length) return services;

    // The lookup is scoped to the session's project, so a stored id never reaches another org's variable.
    const { valueOfFor, unresolvedServiceIds } = createVariableLookup(
      await agentVaultVariableDAL.findValuesForResolve({ variableIds, projectId, owner: null }),
      decryptValue
    );

    const expanded = services.map((service) => {
      const valueOf = valueOfFor(service.id);
      const expand = (text: string) => expandStoredVariableReferences(text, valueOf);

      let { credential } = service;
      if (credential.type === AgentVaultCredentialType.Bearer && !credential.source) {
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

  /**
   * A member-provided field comes from what the session's owner saved for the service, or, on a user's behalf, what
   * that user saved, expanded against their own personal variables only, after the admin's fields were expanded
   * against the global ones: a value is never expanded twice. If they haven't set every field the admin leaves to them,
   * the service goes out flagged and without a credential, so the proxy refuses it instead of sending a half-built one.
   */
  const $applyPersonalValues = async ({
    sessionId,
    projectId,
    owner,
    rows,
    services,
    decryptValue,
    decryptJson
  }: {
    sessionId: string;
    projectId: string;
    owner: TAgentVaultOwner;
    rows: TResolveServiceRow[];
    services: TResolvedService[];
    decryptValue: (encryptedValue: Buffer) => string;
    decryptJson: (encrypted: Buffer) => unknown;
  }): Promise<TResolvedService[]> => {
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const memberFieldsOf = (serviceId: string) =>
      (rowById.get(serviceId)?.memberProvidedFields ?? []) as TAgentVaultMemberProvidedField[];

    const serviceIds = services.filter((service) => memberFieldsOf(service.id).length).map((service) => service.id);
    if (!serviceIds.length) return services;

    // Stored text per service, then per field, with personal variable references still as ids.
    const stored = new Map<string, Map<string, string>>();
    (await agentVaultPersonalValueDAL.findForResolve({ serviceIds, owner })).forEach((row) => {
      const fields = stored.get(row.serviceId) ?? new Map<string, string>();
      fields.set(row.field, (decryptJson(row.encryptedValue) as { value: string }).value);
      stored.set(row.serviceId, fields);
    });

    const variableIds = [
      ...new Set([...stored.values()].flatMap((fields) => [...fields.values()].flatMap(findStoredVariableIds)))
    ];
    const { valueOfFor, unresolvedServiceIds } = createVariableLookup(
      await agentVaultVariableDAL.findValuesForResolve({ variableIds, projectId, owner }),
      decryptValue
    );

    const resolved = services.map((service): TResolvedService => {
      const memberFields = memberFieldsOf(service.id);
      if (!memberFields.length) return service;

      const fields = stored.get(service.id);
      if (!fields || memberFields.some((field) => !fields.has(field))) {
        return { ...service, credential: { type: AgentVaultCredentialType.Passthrough }, personalValuesMissing: true };
      }

      const valueOf = valueOfFor(service.id);
      const personalValue = (field: TAgentVaultMemberProvidedField) =>
        expandStoredVariableReferences(fields.get(field) ?? "", valueOf);

      const row = rowById.get(service.id)!;
      const config = (row.credentialConfig ?? {}) as Record<string, string>;
      if (row.credentialType === AgentVaultCredentialType.Bearer) {
        return {
          ...service,
          credential: {
            type: AgentVaultCredentialType.Bearer,
            headerName: config.headerName,
            headerPrefix: config.headerPrefix,
            value: personalValue(AgentVaultVariableReferenceField.CredentialValue)
          }
        };
      }

      const adminHalves =
        service.credential.type === AgentVaultCredentialType.Basic
          ? service.credential
          : { username: "", password: "" };
      return {
        ...service,
        credential: {
          type: AgentVaultCredentialType.Basic,
          // Trimmed for the same reason as an admin's username a variable fills in.
          username: memberFields.includes(AgentVaultVariableReferenceField.CredentialUsername)
            ? personalValue(AgentVaultVariableReferenceField.CredentialUsername).trim()
            : adminHalves.username,
          password: memberFields.includes(AgentVaultVariableReferenceField.CredentialValue)
            ? personalValue(AgentVaultVariableReferenceField.CredentialValue)
            : adminHalves.password
        }
      };
    });

    if (unresolvedServiceIds.size) {
      logger.error(
        `agentVaultResolve: stored personal variable reference with no variable [sessionId=${sessionId}] [serviceIds=${[...unresolvedServiceIds].join(",")}]`
      );
    }
    return resolved;
  };

  // The user a session was started on behalf of has to still be in the org and in Agent Vault, and the delegation of the
  // identity that owns the session has to still cover them. Read on every resolve, so taking any of them away ends the
  // session on the proxy's next poll. Returns the bundles the user reaches (null for every bundle), since the session
  // reaches only what both the identity and the user reach.
  const $getOnBehalfOfUserReach = async ({
    projectId,
    orgId,
    identityId,
    userId
  }: {
    projectId: string;
    orgId: string;
    identityId: string | null;
    userId: string | null;
  }): Promise<string[] | null> => {
    const refused = () =>
      new UnauthorizedError({
        message: "The machine identity that owns this session is no longer allowed to act on behalf of its user"
      });
    if (!identityId || !userId) throw refused();

    const orgMembership = await orgDAL.findEffectiveOrgMembership({
      actorType: ActorType.USER,
      actorId: userId,
      orgId,
      status: OrgMembershipStatus.Accepted
    });
    if (!orgMembership?.isActive) throw refused();

    let isAdmin: boolean;
    let liveGroupIds: string[];
    try {
      const { permission, hasRole, memberships } = await permissionService.getProjectPermission({
        actor: ActorType.USER,
        actorId: userId,
        projectId,
        actorAuthMethod: null,
        actorOrgId: orgId,
        actionProjectType: ActionProjectType.AgentVault
      });
      if (!permission.can(ProjectPermissionAgentVaultSessionActions.Read, ProjectPermissionSub.AgentVaultSessions)) {
        throw refused();
      }
      isAdmin = hasRole(ProjectMembershipRole.Admin);
      liveGroupIds = liveGroupIdsFrom(memberships);
    } catch (error) {
      if (error instanceof ForbiddenRequestError && error.name === "ProjectMembershipNotFound") throw refused();
      throw error;
    }

    if (!(await agentVaultDelegationDAL.identityCoversUser({ projectId, identityId, userId }))) {
      throw refused();
    }

    if (isAdmin) return null;
    return findReachableAccessBundleIds(membershipDAL, {
      projectId,
      actor: { type: ActorType.USER, id: userId },
      groupIds: liveGroupIds
    });
  };

  // Shared by the proxy's session routes and the CLI's skills fetch, so none of them can reach a bundle resolve
  // would not. Returns the bundles the session reaches now, null for every bundle: its owner's, and on a user's behalf
  // only those the user reaches too.
  const $authorizeSessionOwner = async (session: TAgentVaultSessions, orgId: string) => {
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
    // The name marks an on-behalf-of session, even after deleting the user nulls its id.
    const onBehalfOf =
      session.onBehalfOfUserName != null
        ? {
            reach: await $getOnBehalfOfUserReach({
              projectId: session.projectId,
              orgId,
              identityId: session.identityId ?? null,
              userId: session.onBehalfOfUserId ?? null
            })
          }
        : null;

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

    const actorReach = isAdmin
      ? null
      : await findReachableAccessBundleIds(membershipDAL, {
          projectId: session.projectId,
          actor,
          groupIds: liveGroupIds
        });
    return onBehalfOf ? intersectAccessBundleIds(actorReach, onBehalfOf.reach) : actorReach;
  };

  const $authorizeSession = async ({ proxyId, orgId, sessionToken }: TAuthorizeSessionDTO) => {
    const session = await agentVaultSessionDAL.findByTokenHash(hashSessionToken(sessionToken));
    if (!session) throw new NotFoundError({ message: "Session not found" });

    // A mismatch is 404, not 403, so a proxy cannot probe another tenant for session ids.
    const proxy = await agentVaultProxyDAL.findByIdWithOrg(proxyId);
    if (!proxy || proxy.projectId !== session.projectId || proxy.orgId !== orgId) {
      throw new NotFoundError({ message: "Session not found" });
    }

    const accessBundleIds = await $authorizeSessionOwner(session, orgId);
    return { session, proxy, accessBundleIds };
  };

  /** Resolve services and decrypt their credentials. The proxy's JWT authorizes; the session token is a selector. */
  const resolveSession = async ({ proxyId, orgId, sessionToken, hasSessionLogKey }: TResolveSessionDTO) => {
    const { session, proxy, accessBundleIds } = await $authorizeSession({ proxyId, orgId, sessionToken });

    const rows = await agentVaultResolveDAL.findResolvableServices({
      sessionId: session.id,
      projectId: session.projectId,
      accessBundleIds
    });

    // A token that expires before the proxy's next poll is refreshed now, which also keeps proxies that can't
    // refresh on their own working. The proxy gives up on resolve after 15 seconds, and one refresh can wait on
    // another's lock and then on a slow provider, so resolve waits for all of them together for a short budget
    // only. A refresh that fails or is still running sends the stored token; one still running finishes in the
    // background and stores its result for the next poll.
    const refreshWithinSeconds = proxy.pollInterval + 60;
    const refreshedCredentials = new Map<string, TResolvedService["credential"]>();
    const dueForRefresh = rows.filter((row) => {
      if (row.credentialType !== AgentVaultCredentialType.OAuth) return false;
      const oauth = row.credentialConfig as TAgentVaultOauthConfig;
      return (
        oauth.status !== AgentVaultOauthStatus.NeedsReauthorization &&
        Boolean(oauth.expiresAt) &&
        new Date(oauth.expiresAt!).getTime() <= Date.now() + refreshWithinSeconds * 1000
      );
    });
    if (dueForRefresh.length) {
      let budgetSpent = false;
      const pending = new Set(dueForRefresh.map((row) => row.id));
      const refreshes = dueForRefresh.map((row) =>
        agentVaultOauthService
          .refreshServiceToken({
            serviceId: row.id,
            projectId: session.projectId,
            expiresWithinSeconds: refreshWithinSeconds,
            // The answer pairs this row's host with the credential, so a refreshed one has to be for the same server.
            destination: {
              hostPattern: row.hostPattern,
              serverUrl: getServiceServerUrl(row.config)
            }
          })
          .then(({ credential }) => {
            if (!budgetSpent) refreshedCredentials.set(row.id, credential);
          })
          .catch((error) => {
            if (error instanceof ConflictError) {
              logger.info(
                `agentVaultResolve: service moved during its OAuth refresh, sending the stored token until the next poll [sessionId=${session.id}] [serviceId=${row.id}]`
              );
              return;
            }
            logger.error(
              error,
              `agentVaultResolve: OAuth refresh failed, sending the stored token [sessionId=${session.id}] [serviceId=${row.id}]`
            );
          })
          .finally(() => pending.delete(row.id))
      );

      let budgetTimer: NodeJS.Timeout | undefined;
      await Promise.race([
        Promise.all(refreshes),
        new Promise<void>((resolve) => {
          budgetTimer = setTimeout(resolve, RESOLVE_REFRESH_BUDGET_MS);
        })
      ]);
      clearTimeout(budgetTimer);
      budgetSpent = true;

      if (pending.size) {
        logger.warn(
          `agentVaultResolve: OAuth refresh still running, sending the stored token [sessionId=${session.id}] [serviceIds=${[...pending].join(",")}]`
        );
      }
    }

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
      rows.some((row) => row.encryptedCredential || row.memberProvidedFields?.length) ||
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

    const $decryptJson = (encrypted: Buffer): unknown => {
      if (!decryptor) throw new InternalServerError({ message: "Failed to resolve the session's credentials" });
      return JSON.parse(decryptor({ cipherTextBlob: encrypted }).toString("utf-8"));
    };
    const $decryptValue = (encryptedValue: Buffer) => ($decryptJson(encryptedValue) as { value: string }).value;

    const decryptedServices: TResolvedService[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      accessBundleName: row.accessBundleName,
      type: row.type as AgentVaultServiceType,
      hostPattern: row.hostPattern,
      allowedMethods: row.allowedMethods,
      allowedPathPrefixes: row.allowedPathPrefixes,
      credential: refreshedCredentials.get(row.id) ?? $decryptCredential(row, decryptor),
      customHeaders: customHeaderRows
        .filter((header) => header.serviceId === row.id)
        .map((header) => ({ name: header.name, prefix: header.prefix, value: $decryptValue(header.encryptedValue) })),
      substitutions: substitutionRows
        .filter((substitution) => substitution.serviceId === row.id)
        .map((substitution) => ({
          placeholder: substitution.placeholder,
          surfaces: substitution.surfaces,
          value: $decryptValue(substitution.encryptedValue)
        })),
      personalValuesMissing: false
    }));

    const services = await $applyPersonalValues({
      sessionId: session.id,
      projectId: session.projectId,
      owner: personalValuesOwner(session),
      rows,
      services: await $expandVariableReferences({
        sessionId: session.id,
        projectId: session.projectId,
        services: decryptedServices,
        decryptValue: $decryptValue
      }),
      decryptValue: $decryptValue,
      decryptJson: $decryptJson
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
      `agentVaultResolve: resolved [sessionId=${session.id}] [proxyId=${proxyId}] [services=${services.length}] [personalValuesMissing=${services.filter((service) => service.personalValuesMissing).length}]`
    );

    return {
      sessionId: session.id,
      expiresAt: session.expiresAt ?? null,
      services,
      sessionLogs
    };
  };

  const $findSessionOauthService = async ({
    proxyId,
    orgId,
    sessionToken,
    serviceId,
    hostPattern
  }: Pick<TRefreshCredentialDTO, "proxyId" | "orgId" | "sessionToken" | "serviceId" | "hostPattern">) => {
    const { session, accessBundleIds } = await $authorizeSession({ proxyId, orgId, sessionToken });
    const [row] = await agentVaultResolveDAL.findResolvableServices({
      sessionId: session.id,
      projectId: session.projectId,
      accessBundleIds,
      serviceId
    });
    if (!row) throw new NotFoundError({ message: `Service with ID '${serviceId}' not found in this session` });
    if (row.credentialType !== AgentVaultCredentialType.OAuth) {
      throw new BadRequestError({
        message: `The service '${row.name}' doesn't use an OAuth credential.`
      });
    }
    // The proxy retries with whatever comes back against the host it cached, so a service that moved since must
    // not hand it the new server's token. The refresh re-checks against the primary, which this replica read may
    // trail.
    if (row.hostPattern !== hostPattern) throw new ConflictError({ message: AGENT_VAULT_SERVICE_MOVED_MESSAGE });
    return { session, row };
  };

  // After the upstream rejected a token. Never audited, like resolve: it is proxy-driven and per request.
  const refreshCredential = async ({ rejectedTokenHash, ...dto }: TRefreshCredentialDTO) => {
    const { session, row } = await $findSessionOauthService(dto);
    const result = await agentVaultOauthService.refreshServiceToken({
      serviceId: row.id,
      projectId: session.projectId,
      rejectedTokenHash: rejectedTokenHash.toLowerCase(),
      destination: { hostPattern: dto.hostPattern }
    });
    logger.info(
      `agentVaultCredentialRefresh: answered [sessionId=${session.id}] [proxyId=${dto.proxyId}] [serviceId=${row.id}] [status=${result.status}]`
    );
    return result;
  };

  // After the upstream refused a token with `insufficient_scope`. Not audited, for the same reason as a refresh.
  const reportMissingScopes = async ({ rejectedTokenHash, requiredScopes, ...dto }: TReportMissingScopesDTO) => {
    const { session, row } = await $findSessionOauthService(dto);
    await agentVaultOauthService.reportMissingScopes({
      serviceId: row.id,
      rejectedTokenHash: rejectedTokenHash.toLowerCase(),
      requiredScopes,
      hostPattern: dto.hostPattern
    });
    logger.info(
      `agentVaultMissingScopes: recorded [sessionId=${session.id}] [proxyId=${dto.proxyId}] [serviceId=${row.id}] [scopes=${requiredScopes.length}]`
    );
  };

  // Called by the CLI once when an agent starts: the latest files of every skill on the session's reachable bundles.
  // The session token is the only credential, so an unknown one gets the same 401 as any other refusal.
  const getSessionSkills = async ({ sessionToken }: TGetSessionSkillsDTO) => {
    const session = await agentVaultSessionDAL.findByTokenHash(hashSessionToken(sessionToken));
    const project = session ? await projectDAL.findById(session.projectId) : undefined;
    if (!session || !project) {
      throw new UnauthorizedError({ message: "This Agent Vault session token is not valid" });
    }

    const accessBundleIds = await $authorizeSessionOwner(session, project.orgId);

    const rows = await agentVaultResolveDAL.findSessionSkills({
      sessionId: session.id,
      projectId: session.projectId,
      accessBundleIds
    });

    const decryptor = rows.length
      ? (
          await kmsService.createCipherPairWithDataKey({
            type: KmsDataKey.SecretManager,
            projectId: session.projectId
          })
        ).decryptor
      : null;

    const skills = rows.map((row) => ({
      id: row.id,
      name: row.name,
      version: row.version,
      sha256: row.sha256,
      files: deserializeSkillFiles(decryptor!({ cipherTextBlob: row.encryptedFiles })),
      accessBundleId: row.accessBundleId,
      accessBundleName: row.accessBundleName
    }));

    // The session snapshots its owner at mint. Name a user as they are now, as PAM does, and fall back to the
    // snapshot for one who is gone.
    let ownerUser: { username: string; email: string | null } | null = null;
    if (session.userId) {
      const user = await userDAL.findById(session.userId);
      ownerUser = user
        ? { username: user.username, email: user.email ?? null }
        : { username: session.actorEmail ?? session.actorName, email: session.actorEmail ?? null };
    }

    // The user a session acts for is named the same way, so the audit event can say whose session it was.
    let onBehalfOfUser: { id: string | null; username: string; email: string | null } | null = null;
    if (session.onBehalfOfUserName != null) {
      const user = session.onBehalfOfUserId ? await userDAL.findById(session.onBehalfOfUserId) : undefined;
      onBehalfOfUser = user
        ? { id: user.id, username: user.username, email: user.email ?? null }
        : {
            id: null,
            username: session.onBehalfOfUserEmail ?? session.onBehalfOfUserName,
            email: session.onBehalfOfUserEmail ?? null
          };
    }

    return { skills, session, ownerUser, onBehalfOfUser, orgId: project.orgId };
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
    resolveSession,
    refreshCredential,
    reportMissingScopes,
    getSessionSkills
  };
};
