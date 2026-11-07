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
import { OauthGrantType } from "@app/services/oauth-client/oauth-client-types";

import { TAgentVaultAccessBundleDALFactory } from "../agent-vault-access-bundle/agent-vault-access-bundle-dal";
import { TAgentVaultServiceDALFactory } from "../agent-vault-access-bundle/agent-vault-service-dal";
import { TAgentVaultPersonalValueDALFactory } from "../agent-vault-personal-value/agent-vault-personal-value-dal";
import {
  AgentVaultCredentialType,
  AgentVaultOauthAuthorizationStatus,
  AgentVaultOauthStatus,
  AgentVaultServiceType
} from "../agent-vault/agent-vault-enums";
import { TAgentVaultOwner } from "../agent-vault/agent-vault-owner-fns";
import { getAgentVaultReachability } from "../agent-vault/agent-vault-permission";
import { getServiceServerUrl } from "../agent-vault/agent-vault-service-type-fns";
import {
  manualOauthClient,
  OAUTH_CLIENT_ID_OR_DYNAMIC_MESSAGE,
  OAUTH_CLIENT_SECRET_NEEDS_ID_MESSAGE,
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
  isClientRefusedError,
  isDeadLoginError,
  isMemberProvidedOauth,
  isSameState,
  memberOauthSetupOf,
  normalizeProviderText,
  refreshAccessToken,
  TOKEN_REQUEST_BUDGET_MS,
  toResolvedOauthCredential,
  validateCallbackIssuer,
  withTokenCompatibility
} from "./agent-vault-oauth-token-fns";
import {
  AgentVaultOauthRegistration,
  TAgentVaultOauthAuthorization,
  TAgentVaultOauthAuthorizationView,
  TAgentVaultOauthConfig,
  TAgentVaultOauthMemberConfig,
  TAgentVaultOauthSecret,
  TClaimAuthorizationDTO,
  TCompleteAuthorizationDTO,
  TCreateAuthorizationDTO,
  TGetAuthorizationDTO,
  TRefreshServiceTokenDTO,
  TReportMissingScopesDTO,
  TResolvedOauthCredential
} from "./agent-vault-oauth-types";

const AGENT_VAULT_OAUTH_AUTHORIZATION_TTL_SECONDS = 10 * 60;
const COMPLETE_LOCK_TTL_SECONDS = 60;
// Outlasts the holder's work: the token requests share a 7 second budget.
const REFRESH_LOCK_DURATION_MS = 15 * 1000;
// How long a refresh waits for a concurrent one of the same service before answering with whatever is stored.
// Resolve waits ~3s, since its own 4 second budget sends the stored token anyway. The proxy's refresh after a 401
// waits ~10s, so it outlasts the holder's 7 second token budget and gets the new token instead of the rejected one.
const RESOLVE_REFRESH_LOCK_SETTINGS = { retryCount: 12, retryDelay: 200, retryJitter: 50 };
const REJECTED_TOKEN_REFRESH_LOCK_SETTINGS = { retryCount: 48, retryDelay: 200, retryJitter: 50 };
// A refresh answers within this, under the proxy's 15 second timeout, so a waiter whose holder failed gets only the
// time left for its own token request, and skips it below the minimum.
const REFRESH_ANSWER_DEADLINE_MS = 13 * 1000;
const MIN_REFRESH_BUDGET_MS = 1000;
const AGENT_VAULT_OAUTH_CALLBACK_PATH = "/agent-vault/oauth/callback";

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
  agentVaultPersonalValueDAL: Pick<
    TAgentVaultPersonalValueDALFactory,
    "findOauthForOwner" | "compareAndSwapOauth" | "addRequiredScopes"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  membershipDAL: Pick<TMembershipDALFactory, "findResourceMembershipsForActor">;
  http?: TOauthHttpClient;
};

export type TAgentVaultOauthServiceFactory = ReturnType<typeof agentVaultOauthServiceFactory>;

type TProjectCipher = Awaited<ReturnType<TKmsServiceFactory["createCipherPairWithDataKey"]>>;

type TLoadedOauthService = {
  // The row the tokens were read from, which every write is made against.
  rowId: string;
  config: TAgentVaultOauthConfig;
  secret: TAgentVaultOauthSecret;
  encryptedCredential: Buffer;
  hostPattern: string;
  serverUrl: string | null;
};

