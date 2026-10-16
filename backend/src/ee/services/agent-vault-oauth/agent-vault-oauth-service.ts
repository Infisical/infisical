import crypto from "node:crypto";

import { ForbiddenError } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionAgentVaultAccessBundleActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes, TKeyStoreFactory, TKeyStoreLock } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ConflictError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";

import {
  AgentVaultCredentialType,
  AgentVaultOauthAuthorizationStatus,
  AgentVaultOauthStatus,
  AgentVaultServiceType
} from "../agent-vault/agent-vault-enums";
import { getAgentVaultReachability } from "../agent-vault/agent-vault-permission";
import { TAgentVaultServiceConfig } from "../agent-vault/agent-vault-service-types";
import { TAgentVaultAccessBundleDALFactory } from "../agent-vault-access-bundle/agent-vault-access-bundle-dal";
import { TAgentVaultServiceDALFactory } from "../agent-vault-access-bundle/agent-vault-service-dal";
import {
  manualOauthClient,
  OauthRegistrationError,
  registerOauthClient,
  TOauthClient
} from "./agent-vault-oauth-client-fns";
import {
  describeServer,
  discoverOauthServer,
  oauthSetupError,
  OFFLINE_ACCESS_SCOPE
} from "./agent-vault-oauth-discovery-fns";
import { agentVaultOauthHttpClient, TOauthHttpClient } from "./agent-vault-oauth-http-fns";
import {
  buildAuthorizeUrl,
  decideRefresh,
  exchangeAuthorizationCode,
  expiresAtFrom,
  generatePkce,
  generateState,
  hashAccessToken,
  isSameState,
  normalizeProviderText,
  refreshAccessToken,
  validateCallbackIssuer,
  withTokenCompatibility
} from "./agent-vault-oauth-token-fns";
import {
  AGENT_VAULT_OAUTH_GRANT_TYPE,
  AGENT_VAULT_OAUTH_HEADER_NAME,
  AGENT_VAULT_OAUTH_HEADER_PREFIX,
  AgentVaultOauthRegistration,
  TAgentVaultOauthAuthorization,
  TAgentVaultOauthAuthorizationView,
  TAgentVaultOauthConfig,
  TAgentVaultOauthSecret,
  TClaimAuthorizationDTO,
  TCompleteAuthorizationDTO,
  TCreateAuthorizationDTO,
  TGetAuthorizationDTO,
  TRefreshServiceTokenDTO,
  TResolvedOauthCredential
} from "./agent-vault-oauth-types";

export const AGENT_VAULT_OAUTH_AUTHORIZATION_TTL_SECONDS = 10 * 60;
const COMPLETE_LOCK_TTL_SECONDS = 60;
// Outlasts the holder's work: the token requests share a 7 second budget.
const REFRESH_LOCK_DURATION_MS = 15 * 1000;
// Waits at most ~3s for a concurrent refresh of the same service, then answers with whatever is stored. With the
// token budget, the proxy's credential refresh answers inside its 15 second timeout.
const REFRESH_LOCK_SETTINGS = { retryCount: 12, retryDelay: 200, retryJitter: 50 };
export const AGENT_VAULT_OAUTH_CALLBACK_PATH = "/agent-vault/oauth/callback";

type TAgentVaultOauthServiceFactoryDep = {
  keyStore: Pick<
    TKeyStoreFactory,
    "getItemPrimary" | "setItemWithExpiry" | "setItemWithExpiryNX" | "deleteItem" | "ttl" | "acquireLock"
  >;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  agentVaultServiceDAL: Pick<
    TAgentVaultServiceDALFactory,
    "findByIdInAccessBundle" | "findByIdPrimary" | "compareAndSwapCredential" | "addRequiredScopes"
  >;
  agentVaultAccessBundleDAL: Pick<TAgentVaultAccessBundleDALFactory, "findByIdInProject">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
  http?: TOauthHttpClient;
};

export type TAgentVaultOauthServiceFactory = ReturnType<typeof agentVaultOauthServiceFactory>;

type TProjectCipher = Awaited<ReturnType<TKmsServiceFactory["createCipherPairWithDataKey"]>>;

type TLoadedOauthService = {
  config: TAgentVaultOauthConfig;
  secret: TAgentVaultOauthSecret;
  encryptedCredential: Buffer;
  hostPattern: string;
  serverUrl: string | null;
};

export const AGENT_VAULT_SERVICE_MOVED_MESSAGE =
  "This service's server changed after the proxy last fetched it, so Infisical won't send its credential to the old host. The proxy picks up the change on its next poll.";

