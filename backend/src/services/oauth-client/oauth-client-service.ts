import { ForbiddenError } from "@casl/ability";

import { OrganizationActionScope, OrgMembershipStatus, TOauthClients, TOrganizations } from "@app/db/schemas";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TOidcConfigDALFactory } from "@app/ee/services/oidc/oidc-config-dal";
import {
  OrgPermissionActions,
  OrgPermissionSsoActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, ForbiddenRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { getMinExpiresIn } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { OrgServiceActor } from "@app/lib/types";
import { getUserAgentType } from "@app/server/plugins/audit-log";
import { getRequiredMfaMethod } from "@app/services/auth/auth-fns";
import { ActorType, AuthMethod, AuthTokenType, MfaMethod } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";
import { UserAliasType } from "@app/services/user-alias/user-alias-types";

import { TOauthClientDALFactory } from "./oauth-client-dal";
import {
  assertValidOauthClientGrantConfig,
  computePkceChallenge,
  getOauthClientSessionUserAgent,
  hasClientAuthorityChanged,
  hasWithdrawnTokenExchangeTrust,
  isRegisteredRedirectUri,
  PKCE_CODE_VERIFIER_REGEX
} from "./oauth-client-fns";
import {
  DEFAULT_OAUTH_ACCESS_TOKEN_TTL_SECONDS,
  OauthAuthorizationCodePayloadSchema,
  OauthDelegationMode,
  OauthGrantType,
  OauthTokenType,
  TCreateOauthClientDTO,
  TOauthAuthorizeInfoDTO,
  TOauthConsentDTO,
  TOauthRefreshJwtTokenPayload,
  TOauthTokenExchangeDTO,
  TUpdateOauthClientDTO
} from "./oauth-client-types";
import { getOauthScopeDescriptions, parseOauthScopeString } from "./oauth-scope";
import { OauthTokenError, OauthTokenErrorCode } from "./oauth-token-error";
import { verifySubjectToken } from "./oauth-token-exchange-fns";

type TOauthClientServiceFactoryDep = {
  oauthClientDAL: TOauthClientDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiry" | "getItem" | "deleteItem">;
  tokenService: Pick<
    TAuthTokenServiceFactory,
    | "getUserTokenSession"
    | "getUserTokenSessionById"
    | "validateRefreshToken"
    | "rotateRefreshToken"
    | "revokeSessionsByUserAgent"
  >;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findEffectiveOrgMembership">;
  userDAL: Pick<TUserDALFactory, "findById">;
  oidcConfigDAL: Pick<TOidcConfigDALFactory, "findOne">;
  userAliasDAL: Pick<TUserAliasDALFactory, "findOne">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

export type TOauthClientServiceFactory = ReturnType<typeof oauthClientServiceFactory>;

const sanitizeOauthClient = (client: TOauthClients) => {
  const { clientSecretHash, ...rest } = client;
  return rest;
};

const getGrantTypes = (client: TOauthClients) => client.grantTypes as OauthGrantType[];

const expiresInToSeconds = (expiresIn: string | number) =>
  typeof expiresIn === "number" ? expiresIn : Math.floor(ms(expiresIn) / 1000);

const assertAccessTokenTtlWithinInstanceLimit = (accessTokenTTL?: number) => {
  if (accessTokenTTL === undefined) return;

  const instanceLimit = expiresInToSeconds(getConfig().JWT_AUTH_LIFETIME);
  if (accessTokenTTL > instanceLimit) {
    throw new BadRequestError({
      message: `The access token lifetime cannot exceed ${instanceLimit} seconds.`
    });
  }
};

type TOauthTokenClaims = {
  authMethod: AuthMethod;
  userId: string;
  tokenVersionId: string;
  organizationId: string;
  isMfaVerified?: boolean;
  mfaMethod?: MfaMethod;
} & ({ scopes: string[]; delegation?: never } | { delegation: OauthDelegationMode.Full; scopes?: never });

type TGrantConfigInput = {
  grantTypes?: OauthGrantType[];
  redirectUris?: string[];
  requirePkce?: boolean;
  tokenExchangeAudience?: string | null;
  tokenExchangeIdpSatisfiesMfa?: boolean;
};

const signOauthToken = (
  claims: TOauthTokenClaims & {
    oauthClientId: string;
    tokenType: AuthTokenType.ACCESS_TOKEN | AuthTokenType.REFRESH_TOKEN;
    version: number;
  },
  expiresIn: string | number
) => {
  const appCfg = getConfig();
  const isAccessToken = claims.tokenType === AuthTokenType.ACCESS_TOKEN;
  return crypto.jwt().sign(
    {
      authMethod: claims.authMethod,
      authTokenType: claims.tokenType,
      userId: claims.userId,
      tokenVersionId: claims.tokenVersionId,
      // Access tokens are validated against the session's accessVersion, refresh tokens against its
      // refreshVersion. Emit whichever claim matches this token's type under its expected name.
      ...(isAccessToken ? { accessVersion: claims.version } : { refreshVersion: claims.version }),
      organizationId: claims.organizationId,
      isMfaVerified: claims.isMfaVerified,
      mfaMethod: claims.mfaMethod,
      // Marks this as a delegated OAuth token. extractAuth maps tokens carrying this claim to
      // AuthMode.OAUTH so they are rejected by the default first-party JWT middleware.
      oauthClientId: claims.oauthClientId,
      // Exactly one delegation marker per token: `scopes` narrows the ability to what the user
      // consented to, `delegation` carries it unnarrowed. Neither claim means zero permissions, so
      // dropping one by mistake fails closed. See OauthDelegationMode.
      ...(claims.delegation ? { delegation: claims.delegation } : { scopes: claims.scopes })
    },
    appCfg.AUTH_SECRET,
    { expiresIn }
  );
};

export const oauthClientServiceFactory = ({
  oauthClientDAL,
  permissionService,
  keyStore,
  tokenService,
  orgDAL,
  userDAL,
  oidcConfigDAL,
  userAliasDAL,
  auditLogService
}: TOauthClientServiceFactoryDep) => {
  const checkOauthClientPermission = async (actor: OrgServiceActor, action: OrgPermissionActions) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.ParentOrganization
    });

    ForbiddenError.from(permission).throwUnlessCan(action, OrgPermissionSubjects.OauthClients);
  };

  // Token exchange turns externally-issued tokens into Infisical user tokens, so establishing that trust
  // (or handing out a credential for it) changes the org's federation posture, not just an application.
  // `action` goes in the error because it's not obvious why an OAuth change wants SSO permission.
  const checkSsoConfigPermission = async (actor: OrgServiceActor, action: string) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: actor.type,
      actorId: actor.id,
      orgId: actor.orgId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      scope: OrganizationActionScope.ParentOrganization
    });

    if (permission.cannot(OrgPermissionSsoActions.Edit, OrgPermissionSubjects.Sso)) {
      throw new ForbiddenRequestError({
        message: `You do not have permission to ${action}. Applications using the '${OauthGrantType.TokenExchange}' grant turn tokens from your organization's identity provider into Infisical user tokens, so managing them also requires permission to edit the organization's SSO configuration.`
      });
    }
  };

  // Loads a client scoped to the actor's org (so one org can never address another's client) and
  // throws a 404 when it is missing. Shared by every management method that operates on an existing
  // client by its database id.
  const getOrgClientOrThrow = async (clientDbId: string, orgId: string) => {
    const client = await oauthClientDAL.findOne({ id: clientDbId, orgId });
    if (!client) throw new NotFoundError({ message: `OAuth client with ID '${clientDbId}' not found` });
    return client;
  };

  // Clients only ever live on a root org, and so do the things these flows read: MFA enforcement, the
  // OIDC SSO config, OIDC user aliases. Asserted rather than assumed, because if sub-orgs are ever
  // allowed to own clients, an exchange would verify subject tokens against the sub-org's own OIDC
  // config and look up aliases in the wrong org.
  const getClientOrg = async (orgId: string): Promise<TOrganizations> => {
    const org = await orgDAL.findById(orgId);
    if (!org) throw new NotFoundError({ message: "OAuth client organization not found" });

    if (org.rootOrgId && org.rootOrgId !== org.id) {
      throw new BadRequestError({
        message: "OAuth applications are managed on the parent organization, not on a sub-organization."
      });
    }

    return org;
  };

  // Without a live OIDC config there's nothing to verify subject tokens against. Failing at config time
  // puts the message in front of the admin setting the application up.
  //
  // `buildError` is a parameter so the wording lives in one place: registering an application is a bad
  // request from the admin making it, while an exchange hitting this is an org misconfiguration the
  // caller can do nothing about, which the token endpoint has to report in RFC 6749 terms.
  const getActiveOidcConfigOrThrow = async (orgId: string, buildError: (message: string) => Error) => {
    const org = await getClientOrg(orgId);
    const oidcConfig = await oidcConfigDAL.findOne({ orgId: org.id });

    if (!oidcConfig) {
      throw buildError(
        "Token exchange verifies user tokens against your organization's OIDC SSO issuer, and your organization has no OIDC SSO configuration. Set one up under Settings > SSO & Provisioning first."
      );
    }

    if (!oidcConfig.isActive) {
      throw buildError(
        "Token exchange verifies user tokens against your organization's OIDC SSO issuer, and your organization's OIDC SSO is disabled. Enable it under Settings > SSO & Provisioning first."
      );
    }

    return { oidcConfig, org };
  };

  // Register and update ask the same questions of a grant config, so `client` (absent on register) is the
  // only difference between the two callers. The token exchange gates fire only when the request actually
  // touches that config, so an admin with just OauthClients Edit can still rename an exchange application.
  const resolveGrantConfig = async ({
    dto,
    actor,
    client,
    ssoPermissionAction
  }: {
    dto: TGrantConfigInput;
    actor: OrgServiceActor;
    client?: TOauthClients;
    ssoPermissionAction: string;
  }) => {
    const storedGrantTypes = client ? getGrantTypes(client) : [];

    const grantTypes = dto.grantTypes ?? storedGrantTypes;
    const wasTokenExchangeEnabled = storedGrantTypes.includes(OauthGrantType.TokenExchange);
    const isTokenExchangeEnabled = grantTypes.includes(OauthGrantType.TokenExchange);
    const isRedirectBased = grantTypes.includes(OauthGrantType.AuthorizationCode);

    const redirectUris = dto.redirectUris ?? client?.redirectUris ?? [];
    const tokenExchangeAudience =
      dto.tokenExchangeAudience !== undefined ? dto.tokenExchangeAudience : (client?.tokenExchangeAudience ?? null);
    const tokenExchangeIdpSatisfiesMfa =
      dto.tokenExchangeIdpSatisfiesMfa ?? client?.tokenExchangeIdpSatisfiesMfa ?? false;

    const establishesTokenExchangeTrust =
      isTokenExchangeEnabled &&
      (dto.grantTypes !== undefined ||
        dto.tokenExchangeAudience !== undefined ||
        dto.tokenExchangeIdpSatisfiesMfa !== undefined);

    if (establishesTokenExchangeTrust) await checkSsoConfigPermission(actor, ssoPermissionAction);

    assertValidOauthClientGrantConfig({
      grantTypes,
      resolved: { redirectUris, tokenExchangeAudience },
      supplied: {
        redirectUris: dto.redirectUris,
        requirePkce: dto.requirePkce,
        tokenExchangeAudience: dto.tokenExchangeAudience,
        tokenExchangeIdpSatisfiesMfa: dto.tokenExchangeIdpSatisfiesMfa
      }
    });

    if (establishesTokenExchangeTrust) {
      await getActiveOidcConfigOrThrow(actor.orgId, (message) => new BadRequestError({ message }));
    }

    return {
      grantTypes,
      isRedirectBased,
      isTokenExchangeEnabled,
      wasTokenExchangeEnabled,
      redirectUris,
      tokenExchangeAudience,
      tokenExchangeIdpSatisfiesMfa
    };
  };

  const createOauthClient = async (dto: TCreateOauthClientDTO, actor: OrgServiceActor) => {
    await checkOauthClientPermission(actor, OrgPermissionActions.Create);

    assertAccessTokenTtlWithinInstanceLimit(dto.accessTokenTTL);

    const { grantTypes, isTokenExchangeEnabled, redirectUris, tokenExchangeAudience, tokenExchangeIdpSatisfiesMfa } =
      await resolveGrantConfig({
        dto,
        actor,
        ssoPermissionAction: "register an OAuth application that uses token exchange"
      });

    const appCfg = getConfig();
    const clientId = `oauth_client_${crypto.randomBytes(16).toString("hex")}`;
    const clientSecret = crypto.randomBytes(32).toString("hex");
    const clientSecretHash = await crypto.hashing().createHash(clientSecret, appCfg.SALT_ROUNDS);

    const client = await oauthClientDAL.create({
      orgId: actor.orgId,
      name: dto.name,
      description: dto.description,
      clientId,
      clientSecretHash,
      clientSecretPrefix: clientSecret.slice(0, 4),
      grantTypes,
      redirectUris,
      requirePkce: dto.requirePkce ?? false,
      accessTokenTTL: dto.accessTokenTTL ?? DEFAULT_OAUTH_ACCESS_TOKEN_TTL_SECONDS,
      tokenExchangeAudience: isTokenExchangeEnabled ? tokenExchangeAudience : null,
      tokenExchangeIdpSatisfiesMfa: isTokenExchangeEnabled ? tokenExchangeIdpSatisfiesMfa : false
    });

    return { client: sanitizeOauthClient(client), clientSecret };
  };

  const listOauthClients = async (actor: OrgServiceActor) => {
    await checkOauthClientPermission(actor, OrgPermissionActions.Read);

    const clients = await oauthClientDAL.find({ orgId: actor.orgId });

    return clients.map(sanitizeOauthClient);
  };

  const getOauthClientById = async (clientDbId: string, actor: OrgServiceActor) => {
    await checkOauthClientPermission(actor, OrgPermissionActions.Read);

    const client = await getOrgClientOrThrow(clientDbId, actor.orgId);

    return sanitizeOauthClient(client);
  };

  const updateOauthClient = async (dto: TUpdateOauthClientDTO, actor: OrgServiceActor) => {
    await checkOauthClientPermission(actor, OrgPermissionActions.Edit);

    assertAccessTokenTtlWithinInstanceLimit(dto.accessTokenTTL);

    const client = await getOrgClientOrThrow(dto.clientDbId, actor.orgId);

    const {
      grantTypes,
      isRedirectBased,
      isTokenExchangeEnabled,
      wasTokenExchangeEnabled,
      tokenExchangeAudience,
      tokenExchangeIdpSatisfiesMfa
    } = await resolveGrantConfig({
      dto,
      actor,
      client,
      ssoPermissionAction: "change the token exchange configuration of an OAuth application"
    });

    const nextTokenExchangeAudience = isTokenExchangeEnabled ? tokenExchangeAudience : null;
    const nextTokenExchangeIdpSatisfiesMfa = isTokenExchangeEnabled ? tokenExchangeIdpSatisfiesMfa : false;

    const isTrustWithdrawn = hasWithdrawnTokenExchangeTrust(
      {
        isEnabled: wasTokenExchangeEnabled,
        audience: client.tokenExchangeAudience,
        idpSatisfiesMfa: client.tokenExchangeIdpSatisfiesMfa
      },
      {
        isEnabled: isTokenExchangeEnabled,
        audience: nextTokenExchangeAudience,
        idpSatisfiesMfa: nextTokenExchangeIdpSatisfiesMfa
      }
    );

    const updatedClient = await oauthClientDAL.transaction(async (tx) => {
      const updated = await oauthClientDAL.updateById(
        client.id,
        {
          name: dto.name,
          description: dto.description,
          grantTypes: dto.grantTypes ? grantTypes : undefined,
          redirectUris: isRedirectBased ? dto.redirectUris : [],
          requirePkce: isRedirectBased ? dto.requirePkce : false,
          accessTokenTTL: dto.accessTokenTTL,
          tokenExchangeAudience: nextTokenExchangeAudience,
          tokenExchangeIdpSatisfiesMfa: nextTokenExchangeIdpSatisfiesMfa
        },
        tx
      );

      if (isTrustWithdrawn) {
        await tokenService.revokeSessionsByUserAgent(getOauthClientSessionUserAgent(client.clientId), tx);
      }

      return updated;
    });

    return sanitizeOauthClient(updatedClient);
  };

  const deleteOauthClient = async (clientDbId: string, actor: OrgServiceActor) => {
    await checkOauthClientPermission(actor, OrgPermissionActions.Delete);

    const client = await getOrgClientOrThrow(clientDbId, actor.orgId);

    const deletedClient = await oauthClientDAL.transaction(async (tx) => {
      const deleted = await oauthClientDAL.deleteById(client.id, tx);
      await tokenService.revokeSessionsByUserAgent(getOauthClientSessionUserAgent(client.clientId), tx);

      return deleted;
    });

    return sanitizeOauthClient(deletedClient);
  };

  const rotateOauthClientSecret = async (clientDbId: string, actor: OrgServiceActor) => {
    await checkOauthClientPermission(actor, OrgPermissionActions.Edit);

    const client = await getOrgClientOrThrow(clientDbId, actor.orgId);

    const usesTokenExchange = getGrantTypes(client).includes(OauthGrantType.TokenExchange);

    if (usesTokenExchange) {
      await checkSsoConfigPermission(actor, "rotate the secret of an OAuth application that uses token exchange");
    }

    const appCfg = getConfig();
    const clientSecret = crypto.randomBytes(32).toString("hex");
    const clientSecretHash = await crypto.hashing().createHash(clientSecret, appCfg.SALT_ROUNDS);

    const updatedClient = await oauthClientDAL.transaction(async (tx) => {
      const updated = await oauthClientDAL.updateById(
        client.id,
        {
          clientSecretHash,
          clientSecretPrefix: clientSecret.slice(0, 4)
        },
        tx
      );

      if (usesTokenExchange) {
        await tokenService.revokeSessionsByUserAgent(getOauthClientSessionUserAgent(client.clientId), tx);
      }

      return updated;
    });

    return { client: sanitizeOauthClient(updatedClient), clientSecret };
  };

  const assertGrantEnabled = (client: TOauthClients, grantType: OauthGrantType) => {
    if (!getGrantTypes(client).includes(grantType)) {
      throw new OauthTokenError({
        code: OauthTokenErrorCode.UnauthorizedClient,
        message: `This application is not registered for the '${grantType}' grant type.`
      });
    }
  };

  const getAuthorizeInfo = async ({ clientId, redirectUri, scope }: TOauthAuthorizeInfoDTO) => {
    const client = await oauthClientDAL.findOne({ clientId });
    if (!client) throw new UnauthorizedError({ message: "OAuth client not found" });

    assertGrantEnabled(client, OauthGrantType.AuthorizationCode);

    if (!isRegisteredRedirectUri(client.redirectUris, redirectUri)) {
      throw new BadRequestError({ message: "Redirect URI is not registered for this OAuth client" });
    }

    // Surface unknown scopes up front so the consent screen can refuse rather than letting the
    // user approve a request that authorizeConsent will reject anyway.
    const { granted, invalid } = parseOauthScopeString(scope);
    if (invalid.length) {
      throw new BadRequestError({ message: `Unsupported OAuth scope(s): ${invalid.join(", ")}` });
    }

    return {
      clientName: client.name,
      clientDescription: client.description,
      orgId: client.orgId,
      requirePkce: client.requirePkce,
      requestedScopes: getOauthScopeDescriptions(granted)
    };
  };

  const authorizeConsent = async (dto: TOauthConsentDTO) => {
    const client = await oauthClientDAL.findOne({ clientId: dto.clientId });
    if (!client) throw new UnauthorizedError({ message: "OAuth client not found" });

    assertGrantEnabled(client, OauthGrantType.AuthorizationCode);

    if (!isRegisteredRedirectUri(client.redirectUris, dto.redirectUri)) {
      throw new BadRequestError({ message: "Redirect URI is not registered for this OAuth client" });
    }

    if (client.requirePkce && !dto.codeChallenge) {
      throw new BadRequestError({ message: "This OAuth client requires PKCE (code_challenge is missing)" });
    }

    // Reject the request if it asks for any scope we don't recognize (RFC 6749 invalid_scope),
    // rather than silently dropping it and issuing a token narrower than the client expects.
    const { granted: grantedScopes, invalid: invalidScopes } = parseOauthScopeString(dto.scope);
    if (invalidScopes.length) {
      throw new BadRequestError({ message: `Unsupported OAuth scope(s): ${invalidScopes.join(", ")}` });
    }

    // Called only for its side effects: it throws if the consenting user is not a member of the
    // client's org or fails org SSO enforcement. This blocks issuing a delegation code to a user
    // who has no standing in the org the client belongs to. The returned ability is intentionally
    // unused here; scope narrowing happens later when the delegated token builds its permission.
    await permissionService.getOrgPermission({
      actor: ActorType.USER,
      actorId: dto.userId,
      orgId: client.orgId,
      actorAuthMethod: dto.authMethod,
      actorOrgId: client.orgId,
      scope: OrganizationActionScope.ParentOrganization
    });

    // The consent endpoint authenticates with AuthMode.JWT, which also accepts the pre-MFA access
    // token issued right after password verification (organization not yet selected, MFA not yet
    // completed). Issuing a delegation code from such a session would let anyone holding only the
    // password mint OAuth tokens, bypassing MFA entirely. So we re-derive whether MFA is required
    // for this user in the client's organization and reject the request unless the session actually
    // completed the matching MFA challenge.
    const org = await getClientOrg(client.orgId);

    const user = await userDAL.findById(dto.userId);
    if (!user) throw new UnauthorizedError({ message: "User not found" });

    const { isMfaRequired, requiredMfaMethod } = getRequiredMfaMethod(org, user);
    if (isMfaRequired && (!dto.isMfaVerified || dto.mfaMethod !== requiredMfaMethod)) {
      throw new UnauthorizedError({
        message: "Multi-factor authentication is required before authorizing this application"
      });
    }

    const tokenSession = await tokenService.getUserTokenSession({
      userId: dto.userId,
      ip: dto.ip,
      userAgent: getOauthClientSessionUserAgent(client.clientId)
    });
    if (!tokenSession) throw new BadRequestError({ message: "Failed to create user token session" });

    const code = crypto.randomBytes(32).toString("hex");
    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.OauthAuthorizationCode(code),
      KeyStoreTtls.OauthAuthorizationCodeInSeconds,
      JSON.stringify({
        clientId: client.clientId,
        orgId: client.orgId,
        userId: dto.userId,
        authMethod: dto.authMethod,
        isMfaVerified: dto.isMfaVerified,
        mfaMethod: dto.mfaMethod,
        tokenVersionId: tokenSession.id,
        redirectUri: dto.redirectUri,
        codeChallenge: dto.codeChallenge,
        codeChallengeMethod: dto.codeChallengeMethod,
        scopes: grantedScopes
      })
    );

    const callbackUrl = new URL(dto.redirectUri);
    callbackUrl.searchParams.set("code", code);
    if (dto.state) callbackUrl.searchParams.set("state", dto.state);

    return { callbackUrl: callbackUrl.toString(), clientName: client.name, orgId: client.orgId };
  };

  const authenticateClient = async (clientId?: string, clientSecret?: string) => {
    const invalidCredentials = (message: string) =>
      new OauthTokenError({ code: OauthTokenErrorCode.InvalidClient, message });

    if (!clientId || !clientSecret) {
      throw invalidCredentials("Missing OAuth client credentials.");
    }

    const client = await oauthClientDAL.findOne({ clientId });
    if (!client) throw invalidCredentials("Invalid OAuth client credentials.");

    const isValidSecret = await crypto.hashing().compareHash(clientSecret, client.clientSecretHash);
    if (!isValidSecret) throw invalidCredentials("Invalid OAuth client credentials.");

    return client;
  };

  // Writes reject a TTL above JWT_AUTH_LIFETIME, but both it and the org's session length can be lowered
  // after the fact, so issuance still caps rather than trusting the stored value. Refresh tokens follow
  // the org alone, since they exist to outlive individual access tokens.
  const resolveTokenLifetimes = (client: Pick<TOauthClients, "accessTokenTTL">, org?: TOrganizations) => {
    const appCfg = getConfig();
    let accessTokenExpiresIn: string | number = getMinExpiresIn(appCfg.JWT_AUTH_LIFETIME, client.accessTokenTTL);
    let refreshTokenExpiresIn: string | number = appCfg.JWT_REFRESH_LIFETIME;

    if (org?.userTokenExpiration) {
      accessTokenExpiresIn = getMinExpiresIn(accessTokenExpiresIn, org.userTokenExpiration);
      refreshTokenExpiresIn = org.userTokenExpiration;
    }

    return { accessTokenExpiresIn, refreshTokenExpiresIn };
  };

  const getTokenLifetimes = async (client: Pick<TOauthClients, "accessTokenTTL">, orgId: string) =>
    resolveTokenLifetimes(client, await orgDAL.findById(orgId));

  // RFC 8693 token exchange is the SSO login path with the token handed to us directly instead of
  // collected through a browser redirect. With no redirect URI, PKCE or browser session to anchor trust
  // on, the audience check is all that stops any token the issuer signed being replayed here.
  const exchangeSubjectToken = async (
    client: TOauthClients,
    dto: Extract<TOauthTokenExchangeDTO, { grantType: OauthGrantType.TokenExchange }>
  ) => {
    if (!client.tokenExchangeAudience) {
      throw new OauthTokenError({
        code: OauthTokenErrorCode.ServerError,
        message:
          "This application has no token exchange audience configured, so subject tokens cannot be verified. Set one on the application under Organization Settings > OAuth Applications."
      });
    }

    const { oidcConfig, org } = await getActiveOidcConfigOrThrow(
      client.orgId,
      (message) => new OauthTokenError({ code: OauthTokenErrorCode.ServerError, message })
    );

    const { subject } = await verifySubjectToken({
      subjectToken: dto.subjectToken,
      oidcConfig,
      expectedAudience: client.tokenExchangeAudience
    });

    const userAlias = await userAliasDAL.findOne({
      externalId: subject,
      orgId: org.id,
      aliasType: UserAliasType.OIDC
    });

    if (!userAlias) {
      throw new UnauthorizedError({
        message:
          "The user this token identifies has not signed in to Infisical through your organization's OIDC SSO yet. They need to complete a browser sign-in once before an application can act on their behalf."
      });
    }

    if (!userAlias.isEmailVerified) {
      throw new UnauthorizedError({
        message:
          "The user this token identifies has not verified their identity with your organization's OIDC SSO. They need to complete a browser sign-in once before an application can act on their behalf."
      });
    }

    const user = await userDAL.findById(userAlias.userId);
    if (!user) {
      throw new UnauthorizedError({ message: "The user this token identifies no longer has an Infisical account." });
    }

    if (!user.isAccepted) {
      throw new UnauthorizedError({
        message: "The user this token identifies has not completed Infisical account setup."
      });
    }

    if (user.isLocked || (user.temporaryLockDateEnd && new Date() < user.temporaryLockDateEnd)) {
      throw new UnauthorizedError({
        message:
          "The Infisical account for the user this token identifies is locked, so an application cannot act on their behalf. They can unlock it by resetting their password."
      });
    }

    const orgMembership = await orgDAL.findEffectiveOrgMembership({
      actorType: ActorType.USER,
      actorId: user.id,
      orgId: client.orgId,
      acceptAnyStatus: true
    });

    if (!orgMembership) {
      throw new UnauthorizedError({
        message: "The user this token identifies is not a member of this application's organization."
      });
    }

    if (orgMembership.status === OrgMembershipStatus.Invited) {
      throw new UnauthorizedError({
        message:
          "The user this token identifies has been invited to this application's organization but has not joined it yet."
      });
    }

    if (!orgMembership.isActive) {
      throw new UnauthorizedError({
        message:
          "The membership of the user this token identifies has been deactivated in this organization, so an application cannot act on their behalf."
      });
    }

    await permissionService.getOrgPermission({
      actor: ActorType.USER,
      actorId: user.id,
      orgId: client.orgId,
      actorAuthMethod: AuthMethod.OIDC,
      actorOrgId: client.orgId,
      scope: OrganizationActionScope.ParentOrganization
    });

    const { isMfaRequired } = getRequiredMfaMethod(org, user);
    if (isMfaRequired && !client.tokenExchangeIdpSatisfiesMfa) {
      throw new UnauthorizedError({
        message:
          "Multi-factor authentication is required for this user, and this application has not been marked as relying on an identity provider that enforces it. An organization admin can enable that on the application under Organization Settings > OAuth Applications."
      });
    }

    const tokenSession = await tokenService.getUserTokenSession({
      userId: user.id,
      ip: dto.ip,
      userAgent: getOauthClientSessionUserAgent(client.clientId)
    });
    if (!tokenSession)
      throw new OauthTokenError({
        code: OauthTokenErrorCode.ServerError,
        message: "Failed to create a session for the user this token identifies."
      });

    // A revocation can land between authenticating the client and inserting the session above, deleting
    // nothing because the session did not exist yet. Every withdrawal path commits its client write
    // before deleting sessions, so re-reading the client here catches it -- on the primary, since the
    // replica can still be serving the pre-revocation row.
    const currentClient = await oauthClientDAL.findByIdOnPrimary(client.id);
    if (hasClientAuthorityChanged(client, currentClient, OauthGrantType.TokenExchange)) {
      await tokenService.revokeSessionsByUserAgent(getOauthClientSessionUserAgent(client.clientId));
      throw new OauthTokenError({
        code: OauthTokenErrorCode.InvalidClient,
        message:
          "This application's credentials or configuration changed while the token was being issued. Retry with the application's current client secret."
      });
    }

    const { accessTokenExpiresIn } = resolveTokenLifetimes(client, org);

    const accessToken = signOauthToken(
      {
        authMethod: AuthMethod.OIDC,
        userId: user.id,
        tokenVersionId: tokenSession.id,
        organizationId: client.orgId,
        isMfaVerified: client.tokenExchangeIdpSatisfiesMfa || undefined,
        delegation: OauthDelegationMode.Full,
        tokenType: AuthTokenType.ACCESS_TOKEN,
        version: tokenSession.accessVersion,
        oauthClientId: client.clientId
      },
      accessTokenExpiresIn
    );

    await auditLogService.createAuditLog({
      ipAddress: dto.ip,
      userAgent: dto.userAgent,
      userAgentType: getUserAgentType(dto.userAgent),
      orgId: client.orgId,
      actor: {
        type: ActorType.USER,
        metadata: {
          userId: user.id,
          email: user.email,
          username: user.username,
          authMethod: AuthMethod.OIDC,
          oauthClientId: client.clientId
        }
      },
      event: {
        type: EventType.OAUTH_CLIENT_TOKEN_EXCHANGE,
        metadata: {
          clientDbId: client.id,
          clientId: client.clientId,
          clientName: client.name,
          subjectUserId: user.id,
          subjectExternalId: subject,
          tokenVersionId: tokenSession.id
        }
      }
    });

    return {
      access_token: accessToken,
      issued_token_type: OauthTokenType.AccessToken,
      token_type: "Bearer" as const,
      expires_in: expiresInToSeconds(accessTokenExpiresIn)
    };
  };

  const exchangeToken = async (dto: TOauthTokenExchangeDTO) => {
    const client = await authenticateClient(dto.clientId, dto.clientSecret);
    assertGrantEnabled(client, dto.grantType);

    if (dto.grantType === OauthGrantType.TokenExchange) {
      return exchangeSubjectToken(client, dto);
    }

    if (dto.grantType === OauthGrantType.AuthorizationCode) {
      const codeKey = KeyStorePrefixes.OauthAuthorizationCode(dto.code);
      const codePayloadRaw = await keyStore.getItem(codeKey);
      if (!codePayloadRaw) {
        throw new UnauthorizedError({ message: "Invalid or expired authorization code" });
      }

      // One-time use: delete before any further validation
      await keyStore.deleteItem(codeKey);

      const codePayload = await OauthAuthorizationCodePayloadSchema.parseAsync(JSON.parse(codePayloadRaw));

      if (codePayload.clientId !== client.clientId) {
        throw new UnauthorizedError({ message: "Authorization code was not issued to this client" });
      }

      if (!dto.redirectUri || dto.redirectUri !== codePayload.redirectUri) {
        throw new OauthTokenError({ code: OauthTokenErrorCode.InvalidGrant, message: "Redirect URI mismatch." });
      }

      if (codePayload.codeChallenge) {
        if (!dto.codeVerifier) throw new BadRequestError({ message: "Missing PKCE code_verifier" });
        if (!PKCE_CODE_VERIFIER_REGEX.test(dto.codeVerifier)) {
          throw new BadRequestError({
            message: "Invalid PKCE code_verifier: must be 43-128 characters using only [A-Za-z0-9-._~]"
          });
        }
        if (computePkceChallenge(dto.codeVerifier) !== codePayload.codeChallenge) {
          throw new OauthTokenError({ code: OauthTokenErrorCode.InvalidGrant, message: "PKCE challenge mismatch." });
        }
      } else if (client.requirePkce) {
        throw new BadRequestError({ message: "This OAuth client requires PKCE" });
      }

      const tokenSession = await tokenService.getUserTokenSessionById(codePayload.tokenVersionId, codePayload.userId);
      if (!tokenSession) throw new UnauthorizedError({ message: "User session not found" });

      const { accessTokenExpiresIn, refreshTokenExpiresIn } = await getTokenLifetimes(client, codePayload.orgId);

      const grantedScopes = codePayload.scopes ?? [];

      const sharedClaims = {
        authMethod: codePayload.authMethod,
        userId: codePayload.userId,
        tokenVersionId: tokenSession.id,
        organizationId: codePayload.orgId,
        isMfaVerified: codePayload.isMfaVerified,
        mfaMethod: codePayload.mfaMethod,
        scopes: grantedScopes
      };

      const accessToken = signOauthToken(
        {
          ...sharedClaims,
          tokenType: AuthTokenType.ACCESS_TOKEN,
          version: tokenSession.accessVersion,
          oauthClientId: client.clientId
        },
        accessTokenExpiresIn
      );

      const refreshToken = getGrantTypes(client).includes(OauthGrantType.RefreshToken)
        ? signOauthToken(
            {
              ...sharedClaims,
              tokenType: AuthTokenType.REFRESH_TOKEN,
              version: tokenSession.refreshVersion,
              oauthClientId: client.clientId
            },
            refreshTokenExpiresIn
          )
        : undefined;

      return {
        access_token: accessToken,
        token_type: "Bearer" as const,
        expires_in: expiresInToSeconds(accessTokenExpiresIn),
        ...(refreshToken ? { refresh_token: refreshToken } : {}),
        scope: grantedScopes.join(" ")
      };
    }

    const { decodedToken, tokenVersion, isGraceHit } = await tokenService.validateRefreshToken(dto.refreshToken, {
      allowOauthClientToken: true
    });
    const oauthDecodedToken = decodedToken as TOauthRefreshJwtTokenPayload;

    if (oauthDecodedToken.oauthClientId !== client.clientId) {
      throw new UnauthorizedError({ message: "Refresh token was not issued to this client" });
    }

    if (!decodedToken.organizationId) {
      throw new UnauthorizedError({ message: "Invalid refresh token" });
    }

    const { accessTokenExpiresIn, refreshTokenExpiresIn } = await getTokenLifetimes(
      client,
      decodedToken.organizationId
    );

    let { refreshToken } = dto;
    let { refreshVersion } = tokenVersion;

    // Carry the originally-granted scopes forward; a refresh must never broaden delegation.
    const grantedScopes = oauthDecodedToken.scopes ?? [];

    const sharedClaims = {
      authMethod: decodedToken.authMethod,
      userId: decodedToken.userId,
      tokenVersionId: tokenVersion.id,
      organizationId: decodedToken.organizationId,
      isMfaVerified: decodedToken.isMfaVerified,
      mfaMethod: decodedToken.mfaMethod,
      scopes: grantedScopes
    };

    if (!isGraceHit) {
      const { updatedSession } = await tokenService.rotateRefreshToken(decodedToken, tokenVersion);
      refreshVersion = updatedSession.refreshVersion;

      refreshToken = signOauthToken(
        {
          ...sharedClaims,
          tokenType: AuthTokenType.REFRESH_TOKEN,
          version: refreshVersion,
          oauthClientId: client.clientId
        },
        refreshTokenExpiresIn
      );
    }

    const accessToken = signOauthToken(
      {
        ...sharedClaims,
        tokenType: AuthTokenType.ACCESS_TOKEN,
        version: tokenVersion.accessVersion,
        oauthClientId: client.clientId
      },
      accessTokenExpiresIn
    );

    return {
      access_token: accessToken,
      token_type: "Bearer" as const,
      expires_in: expiresInToSeconds(accessTokenExpiresIn),
      refresh_token: refreshToken,
      scope: grantedScopes.join(" ")
    };
  };

  return {
    createOauthClient,
    listOauthClients,
    getOauthClientById,
    updateOauthClient,
    deleteOauthClient,
    rotateOauthClientSecret,
    getAuthorizeInfo,
    authorizeConsent,
    exchangeToken
  };
};