// What a write is compared against: the row and sealed tokens a load returned, and where that row pointed.
type TOauthTokenSnapshot = Omit<TLoadedOauthService, "secret" | "config">;

// Where a refresh or scope report reads and writes the tokens: the service row, or the personal value row of the member
// whose session asked.
type TOauthTokenHolder = {
  lockKey: string;
  logLabel: string;
  deadLoginMessage: (reason: string, refusal: { clientRefused: boolean; config: TAgentVaultOauthConfig }) => string;
  // Appended to a reason that names no recovery step, since the step differs for the service and for a member.
  reauthorizeStep: string;
  load: () => Promise<Omit<TLoadedOauthService, "secret"> | undefined>;
  swap: (args: {
    from: TOauthTokenSnapshot;
    secret?: Buffer;
    patch: Partial<TAgentVaultOauthConfig>;
    keepAdditionalScopesStatus?: boolean;
  }) => Promise<Omit<TLoadedOauthService, "secret" | "encryptedCredential"> | undefined>;
  addRequiredScopes: (args: {
    from: TOauthTokenSnapshot;
    rejectedTokenHash: string;
    requiredScopes: string[];
  }) => Promise<unknown>;
};

export const AGENT_VAULT_SERVICE_MOVED_MESSAGE =
  "This service's server changed after the proxy last fetched it, so Infisical won't send its credential to the old host. The proxy picks up the change on its next poll.";