const serverUrlOf = (config: unknown) => (config as TAgentVaultServiceConfig | null)?.serverUrl ?? null;

// Names hosts only: a server URL's path or query can hold a key.
export const assertAuthorizationServerUrl = (authorizedServerUrl: string, serviceServerUrl: string | null) => {
  if (authorizedServerUrl === serviceServerUrl) return;
  const authorizedHost = describeServer(authorizedServerUrl);
  if (!serviceServerUrl) {
    throw new BadRequestError({
      message: `This authorization is for '${authorizedHost}', but the service has no server URL, so it can't use OAuth.`
    });
  }
  const serviceHost = describeServer(serviceServerUrl);
  throw new BadRequestError({
    message:
      authorizedHost === serviceHost
        ? `This authorization is for a different server URL on '${serviceHost}' than the service uses. Authorize again for the new URL.`
        : `This authorization is for '${authorizedHost}', but the service's server is '${serviceHost}'. Authorize again for the new URL.`
  });
};

export const OAUTH_SERVER_URL_NEEDS_AUTHORIZATION_MESSAGE =
  "Changing an OAuth service's server URL needs a new authorization, since its tokens belong to the old server. Authorize the service for the new URL and send its 'authorizationId'.";

export const AGENT_VAULT_REAUTHORIZED_DURING_SAVE_MESSAGE =
  "This service was reauthorized by another save while this one was in progress, and that newer connection was kept. Reload the service, then authorize again if you still want to replace it.";

// Run under the bundle lock against the row read there, since a save that landed after the first read may have
// moved the service or reauthorized it. A newer reauthorization wins over a stale one, so an older authorization
// can't swap the account the service acts as back. A refresh doesn't count: it keeps `authorizedAt`, and its
// rotated tokens are what this save replaces anyway. Returns the required scopes still to carry over.
export const checkOauthClaimUnderLock = ({
  authorizedServerUrl,
  lockedServerUrl,
  readOauth,
  lockedOauth
}: {
  authorizedServerUrl: string;
  lockedServerUrl: string | null;
  readOauth: Pick<TAgentVaultOauthConfig, "authorizedAt"> | undefined;
  lockedOauth: Pick<TAgentVaultOauthConfig, "authorizedAt" | "requiredScopes"> | undefined;
}) => {
  assertAuthorizationServerUrl(authorizedServerUrl, lockedServerUrl);
  if ((readOauth?.authorizedAt ?? null) !== (lockedOauth?.authorizedAt ?? null)) {
    throw new ConflictError({ message: AGENT_VAULT_REAUTHORIZED_DURING_SAVE_MESSAGE });
  }
  return lockedOauth?.requiredScopes ?? [];
};

// For an edit that keeps the service's tokens, under the bundle lock: the server URL the save writes must still be
// the one those tokens were authorized for. A reauthorization for another server can commit between the first read
// and the lock, and merging this request's URL over it would send the new server's tokens to the old host.
export const checkOauthServerUnderLock = ({
  requestedServerUrl,
  readServerUrl,
  effectiveServerUrl,
  lockedOauth
}: {
  requestedServerUrl: string | undefined;
  readServerUrl: string | null;
  effectiveServerUrl: string | null;
  lockedOauth: Pick<TAgentVaultOauthConfig, "serverUrl">;
}) => {
  const boundServerUrl = lockedOauth.serverUrl;
  if (effectiveServerUrl === boundServerUrl) return;
  if (requestedServerUrl !== undefined && requestedServerUrl !== readServerUrl) {
    throw new BadRequestError({ message: OAUTH_SERVER_URL_NEEDS_AUTHORIZATION_MESSAGE });
  }
  const boundHost = describeServer(boundServerUrl);
  const effectiveHost = effectiveServerUrl ? describeServer(effectiveServerUrl) : null;
  throw new ConflictError({
    message:
      effectiveHost && effectiveHost !== boundHost
        ? `This service was reauthorized for '${boundHost}' while this save was in progress, so its server can't be set back to '${effectiveHost}'. Reload the service and save again.`
        : `This service was reauthorized for a different server URL on '${boundHost}' while this save was in progress. Reload the service and save again.`
  });
};

const toView = (record: TAgentVaultOauthAuthorization): TAgentVaultOauthAuthorizationView => ({
  id: record.id,
  status: record.status,
  error: record.error,
  scopes:
    record.status === AgentVaultOauthAuthorizationStatus.Authorized ? record.grantedScopes : record.requestedScopes
});