// Names hosts only: a server URL's path or query can hold a key.
const assertAuthorizationServerUrl = (authorizedServerUrl: string, serviceServerUrl: string | null) => {
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
  "This service uses OAuth, so its server URL can only be changed by reauthorizing it in the Infisical UI.";

const AGENT_VAULT_REAUTHORIZED_DURING_SAVE_MESSAGE =
  "This service was reauthorized by another save while this one was in progress, and that newer connection was kept. Reload the service, then authorize again if you still want to replace it.";

// Run under the bundle lock against the row read there, since a save that landed after the first read may have
// moved the service or reauthorized it. A newer reauthorization wins over a stale one, so an older authorization
// can't swap the account the service acts as back. A refresh doesn't count: it keeps `authorizedAt`, and its
// rotated tokens are what this save replaces anyway. Returns the required scopes still to carry over, which are none
// when the new authorization is from another issuer: the sign-in didn't ask for them either.
export const checkOauthClaimUnderLock = ({
  authorizedServerUrl,
  authorizedIssuer,
  lockedServerUrl,
  readOauth,
  lockedOauth
}: {
  authorizedServerUrl: string;
  authorizedIssuer: string;
  lockedServerUrl: string | null;
  readOauth: Pick<TAgentVaultOauthConfig, "authorizedAt"> | undefined;
  lockedOauth: Pick<TAgentVaultOauthConfig, "authorizedAt" | "issuer" | "requiredScopes"> | undefined;
}) => {
  assertAuthorizationServerUrl(authorizedServerUrl, lockedServerUrl);
  if ((readOauth?.authorizedAt ?? null) !== (lockedOauth?.authorizedAt ?? null)) {
    throw new ConflictError({ message: AGENT_VAULT_REAUTHORIZED_DURING_SAVE_MESSAGE });
  }
  return lockedOauth?.issuer === authorizedIssuer ? lockedOauth.requiredScopes : [];
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
  agentVaultPersonalValueDAL,
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
    clientId: requestedClientId,
    clientSecret: requestedClientSecret,
    registration: requestedRegistration,
    personal
  }: TCreateAuthorizationDTO) => {
    const { permission, accessBundleIds } = await getAgentVaultReachability(
      { permissionService, membershipDAL },
      { projectId, ctx }
    );
    // A member's own sign-in needs only the reach to use the service; connecting the service itself is an admin's job.
    ForbiddenError.from(permission).throwUnlessCan(
      personal
        ? ProjectPermissionAgentVaultAccessBundleActions.Read
        : ProjectPermissionAgentVaultAccessBundleActions.Edit,
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
    if (personal && !serviceId) {
      throw new BadRequestError({
        message: "Send the serviceId of the service you're connecting your own account to."
      });
    }
    if (personal && (requestedClientId || requestedClientSecret || requestedRegistration)) {
      throw new BadRequestError({
        message:
          "Leave out clientId, clientSecret and registration when personal is true. Every member signs in with the client the service's admin set up."
      });
    }
    let clientId = requestedClientId;
    let clientSecret = requestedClientSecret;
    if (clientSecret && !clientId) {
      throw new BadRequestError({ message: OAUTH_CLIENT_SECRET_NEEDS_ID_MESSAGE });
    }
    if (clientId && requestedRegistration === AgentVaultOauthRegistration.Dynamic) {
      throw new BadRequestError({
        message: OAUTH_CLIENT_ID_OR_DYNAMIC_MESSAGE
      });
    }

    let stored: { config: TAgentVaultOauthConfig; clientSecret?: string } | null = null;
    let memberConfig: TAgentVaultOauthMemberConfig | null = null;
    let memberSetup: string | undefined;
    if (serviceId) {
      const service = await agentVaultServiceDAL.findByIdInAccessBundle({ id: serviceId, accessBundleId: bundle.id });
      if (!service) throw new NotFoundError({ message: `Service with ID '${serviceId}' not found` });
      if (service.type !== AgentVaultServiceType.Mcp) {
        throw new BadRequestError({
          message: `The service '${service.name}' is an HTTP service. Only MCP services use OAuth.`
        });
      }
      const memberProvided = isMemberProvidedOauth(service);
      if (personal) {
        if (!memberProvided) {
          throw new BadRequestError({
            message: `The service '${service.name}' doesn't leave its OAuth sign-in to members, so there is nothing of your own to connect.`
          });
        }
        assertAuthorizationServerUrl(serverUrl, getServiceServerUrl(service.config));
        memberConfig = service.credentialConfig as TAgentVaultOauthMemberConfig;
        memberSetup = memberOauthSetupOf(service);
        // Every member signs in with the admin-entered client, when there is one.
        if (memberConfig.registration === AgentVaultOauthRegistration.Manual && memberConfig.clientId) {
          clientId = memberConfig.clientId;
          clientSecret = service.encryptedCredential
            ? (await open<{ clientSecret?: string }>(projectId, service.encryptedCredential)).clientSecret
            : undefined;
        }
        // The member's previous sign-in, for its scopes and, if registration fails, its client.
        const previous = await agentVaultPersonalValueDAL.findOauthForOwner({
          serviceId: service.id,
          owner: { userId: ctx.actorId }
        });
        if (previous) {
          const secret = await open<TAgentVaultOauthSecret>(projectId, previous.encryptedValue);
          stored = { config: previous.oauthConfig as TAgentVaultOauthConfig, clientSecret: secret.clientSecret };
        }
      } else if (
        service.credentialType === AgentVaultCredentialType.OAuth &&
        service.encryptedCredential &&
        !memberProvided
      ) {
        const secret = await open<TAgentVaultOauthSecret>(projectId, service.encryptedCredential);
        stored = { config: service.credentialConfig as TAgentVaultOauthConfig, clientSecret: secret.clientSecret };
      }
    }

    const callbackUri = redirectUri();
    const discovery = await discoverOauthServer(http, serverUrl);
    const compatibility = [...discovery.compatibility];
    // The admin-entered client was registered at the issuer the service was set up with, and nowhere else.
    if (memberConfig?.registration === AgentVaultOauthRegistration.Manual && discovery.issuer !== memberConfig.issuer) {
      throw oauthSetupError(
        serverUrl,
        "the server now signs in through a different issuer than the one this service's OAuth app was set up for. Ask a project admin to enter the OAuth app's client secret again in the service's settings, or the client ID and secret of an app registered with the new issuer."
      );
    }

    // A client is only ever used with the issuer it was registered at, and so are the scopes it was granted.
    const sameIssuerStored = stored && stored.config.issuer === discovery.issuer ? stored : null;
    // Switching a service from its own OAuth app back to automatic setup must not sign in with that app again.
    const reusableStored =
      requestedRegistration === AgentVaultOauthRegistration.Dynamic &&
      sameIssuerStored?.config.registration === AgentVaultOauthRegistration.Manual
        ? null
        : sameIssuerStored;

    let client: TOauthClient | null = null;
    let registration: AgentVaultOauthRegistration | null = null;
    let temporaryRegistrationError: OauthRegistrationError | null = null;
    if (clientId) {
      client = manualOauthClient({
        clientId,
        clientSecret,
        tokenEndpointAuthMethodsSupported: discovery.tokenEndpointAuthMethodsSupported
      });
      registration = AgentVaultOauthRegistration.Manual;
    } else if (
      reusableStored?.config.registration !== AgentVaultOauthRegistration.Manual &&
      discovery.registrationEndpoint
    ) {
      // Reauthorizing registers a fresh client rather than reusing the stored one, which the server may have dropped
      // (expired, or registered for an old SITE_URL), and then the sign-in would fail on the provider's page without
      // Infisical ever hearing back. Only a client entered by hand is kept, since nothing can register it again.
      try {
        const registered = await registerOauthClient({
          http,
          serverUrl,
          registrationEndpoint: discovery.registrationEndpoint,
          redirectUri: callbackUri,
          grantTypesSupported: discovery.grantTypesSupported,
          tokenEndpointAuthMethodsSupported: discovery.tokenEndpointAuthMethodsSupported
        });
        client = registered.client;
        compatibility.push(...registered.compatibility);
        registration = AgentVaultOauthRegistration.Dynamic;
      } catch (error) {
        if (!(error instanceof OauthRegistrationError)) throw error;
        // A guessed /register that isn't there means the server has no registration, not that it is broken.
        // Either way the fix is the same, an admin-entered client, so the caller is asked for one.
        if (!discovery.endpointsGuessed) {
          logger.warn(
            `agentVaultOauth: client registration failed [projectId=${projectId}] [server=${describeServer(serverUrl)}] [error=${error.message}]`
          );
          // An outage at an advertised endpoint says nothing about needing an admin-entered client.
          if (error.status === null || error.status === 429 || error.status >= 500) temporaryRegistrationError = error;
        }
      }
    }
    // The stored client is still worth trying when no fresh one could be registered.
    if (!client && reusableStored) {
      client = {
        clientId: reusableStored.config.clientId,
        clientSecret: reusableStored.clientSecret,
        tokenEndpointAuthMethod: reusableStored.config.tokenEndpointAuthMethod
      };
      registration = reusableStored.config.registration;
    }
    if (!client && temporaryRegistrationError) {
      throw oauthSetupError(serverUrl, `${temporaryRegistrationError.message} Try again in a few minutes.`);
    }
    // A member can't enter a client, so there is nothing to ask them for.
    if (personal && (!client || !registration)) {
      throw oauthSetupError(
        serverUrl,
        "the server didn't let Infisical register a client for your sign-in. Ask a project admin to set the service up with their own OAuth app."
      );
    }
    if (!client || !registration) {
      return {
        registrationRequired: true,
        oauthAdvertised: discovery.oauthAdvertised,
        redirectUri: callbackUri,
        authorization: null
      };
    }

    const storedScopes = sameIssuerStored
      ? [...new Set([...sameIssuerStored.config.grantedScopes, ...sameIssuerStored.config.requiredScopes])]
      : [];
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
      ...(personal ? { personal: true, memberSetup } : {}),
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
      oauthAdvertised: discovery.oauthAdvertised,
      redirectUri: callbackUri,
      authorization: {
        id,
        authorizeUrl: buildAuthorizeUrl({
          authorizationEndpoint: record.authorizationEndpoint,
          clientId: client.clientId,
          redirectUri: callbackUri,
          codeChallenge,
          state,
          resource: record.resource,
          scopes: requestedScopes
        })
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

      // RFC 9207 section 2.4: a response from the wrong issuer is not trusted, its error text included.
      if (issuerProblem) {
        fail(issuerProblem);
      } else if (error) {
        const providerError = normalizeProviderText(error, undefined, [code, state]);
        const detail =
          normalizeProviderText(errorDescription, undefined, [code, state]) || providerError || "no reason given";
        fail(
          providerError === "access_denied"
            ? `Access to '${host}' was denied, so nothing was connected.`
            : `'${host}' didn't authorize Infisical: ${detail}`
        );
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

  const loadUsableAuthorization = async (
    { authorizationId, projectId, accessBundleId, serviceId, ctx, serverUrl, personal }: TClaimAuthorizationDTO,
    action: string,
    { anyIntent = false }: { anyIntent?: boolean } = {}
  ) => {
    const stored = await loadOwnStoredAuthorization(authorizationId, ctx, projectId);
    const { record } = stored;
    // A member's sign-in only ever becomes their own personal value, and an admin's only the service's credential.
    if (!anyIntent && Boolean(record.personal) !== Boolean(personal)) {
      throw new BadRequestError({
        message: personal
          ? "This authorization was started to connect the service itself, not your own account. Connect your account again."
          : "This authorization connects your own account, so it can't set the service's credential. Authorize the service again."
      });
    }
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
        message: `This authorization failed, so it can't be used. Start a new one. ${record.error ?? ""}`.trim()
      });
    }
    if (record.status !== AgentVaultOauthAuthorizationStatus.Authorized || !record.sealedCredential) {
      throw new BadRequestError({
        message: `This authorization hasn't finished yet. Finish signing in, then ${action}.`
      });
    }
    return stored;
  };

  // Single use: the save that deletes the record wins, so two saves racing for one authorization end with one
  // winner. A save that then fails (a name conflict, say) restores it, so it can be retried without authorizing
  // again. Only an authorized record is consumed, and completion never rewrites one, so the record validated
  // here is the one deleted.
  const claimAuthorization = async (dto: TClaimAuthorizationDTO) => {
    const recordKey = KeyStorePrefixes.AgentVaultOauthAuthorization(dto.authorizationId);
    const { record, raw } = await loadUsableAuthorization(dto, "save");

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
          `agentVaultOauth: could not restore the authorization after a failed save [authorizationId=${dto.authorizationId}]`
        );
      }
    };

    return { record, restore };
  };

  // Loading a server's tools before the service is saved. Reads the authorization without claiming it, so the save
  // that follows still can, and applies the same checks the save will except intent: nothing is stored, so an admin
  // may load the tools of a service that leaves sign-in to members with a sign-in of their own, made as a member.
  const readAuthorizationAccessToken = async (dto: Omit<TClaimAuthorizationDTO, "personal">) => {
    const { record } = await loadUsableAuthorization(dto, "load the tools", { anyIntent: true });
    const secret = await open<TAgentVaultOauthSecret>(dto.projectId, Buffer.from(record.sealedCredential!, "base64"));
    return secret.accessToken;
  };

  // The non-secret half goes to credentialConfig and the record's sealed blob becomes encryptedCredential as is:
  // both are the project cipher over the same JSON shape, so nothing is opened to move it.
  const buildCredentialFromAuthorization = (
    record: TAgentVaultOauthAuthorization,
    { previousRequiredScopes = [] }: { previousRequiredScopes?: string[] } = {}
  ): { config: TAgentVaultOauthConfig; encryptedCredential: Buffer } => {
    const now = new Date().toISOString();
    // A provider may grant less than was asked, so a scope the upstream demanded stays missing until it's granted.
    const requiredScopes = [...new Set(previousRequiredScopes)].filter(
      (scope) => !record.grantedScopes.includes(scope)
    );
    return {
      config: {
        type: AgentVaultCredentialType.OAuth,
        grantType: OauthGrantType.AuthorizationCode,
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
        authorizedAt: now,
        lastRefreshedAt: null,
        lastError: null
      },
      encryptedCredential: Buffer.from(record.sealedCredential!, "base64")
    };
  };

  const serviceTokenHolder = (serviceId: string): TOauthTokenHolder => ({
    lockKey: KeyStorePrefixes.AgentVaultOauthRefreshLock(serviceId),
    logLabel: `serviceId=${serviceId}`,
    deadLoginMessage: (reason) => `This service's login is no longer accepted (${reason}). Reauthorize this service.`,
    reauthorizeStep: "Reauthorize this service.",
    load: async () => {
      const service = await agentVaultServiceDAL.findByIdPrimary(serviceId);
      if (
        !service ||
        service.credentialType !== AgentVaultCredentialType.OAuth ||
        !service.encryptedCredential ||
        isMemberProvidedOauth(service)
      ) {
        return undefined;
      }
      return {
        rowId: service.id,
        config: service.credentialConfig as TAgentVaultOauthConfig,
        encryptedCredential: service.encryptedCredential,
        hostPattern: service.hostPattern,
        serverUrl: getServiceServerUrl(service.config)
      };
    },
    swap: async ({ from, secret, patch, keepAdditionalScopesStatus }) => {
      const row = await agentVaultServiceDAL.compareAndSwapCredential({
        id: from.rowId,
        expectedEncryptedCredential: from.encryptedCredential,
        encryptedCredential: secret,
        credentialConfigPatch: patch,
        keepAdditionalScopesStatus
      });
      return row
        ? {
            rowId: row.id,
            config: row.credentialConfig as TAgentVaultOauthConfig,
            hostPattern: row.hostPattern,
            serverUrl: getServiceServerUrl(row.config)
          }
        : undefined;
    },
    addRequiredScopes: ({ from, rejectedTokenHash, requiredScopes }) =>
      agentVaultServiceDAL.addRequiredScopes({
        id: from.rowId,
        expectedEncryptedCredential: from.encryptedCredential,
        rejectedTokenHash,
        requiredScopes
      })
  });

  // The owner's row is re-read by service and owner on every load, since a reconnect replaces it; a swap against the
  // replaced row's id then matches nothing and the reconnect's tokens stand.
  const personalTokenHolder = (serviceId: string, owner: TAgentVaultOwner): TOauthTokenHolder => {
    const ownerId = (owner.userId ?? owner.identityId)!;
    return {
      lockKey: KeyStorePrefixes.AgentVaultOauthPersonalRefreshLock(serviceId, ownerId),
      logLabel: `serviceId=${serviceId}] [ownerId=${ownerId}`,
      // Reconnecting signs in with the admin's app again, so a refused app is only fixed by an admin. A dynamic client is
      // registered afresh on reconnect.
      deadLoginMessage: (reason, { clientRefused, config }) =>
        clientRefused && config.registration === AgentVaultOauthRegistration.Manual
          ? `The provider refused the OAuth app this service signs in with (${reason}). Reconnecting won't fix this. Ask a project admin to update the OAuth app on the service.`
          : `Your login to this service is no longer accepted (${reason}). Connect your account again.`,
      reauthorizeStep: "Connect your account again.",
      load: async () => {
        const row = await agentVaultPersonalValueDAL.findOauthForOwner({ serviceId, owner });
        if (!row) return undefined;
        return {
          rowId: row.id,
          config: row.oauthConfig as TAgentVaultOauthConfig,
          encryptedCredential: row.encryptedValue,
          hostPattern: row.hostPattern,
          serverUrl: getServiceServerUrl(row.config)
        };
      },
      swap: async ({ from, secret, patch, keepAdditionalScopesStatus }) => {
        const row = await agentVaultPersonalValueDAL.compareAndSwapOauth({
          id: from.rowId,
          expectedEncryptedValue: from.encryptedCredential,
          encryptedValue: secret,
          oauthConfigPatch: patch,
          keepAdditionalScopesStatus
        });
        // Changing where the service points deletes every member's row, so a row still there points where it did.
        return row
          ? {
              rowId: from.rowId,
              config: row.oauthConfig as TAgentVaultOauthConfig,
              hostPattern: from.hostPattern,
              serverUrl: from.serverUrl
            }
          : undefined;
      },
      addRequiredScopes: ({ from, rejectedTokenHash, requiredScopes }) =>
        agentVaultPersonalValueDAL.addRequiredScopes({
          id: from.rowId,
          expectedEncryptedValue: from.encryptedCredential,
          rejectedTokenHash,
          requiredScopes
        })
    };
  };

  const tokenHolderOf = (serviceId: string, owner?: TAgentVaultOwner) =>
    owner ? personalTokenHolder(serviceId, owner) : serviceTokenHolder(serviceId);

  const tokensNotFound = (serviceId: string, owner?: TAgentVaultOwner) =>
    new NotFoundError({
      message: owner
        ? `No connected account was found for the service with ID '${serviceId}'. Connect your account again.`
        : `OAuth service with ID '${serviceId}' not found`
    });

  // An unchanged blob holds the same tokens, so a re-read only opens the blob when it changed.
  const loadOauthTokens = async (
    holder: TOauthTokenHolder,
    notFound: () => Error,
    cipher: () => Promise<TProjectCipher>,
    previous?: TLoadedOauthService
  ): Promise<TLoadedOauthService> => {
    const loaded = await holder.load();
    if (!loaded) throw notFound();
    const secret = previous?.encryptedCredential.equals(loaded.encryptedCredential)
      ? previous.secret
      : openWith<TAgentVaultOauthSecret>(await cipher(), loaded.encryptedCredential);
    return { ...loaded, secret };
  };

  const writeStatus = async (
    holder: TOauthTokenHolder,
    from: TOauthTokenSnapshot,
    { lastError, ...rest }: Partial<TAgentVaultOauthConfig>,
    previousStatus: AgentVaultOauthStatus
  ) => {
    // Whatever reached the message, jsonb has to be able to store it.
    const patch = {
      ...rest,
      ...(lastError === undefined ? {} : { lastError: normalizeProviderText(lastError) || null })
    };
    const updated = await holder.swap({ from, patch });
    if (updated && patch.status && patch.status !== previousStatus) {
      logger.warn(
        `agentVaultOauth: status changed [${holder.logLabel}] [from=${previousStatus}] [to=${patch.status}] [reason=${patch.lastError ?? "none"}]`
      );
    }
    return updated;
  };

  // One algorithm for resolve's lazy refresh and the proxy's on-demand refresh, for a service's own tokens or a
  // member's. A failing provider never throws from here: the caller gets the current token and the failure is
  // recorded where the tokens live.
  const refreshServiceToken = async ({
    serviceId,
    projectId,
    owner,
    rejectedTokenHash,
    expiresWithinSeconds,
    destination
  }: TRefreshServiceTokenDTO): Promise<{ credential: TResolvedOauthCredential; status: AgentVaultOauthStatus }> => {
    const deadline = Date.now() + REFRESH_ANSWER_DEADLINE_MS;
    const holder = tokenHolderOf(serviceId, owner);
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
      assertSameDestination(await loadOauthTokens(holder, () => tokensNotFound(serviceId, owner), cipher, previous));

    let current = await load();
    const answer = () => {
      assertSameDestination(current);
      return {
        credential: toResolvedOauthCredential(current.config, current.secret.accessToken),
        status: current.config.status
      };
    };

    const fromWrittenRow = (
      row: NonNullable<Awaited<ReturnType<TOauthTokenHolder["swap"]>>>,
      secret: TAgentVaultOauthSecret,
      encryptedCredential: Buffer
    ): TLoadedOauthService => assertSameDestination({ ...row, secret, encryptedCredential });

    // A failed swap means the row moved on (a reauthorization, usually), and the new row is the answer.
    const applyStatus = async (patch: Partial<TAgentVaultOauthConfig>) => {
      const updated = await writeStatus(holder, current, patch, current.config.status);
      current = updated ? fromWrittenRow(updated, current.secret, current.encryptedCredential) : await load(current);
    };

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
      await markNeedsReauthorization(`${first.reason} ${holder.reauthorizeStep}`);
      return answer();
    }

    let lock: TKeyStoreLock;
    try {
      lock = await keyStore.acquireLock(
        [holder.lockKey],
        REFRESH_LOCK_DURATION_MS,
        rejectedTokenHash === undefined ? RESOLVE_REFRESH_LOCK_SETTINGS : REJECTED_TOKEN_REFRESH_LOCK_SETTINGS
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
        await markNeedsReauthorization(`${second.reason} ${holder.reauthorizeStep}`);
        return answer();
      }

      const budgetMs = Math.min(TOKEN_REQUEST_BUDGET_MS, deadline - Date.now());
      if (budgetMs < MIN_REFRESH_BUDGET_MS) return answer();

      const { config, secret } = current;
      const result = await refreshAccessToken({
        http,
        issuer: config.issuer,
        tokenEndpoint: config.tokenEndpoint,
        clientId: config.clientId,
        clientSecret: secret.clientSecret,
        tokenEndpointAuthMethod: config.tokenEndpointAuthMethod,
        resource: config.resource,
        requestedScopes: config.requestedScopes,
        sensitiveValues: [secret.accessToken],
        refreshToken: secret.refreshToken!,
        budgetMs
      });

      if (!result.ok) {
        if (isDeadLoginError(result.errorCode)) {
          await markNeedsReauthorization(
            holder.deadLoginMessage(result.message, {
              clientRefused: isClientRefusedError(result.errorCode),
              config
            })
          );
        } else {
          await applyStatus({ lastError: result.message });
          logger.warn(`agentVaultOauth: token refresh failed [${holder.logLabel}] [error=${result.message}]`);
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
        // Missing scopes stay missing after a refresh; only reauthorizing can add them.
        // `keepAdditionalScopesStatus` below covers a scope report that lands after this read.
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
      const swapped = await holder.swap({
        from: current,
        secret: encryptedCredential,
        patch,
        keepAdditionalScopesStatus: true
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

  // From a `403 insufficient_scope` challenge. Nothing is refreshed, since only reauthorizing can add scopes. Only
  // the refused token is known to lack them (a replacement may carry them), and a connection that needs reauthorizing
  // keeps saying so; the UPDATE checks both against the row it writes, so a report that matches neither is a no-op.
  const reportMissingScopes = async ({
    serviceId,
    owner,
    rejectedTokenHash,
    requiredScopes,
    hostPattern
  }: TReportMissingScopesDTO) => {
    const holder = tokenHolderOf(serviceId, owner);
    const loaded = await holder.load();
    if (!loaded) throw tokensNotFound(serviceId, owner);
    if (loaded.hostPattern !== hostPattern) throw new ConflictError({ message: AGENT_VAULT_SERVICE_MOVED_MESSAGE });

    const previousStatus = loaded.config.status;
    const updated = await holder.addRequiredScopes({
      from: loaded,
      rejectedTokenHash,
      requiredScopes
    });
    if (updated && previousStatus !== AgentVaultOauthStatus.NeedsAdditionalScopes) {
      logger.warn(
        `agentVaultOauth: status changed [${holder.logLabel}] [from=${previousStatus}] [to=${AgentVaultOauthStatus.NeedsAdditionalScopes}] [reason=insufficient_scope]`
      );
    }
  };

  // For a service whose sign-in each member does: the server is checked once at setup, so a URL with no OAuth fails
  // the save rather than every member's sign-in, and the client every member signs in with is settled here. Nothing
  // is kept: each member's sign-in registers its own client, as an admin's reauthorization does. A guessed /register
  // is tried once here, and the client it creates is left unused.
  const prepareMemberOauth = async ({
    serverUrl,
    clientId,
    clientSecret
  }: {
    serverUrl: string;
    clientId?: string | null;
    clientSecret?: string;
  }): Promise<{ config: TAgentVaultOauthMemberConfig; clientSecret?: string }> => {
    if (clientSecret && !clientId) {
      throw new BadRequestError({ message: OAUTH_CLIENT_SECRET_NEEDS_ID_MESSAGE, details: { oauthSetup: true } });
    }
    const discovery = await discoverOauthServer(http, serverUrl);
    if (!clientId) {
      // Both refusals carry the signal the admin's own sign-in gets as `registrationRequired`, so the sheet opens the
      // client fields.
      if (!discovery.oauthAdvertised) {
        throw oauthSetupError(
          serverUrl,
          "the server doesn't advertise OAuth, so members would have nothing to sign in to. Check the server URL, or enter the client ID of your own OAuth app if the server supports OAuth without advertising it.",
          { registrationRequired: true }
        );
      }
      const noRegistration = () =>
        oauthSetupError(
          serverUrl,
          "the server doesn't support automatic client registration. Enter the client ID (and secret, if it has one) of your own OAuth app, which every member then signs in with.",
          { registrationRequired: true }
        );
      if (!discovery.registrationEndpoint) throw noRegistration();
      // A guessed /register is only known to work once it does, so a client is registered and left unused rather than
      // every member's sign-in failing later. An advertised endpoint is trusted, as an admin's own sign-in trusts it.
      if (discovery.endpointsGuessed) {
        try {
          await registerOauthClient({
            http,
            serverUrl,
            registrationEndpoint: discovery.registrationEndpoint,
            redirectUri: redirectUri(),
            grantTypesSupported: discovery.grantTypesSupported,
            tokenEndpointAuthMethodsSupported: discovery.tokenEndpointAuthMethodsSupported
          });
        } catch (error) {
          if (error instanceof OauthRegistrationError) throw noRegistration();
          throw error;
        }
      }
    }
    return {
      config: {
        type: AgentVaultCredentialType.OAuth,
        serverUrl,
        issuer: discovery.issuer,
        registration: clientId ? AgentVaultOauthRegistration.Manual : AgentVaultOauthRegistration.Dynamic,
        clientId: clientId ?? null
      },
      clientSecret
    };
  };

  return {
    createAuthorization,
    completeAuthorization,
    getAuthorization,
    claimAuthorization,
    readAuthorizationAccessToken,
    buildCredentialFromAuthorization,
    refreshServiceToken,
    reportMissingScopes,
    prepareMemberOauth
  };
};