export const agentVaultOauthServiceFactory = ({
  keyStore,
  kmsService,
  agentVaultServiceDAL,
  agentVaultAccessBundleDAL,
  permissionService,
  membershipDAL,
  http = agentVaultOauthHttpClient
}: TAgentVaultOauthServiceFactoryDep) => {
  const getProjectCipher = (projectId: string) =>
    kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId });

  const sealWith = ({ encryptor }: TProjectCipher, value: unknown) =>
    encryptor({ plainText: Buffer.from(JSON.stringify(value)) }).cipherTextBlob;

  const openWith = <T>({ decryptor }: TProjectCipher, blob: Buffer): T =>
    JSON.parse(decryptor({ cipherTextBlob: blob }).toString("utf-8")) as T;

  const seal = async (projectId: string, value: unknown) => sealWith(await getProjectCipher(projectId), value);

  const open = async <T>(projectId: string, blob: Buffer): Promise<T> =>
    openWith<T>(await getProjectCipher(projectId), blob);

  const redirectUri = () => {
    const { SITE_URL } = getConfig();
    if (!SITE_URL) {
      throw new BadRequestError({
        message:
          "OAuth needs this Infisical instance's SITE_URL to be set, since it is the redirect URI. Ask your administrator to set it."
      });
    }
    return `${SITE_URL}${AGENT_VAULT_OAUTH_CALLBACK_PATH}`;
  };

  const saveAuthorization = (record: TAgentVaultOauthAuthorization) =>
    keyStore.setItemWithExpiry(
      KeyStorePrefixes.AgentVaultOauthAuthorization(record.id),
      AGENT_VAULT_OAUTH_AUTHORIZATION_TTL_SECONDS,
      JSON.stringify(record)
    );

  const loadAuthorization = async (authorizationId: string) => {
    const raw = await keyStore.getItemPrimary(KeyStorePrefixes.AgentVaultOauthAuthorization(authorizationId));
    return raw ? { record: JSON.parse(raw) as TAgentVaultOauthAuthorization, raw } : null;
  };

  // Only its creator in the original project can see, complete or claim one. A different user or tenant gets
  // the same 404 as an unknown id.
  const loadOwnStoredAuthorization = async (
    authorizationId: string,
    ctx: TGetAuthorizationDTO["ctx"],
    projectId: string
  ) => {
    const stored = await loadAuthorization(authorizationId);
    if (
      !stored ||
      stored.record.projectId !== projectId ||
      ctx.actor !== ActorType.USER ||
      stored.record.actorUserId !== ctx.actorId
    ) {
      throw new NotFoundError({
        message: `Authorization with ID '${authorizationId}' not found. It may have expired or was already used. Authorize the service again.`
      });
    }
    return stored;
  };

  const loadOwnAuthorization = async (authorizationId: string, ctx: TGetAuthorizationDTO["ctx"], projectId: string) =>
    (await loadOwnStoredAuthorization(authorizationId, ctx, projectId)).record;

  const createAuthorization = async ({
    projectId,
    ctx,
    accessBundleId,
    serverUrl,
    serviceId,
    clientId,
    clientSecret
  }: TCreateAuthorizationDTO) => {
    const { permission, accessBundleIds } = await getAgentVaultReachability(
      { permissionService, membershipDAL },
      { projectId, ctx }
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionAgentVaultAccessBundleActions.Edit,
      ProjectPermissionSub.AgentVaultAccessBundles
    );

    const bundle = await agentVaultAccessBundleDAL.findByIdInProject({ id: accessBundleId, projectId });
    if (!bundle || (accessBundleIds && !accessBundleIds.includes(accessBundleId.toLowerCase()))) {
      throw new NotFoundError({ message: `Access bundle with ID '${accessBundleId}' not found` });
    }
    if (ctx.actor !== ActorType.USER) {
      throw new BadRequestError({
        message: "Only a user can authorize an OAuth connection, since it needs a browser."
      });
    }
    if (clientSecret && !clientId) {
      throw new BadRequestError({ message: "A client secret needs the client ID it belongs to." });
    }

    let stored: { config: TAgentVaultOauthConfig; clientSecret?: string } | null = null;
    if (serviceId) {
      const service = await agentVaultServiceDAL.findByIdInAccessBundle({ id: serviceId, accessBundleId: bundle.id });
      if (!service) throw new NotFoundError({ message: `Service with ID '${serviceId}' not found` });
      if (service.type !== AgentVaultServiceType.Mcp) {
        throw new BadRequestError({
          message: `The service '${service.name}' is an HTTP service. Only MCP services use OAuth.`
        });
      }
      if (service.credentialType === AgentVaultCredentialType.OAuth && service.encryptedCredential) {
        const secret = await open<TAgentVaultOauthSecret>(projectId, service.encryptedCredential);
        stored = { config: service.credentialConfig as TAgentVaultOauthConfig, clientSecret: secret.clientSecret };
      }
    }

    const callbackUri = redirectUri();
    const discovery = await discoverOauthServer(http, serverUrl);
    const compatibility = [...discovery.compatibility];

    let client: TOauthClient;
    let registration: AgentVaultOauthRegistration;
    if (clientId) {
      client = manualOauthClient({
        clientId,
        clientSecret,
        tokenEndpointAuthMethodsSupported: discovery.tokenEndpointAuthMethodsSupported
      });
      registration = AgentVaultOauthRegistration.Manual;
    } else if (stored && stored.config.issuer === discovery.issuer) {
      // A client is only ever used with the issuer it was registered at.
      client = {
        clientId: stored.config.clientId,
        clientSecret: stored.clientSecret,
        tokenEndpointAuthMethod: stored.config.tokenEndpointAuthMethod
      };
      registration = stored.config.registration;
    } else if (discovery.registrationEndpoint) {
      try {
        const registered = await registerOauthClient({
          http,
          serverUrl,
          registrationEndpoint: discovery.registrationEndpoint,
          redirectUri: callbackUri
        });
        client = registered.client;
        compatibility.push(...registered.compatibility);
        registration = AgentVaultOauthRegistration.Dynamic;
      } catch (error) {
        if (!(error instanceof OauthRegistrationError)) throw error;
        // A guessed /register that isn't there means the server has no registration, not that it is broken.
        // Either way the fix is the same, an admin-entered client, so the caller is asked for one.
        return {
          registrationRequired: true,
          redirectUri: callbackUri,
          registrationError: discovery.endpointsGuessed
            ? null
            : oauthSetupError(
                serverUrl,
                `${error.message} Enter the client ID and secret of your own OAuth app instead.`
              ).message,
          authorization: null
        };
      }
    } else {
      return { registrationRequired: true, redirectUri: callbackUri, registrationError: null, authorization: null };
    }

    const storedScopes = stored ? [...new Set([...stored.config.grantedScopes, ...stored.config.requiredScopes])] : [];
    const requestedScopes = storedScopes.length
      ? [
          ...new Set([
            ...storedScopes,
            ...(discovery.scopes.includes(OFFLINE_ACCESS_SCOPE) ? [OFFLINE_ACCESS_SCOPE] : [])
          ])
        ]
      : discovery.scopes;

    const id = crypto.randomUUID();
    const state = generateState(id);
    const { codeVerifier, codeChallenge } = generatePkce();
    const sealedPending = await seal(projectId, { codeVerifier, clientSecret: client.clientSecret });

    const record: TAgentVaultOauthAuthorization = {
      id,
      projectId,
      accessBundleId: bundle.id,
      serviceId: serviceId ?? null,
      actorUserId: ctx.actorId,
      serverUrl,
      state,
      redirectUri: callbackUri,
      status: AgentVaultOauthAuthorizationStatus.Pending,
      error: null,
      issuer: discovery.issuer,
      issParameterSupported: discovery.issParameterSupported,
      authorizationEndpoint: discovery.authorizationEndpoint,
      tokenEndpoint: discovery.tokenEndpoint,
      resource: discovery.resource,
      clientId: client.clientId,
      registration,
      tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
      compatibility: [...new Set(compatibility)],
      requestedScopes,
      grantedScopes: [],
      expiresAt: null,
      accessTokenHash: null,
      sealedPending: sealedPending.toString("base64"),
      sealedCredential: null
    };
    await saveAuthorization(record);

    return {
      registrationRequired: false,
      redirectUri: callbackUri,
      registrationError: null,
      authorization: {
        id,
        status: record.status,
        authorizeUrl: buildAuthorizeUrl({
          authorizationEndpoint: record.authorizationEndpoint,
          clientId: client.clientId,
          redirectUri: callbackUri,
          codeChallenge,
          state,
          resource: record.resource,
          scopes: requestedScopes
        }),
        scopes: requestedScopes
      }
    };
  };

  const completeAuthorization = async ({
    projectId,
    ctx,
    authorizationId,
    state,
    code,
    iss,
    error,
    errorDescription
  }: TCompleteAuthorizationDTO) => {
    const initial = await loadOwnAuthorization(authorizationId, ctx, projectId);
    if (!isSameState(initial.state, state)) {
      throw new BadRequestError({
        message:
          "The authorization response doesn't belong to this authorization. Close the window and authorize again."
      });
    }
    if (initial.status !== AgentVaultOauthAuthorizationStatus.Pending) return { authorization: toView(initial) };

    const lockKey = KeyStorePrefixes.AgentVaultOauthAuthorizationCompleteLock(authorizationId);
    if (!(await keyStore.setItemWithExpiryNX(lockKey, COMPLETE_LOCK_TTL_SECONDS, "1"))) {
      throw new ConflictError({
        message: "This authorization is already being completed. Wait a moment and check its status."
      });
    }

    try {
      // Re-read under the lock: a completion that finished between the first read and the lock already redeemed
      // the code, and running again would overwrite its result with the provider's invalid_grant.
      const record = await loadOwnAuthorization(authorizationId, ctx, projectId);
      if (record.status !== AgentVaultOauthAuthorizationStatus.Pending) return { authorization: toView(record) };

      const host = describeServer(record.serverUrl);
      const fail = (message: string) => {
        record.status = AgentVaultOauthAuthorizationStatus.Failed;
        record.error = normalizeProviderText(message);
        logger.warn(
          `agentVaultOauth: authorization failed [authorizationId=${record.id}] [projectId=${record.projectId}] [server=${host}] [error=${record.error}]`
        );
      };

      const issuerProblem = validateCallbackIssuer({
        iss,
        expectedIssuer: record.issuer,
        issParameterSupported: record.issParameterSupported,
        serverUrl: record.serverUrl
      });

      if (error) {
        const providerError = normalizeProviderText(error, undefined, [code, state]);
        const detail =
          normalizeProviderText(errorDescription, undefined, [code, state]) || providerError || "no reason given";
        fail(
          providerError === "access_denied"
            ? `Access to '${host}' was denied, so nothing was connected.`
            : `'${host}' didn't authorize Infisical: ${detail}`
        );
      } else if (issuerProblem) {
        fail(issuerProblem);
      } else if (!code) {
        fail(`'${host}' sent no authorization code. Authorize again.`);
      } else {
        const pending = await open<{ codeVerifier: string; clientSecret?: string }>(
          record.projectId,
          Buffer.from(record.sealedPending, "base64")
        );
        // Outside any transaction: this is a network call to the provider.
        const result = await exchangeAuthorizationCode({
          http,
          serverUrl: record.serverUrl,
          issuer: record.issuer,
          tokenEndpoint: record.tokenEndpoint,
          clientId: record.clientId,
          clientSecret: pending.clientSecret,
          tokenEndpointAuthMethod: record.tokenEndpointAuthMethod,
          resource: record.resource,
          code,
          codeVerifier: pending.codeVerifier,
          redirectUri: record.redirectUri,
          requestedScopes: record.requestedScopes
        });

        if (!result.ok) {
          fail(result.message);
        } else {
          const secret: TAgentVaultOauthSecret = {
            accessToken: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
            clientSecret: pending.clientSecret
          };
          record.sealedCredential = (await seal(record.projectId, secret)).toString("base64");
          record.status = AgentVaultOauthAuthorizationStatus.Authorized;
          record.grantedScopes = result.tokens.scopes ?? record.requestedScopes;
          record.expiresAt = expiresAtFrom(result.tokens.expiresIn, new Date());
          record.accessTokenHash = hashAccessToken(result.tokens.accessToken);
          record.compatibility = withTokenCompatibility(record.compatibility, {
            resourceDropped: result.resourceDropped,
            scopesCommaSeparated: result.tokens.scopesCommaSeparated
          });
          if (result.resourceDropped) record.resource = null;
        }
      }

      await saveAuthorization(record);
      return { authorization: toView(record) };
    } finally {
      await keyStore.deleteItem(lockKey);
    }
  };

  const getAuthorization = async ({ ctx, projectId, authorizationId }: TGetAuthorizationDTO) => ({
    authorization: toView(await loadOwnAuthorization(authorizationId, ctx, projectId))
  });

  // Single use: the save that deletes the record wins, so two saves racing for one authorization end with one
  // winner. A save that then fails (a name conflict, say) restores it, so it can be retried without authorizing
  // again. Only an authorized record is consumed, and completion never rewrites one, so the record validated
  // here is the one deleted.
  const claimAuthorization = async ({
    authorizationId,
    projectId,
    accessBundleId,
    serviceId,
    ctx,
    serverUrl
  }: TClaimAuthorizationDTO) => {
    const recordKey = KeyStorePrefixes.AgentVaultOauthAuthorization(authorizationId);
    const { record, raw } = await loadOwnStoredAuthorization(authorizationId, ctx, projectId);
    if (record.accessBundleId.toLowerCase() !== accessBundleId.toLowerCase()) {
      throw new BadRequestError({
        message: "This authorization was started for a different access bundle. Authorize again here."
      });
    }
    assertAuthorizationServerUrl(record.serverUrl, serverUrl);
    if (record.serviceId && record.serviceId.toLowerCase() !== serviceId?.toLowerCase()) {
      throw new BadRequestError({
        message: serviceId
          ? "This authorization was started for a different service. Authorize this service again."
          : "This authorization reauthorizes an existing service, so it can't create a new one. Authorize again."
      });
    }
    if (record.status === AgentVaultOauthAuthorizationStatus.Failed) {
      throw new BadRequestError({
        message: `This authorization failed, so it can't be saved. Start a new one. ${record.error ?? ""}`.trim()
      });
    }
    if (record.status !== AgentVaultOauthAuthorizationStatus.Authorized || !record.sealedCredential) {
      throw new BadRequestError({ message: "This authorization hasn't finished yet. Finish signing in, then save." });
    }

    const remainingTtlSeconds = await keyStore.ttl(recordKey);
    if ((await keyStore.deleteItem(recordKey)) !== 1) {
      throw new ConflictError({
        message: "This authorization was already used by another save. Authorize the service again."
      });
    }

    // Never throws: it runs while a save is failing, and that save's own error is the one to report.
    const restore = async () => {
      if (!(remainingTtlSeconds > 0)) return;
      try {
        await keyStore.setItemWithExpiry(recordKey, remainingTtlSeconds, raw);
      } catch (error) {
        logger.warn(
          error,
          `agentVaultOauth: could not restore the authorization after a failed save [authorizationId=${authorizationId}]`
        );
      }
    };

    return { record, restore };
  };

  // The non-secret half goes to credentialConfig and the record's sealed blob becomes encryptedCredential as is:
  // both are the project cipher over the same JSON shape, so nothing is opened to move it.
  const buildCredentialFromAuthorization = (
    record: TAgentVaultOauthAuthorization,
    {
      authorizedBy,
      previousRequiredScopes = []
    }: {
      authorizedBy: { userId: string; username: string } | null;
      previousRequiredScopes?: string[];
    }
  ): { config: TAgentVaultOauthConfig; encryptedCredential: Buffer } => {
    const now = new Date().toISOString();
    // A provider may grant less than was asked, so a scope the upstream demanded stays missing until it's granted.
    const requiredScopes = [...new Set(previousRequiredScopes)].filter(
      (scope) => !record.grantedScopes.includes(scope)
    );
    return {
      config: {
        type: AgentVaultCredentialType.OAuth,
        grantType: AGENT_VAULT_OAUTH_GRANT_TYPE,
        serverUrl: record.serverUrl,
        issuer: record.issuer,
        authorizationEndpoint: record.authorizationEndpoint,
        tokenEndpoint: record.tokenEndpoint,
        resource: record.resource,
        clientId: record.clientId,
        registration: record.registration,
        tokenEndpointAuthMethod: record.tokenEndpointAuthMethod,
        compatibility: record.compatibility,
        requestedScopes: record.requestedScopes,
        grantedScopes: record.grantedScopes,
        requiredScopes,
        status: requiredScopes.length ? AgentVaultOauthStatus.NeedsAdditionalScopes : AgentVaultOauthStatus.Connected,
        expiresAt: record.expiresAt,
        accessTokenHash: record.accessTokenHash ?? "",
        authorizedBy,
        authorizedAt: now,
        lastRefreshedAt: null,
        lastError: null
      },
      encryptedCredential: Buffer.from(record.sealedCredential!, "base64")
    };
  };

  const toResolvedCredential = (config: TAgentVaultOauthConfig, accessToken: string): TResolvedOauthCredential => ({
    type: "bearer",
    headerName: AGENT_VAULT_OAUTH_HEADER_NAME,
    headerPrefix: AGENT_VAULT_OAUTH_HEADER_PREFIX,
    value: accessToken,
    source: "oauth",
    expiresAt: config.expiresAt
  });

  // An unchanged blob holds the same tokens, so a re-read only opens the blob when it changed.
  const loadOauthService = async (
    serviceId: string,
    cipher: () => Promise<TProjectCipher>,
    previous?: TLoadedOauthService
  ): Promise<TLoadedOauthService> => {
    const service = await agentVaultServiceDAL.findByIdPrimary(serviceId);
    if (!service || service.credentialType !== AgentVaultCredentialType.OAuth || !service.encryptedCredential) {
      throw new NotFoundError({ message: `OAuth service with ID '${serviceId}' not found` });
    }
    const secret = previous?.encryptedCredential.equals(service.encryptedCredential)
      ? previous.secret
      : openWith<TAgentVaultOauthSecret>(await cipher(), service.encryptedCredential);
    return {
      config: service.credentialConfig as TAgentVaultOauthConfig,
      secret,
      encryptedCredential: service.encryptedCredential,
      hostPattern: service.hostPattern,
      serverUrl: serverUrlOf(service.config)
    };
  };

  const writeStatus = async (
    serviceId: string,
    expectedEncryptedCredential: Buffer,
    { lastError, ...rest }: Partial<TAgentVaultOauthConfig>,
    previousStatus: AgentVaultOauthStatus
  ) => {
    // Whatever reached the message, jsonb has to be able to store it.
    const patch = {
      ...rest,
      ...(lastError === undefined ? {} : { lastError: normalizeProviderText(lastError) || null })
    };
    const updated = await agentVaultServiceDAL.compareAndSwapCredential({
      id: serviceId,
      expectedEncryptedCredential,
      credentialConfigPatch: patch
    });
    if (updated && patch.status && patch.status !== previousStatus) {
      logger.warn(
        `agentVaultOauth: service status changed [serviceId=${serviceId}] [from=${previousStatus}] [to=${patch.status}] [reason=${patch.lastError ?? "none"}]`
      );
    }
    return updated;
  };

  // One algorithm for resolve's lazy refresh and the proxy's on-demand refresh. A failing provider never throws
  // from here: the caller gets the current token and the failure is recorded on the service.
  const refreshServiceToken = async ({
    serviceId,
    projectId,
    rejectedTokenHash,
    requiredScopes,
    expiresWithinSeconds,
    destination
  }: TRefreshServiceTokenDTO): Promise<{ credential: TResolvedOauthCredential; status: AgentVaultOauthStatus }> => {
    let cipherPair: Promise<TProjectCipher> | null = null;
    const cipher = () => {
      cipherPair ??= getProjectCipher(projectId);
      return cipherPair;
    };

    // Checked on every row a token can come from, so a move that lands mid-refresh can't send the new server's
    // token to the old host, nor refresh a token the caller would then misdirect.
    const assertSameDestination = (loaded: TLoadedOauthService) => {
      if (
        loaded.hostPattern !== destination.hostPattern ||
        (destination.serverUrl !== undefined && loaded.serverUrl !== destination.serverUrl)
      ) {
        throw new ConflictError({ message: AGENT_VAULT_SERVICE_MOVED_MESSAGE });
      }
      return loaded;
    };
    const load = async (previous?: TLoadedOauthService) =>
      assertSameDestination(await loadOauthService(serviceId, cipher, previous));

    let current = await load();
    const answer = () => {
      assertSameDestination(current);
      return {
        credential: toResolvedCredential(current.config, current.secret.accessToken),
        status: current.config.status
      };
    };

    const fromWrittenRow = (
      row: NonNullable<Awaited<ReturnType<typeof writeStatus>>>,
      secret: TAgentVaultOauthSecret,
      encryptedCredential: Buffer
    ): TLoadedOauthService =>
      assertSameDestination({
        config: row.credentialConfig as TAgentVaultOauthConfig,
        secret,
        encryptedCredential,
        hostPattern: row.hostPattern,
        serverUrl: serverUrlOf(row.config)
      });

    // A failed swap means the row moved on (a reauthorization, usually), and the new row is the answer.
    const applyStatus = async (patch: Partial<TAgentVaultOauthConfig>) => {
      const updated = await writeStatus(serviceId, current.encryptedCredential, patch, current.config.status);
      current = updated ? fromWrittenRow(updated, current.secret, current.encryptedCredential) : await load(current);
    };

    if (requiredScopes?.length) {
      // Only the refused token is known to lack the scopes: a replacement may carry them. And a service that needs
      // reauthorizing keeps saying so, since reauthorizing is what fixes both.
      // Both conditions are checked again in the UPDATE, against the row it writes.
      if (
        rejectedTokenHash === current.config.accessTokenHash &&
        current.config.status !== AgentVaultOauthStatus.NeedsReauthorization
      ) {
        const previousStatus = current.config.status;
        const updated = await agentVaultServiceDAL.addRequiredScopes({
          id: serviceId,
          expectedEncryptedCredential: current.encryptedCredential,
          rejectedTokenHash,
          requiredScopes
        });
        current = updated ? fromWrittenRow(updated, current.secret, current.encryptedCredential) : await load(current);
        if (updated && previousStatus !== AgentVaultOauthStatus.NeedsAdditionalScopes) {
          logger.warn(
            `agentVaultOauth: service status changed [serviceId=${serviceId}] [from=${previousStatus}] [to=${AgentVaultOauthStatus.NeedsAdditionalScopes}] [reason=insufficient_scope]`
          );
        }
      }
      return answer();
    }

    const decide = () =>
      decideRefresh({
        status: current.config.status,
        expiresAt: current.config.expiresAt,
        accessTokenHash: current.config.accessTokenHash,
        hasRefreshToken: Boolean(current.secret.refreshToken),
        rejectedTokenHash,
        expiresWithinSeconds,
        now: new Date()
      });

    const markNeedsReauthorization = (reason: string) =>
      applyStatus({ status: AgentVaultOauthStatus.NeedsReauthorization, lastError: reason });

    const first = decide();
    if (first.action === "return-current") return answer();
    if (first.action === "needs-reauthorization") {
      await markNeedsReauthorization(first.reason);
      return answer();
    }

    let lock: TKeyStoreLock;
    try {
      lock = await keyStore.acquireLock(
        [KeyStorePrefixes.AgentVaultOauthRefreshLock(serviceId)],
        REFRESH_LOCK_DURATION_MS,
        REFRESH_LOCK_SETTINGS
      );
    } catch {
      // Another refresh held the lock the whole time; whatever it stored is the best answer available.
      current = await load(current);
      return answer();
    }

    try {
      current = await load(current);
      const second = decide();
      if (second.action === "return-current") return answer();
      if (second.action === "needs-reauthorization") {
        await markNeedsReauthorization(second.reason);
        return answer();
      }

      const { config, secret } = current;
      const result = await refreshAccessToken({
        http,
        serverUrl: config.resource ?? config.issuer,
        issuer: config.issuer,
        tokenEndpoint: config.tokenEndpoint,
        clientId: config.clientId,
        clientSecret: secret.clientSecret,
        tokenEndpointAuthMethod: config.tokenEndpointAuthMethod,
        resource: config.resource,
        requestedScopes: config.requestedScopes,
        sensitiveValues: [secret.accessToken],
        refreshToken: secret.refreshToken!
      });

      if (!result.ok) {
        if (result.errorCode === "invalid_grant") {
          await markNeedsReauthorization(
            "The MCP server no longer accepts the stored refresh token (it may have been revoked). Reauthorize this service."
          );
        } else {
          await applyStatus({ lastError: result.message });
          logger.warn(`agentVaultOauth: token refresh failed [serviceId=${serviceId}] [error=${result.message}]`);
        }
        return answer();
      }

      const now = new Date();
      const nextSecret: TAgentVaultOauthSecret = {
        accessToken: result.tokens.accessToken,
        // RFC 6749 section 6: a server that issues no new refresh token keeps the old one valid.
        refreshToken: result.tokens.refreshToken ?? secret.refreshToken,
        clientSecret: secret.clientSecret
      };
      const compatibility = withTokenCompatibility(config.compatibility, {
        resourceDropped: result.resourceDropped,
        scopesCommaSeparated: result.tokens.scopesCommaSeparated
      });
      const patch: Partial<TAgentVaultOauthConfig> = {
        // Missing scopes stay missing after a refresh; only reauthorizing can add them. `keepStatus` below covers a
        // scope report that lands after this read.
        status:
          config.status === AgentVaultOauthStatus.NeedsAdditionalScopes
            ? AgentVaultOauthStatus.NeedsAdditionalScopes
            : AgentVaultOauthStatus.Connected,
        expiresAt: expiresAtFrom(result.tokens.expiresIn, now),
        accessTokenHash: hashAccessToken(result.tokens.accessToken),
        grantedScopes: result.tokens.scopes ?? config.grantedScopes,
        lastRefreshedAt: now.toISOString(),
        lastError: null,
        ...(result.resourceDropped ? { resource: null } : {}),
        ...(compatibility === config.compatibility ? {} : { compatibility })
      };
      const encryptedCredential = sealWith(await cipher(), nextSecret);
      const swapped = await agentVaultServiceDAL.compareAndSwapCredential({
        id: serviceId,
        expectedEncryptedCredential: current.encryptedCredential,
        encryptedCredential,
        credentialConfigPatch: patch,
        keepStatus: { status: AgentVaultOauthStatus.NeedsAdditionalScopes, keys: ["requiredScopes"] }
      });

      if (!swapped) {
        // Someone reauthorized while this refresh was in flight, and their tokens stand.
        current = await load(current);
        return answer();
      }
      current = fromWrittenRow(swapped, nextSecret, encryptedCredential);
      return answer();
    } finally {
      await lock.release().catch(() => {});
    }
  };

  return {
    createAuthorization,
    completeAuthorization,
    getAuthorization,
    claimAuthorization,
    buildCredentialFromAuthorization,
    refreshServiceToken
  };
};
