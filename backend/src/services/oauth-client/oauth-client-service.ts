import { ForbiddenError } from "@casl/ability";

import { OrganizationActionScope, TOauthClients } from "@app/db/schemas";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { getMinExpiresIn } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { OrgServiceActor } from "@app/lib/types";
import { getRequiredMfaMethod } from "@app/services/auth/auth-fns";
import { ActorType, AuthMethod, AuthTokenType, MfaMethod } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TOauthClientDALFactory } from "./oauth-client-dal";
import {
  computePkceChallenge,
  getOauthClientSessionUserAgent,
  isRegisteredRedirectUri,
  PKCE_CODE_VERIFIER_REGEX
} from "./oauth-client-fns";
import {
  OauthAuthorizationCodePayloadSchema,
  TCreateOauthClientDTO,
  TOauthAuthorizeInfoDTO,
  TOauthConsentDTO,
  TOauthRefreshJwtTokenPayload,
  TOauthTokenExchangeDTO,
  TUpdateOauthClientDTO
} from "./oauth-client-types";
import { getOauthScopeDescriptions, parseOauthScopeString } from "./oauth-scope";

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
  orgDAL: Pick<TOrgDALFactory, "findById">;
  userDAL: Pick<TUserDALFactory, "findById">;
};

export type TOauthClientServiceFactory = ReturnType<typeof oauthClientServiceFactory>;

const sanitizeOauthClient = (client: TOauthClients) => {
  const { clientSecretHash, ...rest } = client;
  return rest;
};

const expiresInToSeconds = (expiresIn: string | number) =>
  typeof expiresIn === "number" ? expiresIn : Math.floor(ms(expiresIn) / 1000);

type TOauthTokenClaims = {
  authMethod: AuthMethod;
  userId: string;
  tokenVersionId: string;
  organizationId: string;
  isMfaVerified?: boolean;
  mfaMethod?: MfaMethod;
  scopes: string[];
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
      // Granted delegation scopes. permission-service intersects the user's ability with these,
      // so the token can never exceed what the user consented to.
      scopes: claims.scopes
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
  userDAL
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

  // Loads a client scoped to the actor's org (so one org can never address another's client) and
  // throws a 404 when it is missing. Shared by every management method that operates on an existing
  // client by its database id.
  const getOrgClientOrThrow = async (clientDbId: string, orgId: string) => {
    const client = await oauthClientDAL.findOne({ id: clientDbId, orgId });
    if (!client) throw new NotFoundError({ message: `OAuth client with ID '${clientDbId}' not found` });
    return client;
  };

  const createOauthClient = async (dto: TCreateOauthClientDTO, actor: OrgServiceActor) => {
    await checkOauthClientPermission(actor, OrgPermissionActions.Create);

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
      redirectUris: dto.redirectUris,
      requirePkce: dto.requirePkce ?? false
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

    const client = await getOrgClientOrThrow(dto.clientDbId, actor.orgId);

    const updatedClient = await oauthClientDAL.updateById(client.id, {
      name: dto.name,
      description: dto.description,
      redirectUris: dto.redirectUris,
      requirePkce: dto.requirePkce
    });

    return sanitizeOauthClient(updatedClient);
  };

  const deleteOauthClient = async (clientDbId: string, actor: OrgServiceActor) => {
    await checkOauthClientPermission(actor, OrgPermissionActions.Delete);

    const client = await getOrgClientOrThrow(clientDbId, actor.orgId);

    const deletedClient = await oauthClientDAL.deleteById(client.id);

    // Revoke all access/refresh tokens issued for this client. The OAuth token sessions are tagged
    // with the client's userAgent, so deleting them makes fnValidateJwtIdentity reject every token
    // the client issued on the next request, rather than letting them live until JWT expiry.
    await tokenService.revokeSessionsByUserAgent(getOauthClientSessionUserAgent(client.clientId));

    return sanitizeOauthClient(deletedClient);
  };

  const rotateOauthClientSecret = async (clientDbId: string, actor: OrgServiceActor) => {
    await checkOauthClientPermission(actor, OrgPermissionActions.Edit);

    const client = await getOrgClientOrThrow(clientDbId, actor.orgId);

    const appCfg = getConfig();
    const clientSecret = crypto.randomBytes(32).toString("hex");
    const clientSecretHash = await crypto.hashing().createHash(clientSecret, appCfg.SALT_ROUNDS);

    const updatedClient = await oauthClientDAL.updateById(client.id, {
      clientSecretHash,
      clientSecretPrefix: clientSecret.slice(0, 4)
    });

    return { client: sanitizeOauthClient(updatedClient), clientSecret };
  };

  const getAuthorizeInfo = async ({ clientId, redirectUri, scope }: TOauthAuthorizeInfoDTO) => {
    const client = await oauthClientDAL.findOne({ clientId });
    if (!client) throw new UnauthorizedError({ message: "OAuth client not found" });

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
    // completed the matching MFA challenge. MFA enforcement lives on the root organization (matching
    // the login flow), so resolve it when the client belongs to a sub-organization.
    const clientOrg = await orgDAL.findById(client.orgId);
    if (!clientOrg) throw new NotFoundError({ message: "OAuth client organization not found" });

    const isSubOrganization = Boolean(clientOrg.rootOrgId && clientOrg.id !== clientOrg.rootOrgId);
    const rootOrg = isSubOrganization ? await orgDAL.findById(clientOrg.rootOrgId as string) : clientOrg;
    if (!rootOrg) throw new NotFoundError({ message: "OAuth client organization not found" });

    const user = await userDAL.findById(dto.userId);
    if (!user) throw new UnauthorizedError({ message: "User not found" });

    const { isMfaRequired, requiredMfaMethod } = getRequiredMfaMethod(rootOrg, user);
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
    if (!clientId || !clientSecret) {
      throw new UnauthorizedError({ message: "Missing OAuth client credentials" });
    }

    const client = await oauthClientDAL.findOne({ clientId });
    if (!client) throw new UnauthorizedError({ message: "Invalid OAuth client credentials" });

    const isValidSecret = await crypto.hashing().compareHash(clientSecret, client.clientSecretHash);
    if (!isValidSecret) throw new UnauthorizedError({ message: "Invalid OAuth client credentials" });

    return client;
  };

  const getTokenLifetimes = async (orgId: string) => {
    const appCfg = getConfig();
    let accessTokenExpiresIn: string | number = appCfg.JWT_AUTH_LIFETIME;
    let refreshTokenExpiresIn: string | number = appCfg.JWT_REFRESH_LIFETIME;

    const org = await orgDAL.findById(orgId);
    if (org?.userTokenExpiration) {
      accessTokenExpiresIn = getMinExpiresIn(appCfg.JWT_AUTH_LIFETIME, org.userTokenExpiration);
      refreshTokenExpiresIn = org.userTokenExpiration;
    }

    return { accessTokenExpiresIn, refreshTokenExpiresIn };
  };

  const exchangeToken = async (dto: TOauthTokenExchangeDTO) => {
    const client = await authenticateClient(dto.clientId, dto.clientSecret);

    if (dto.grantType === "authorization_code") {
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
        throw new BadRequestError({ message: "Redirect URI mismatch" });
      }

      if (codePayload.codeChallenge) {
        if (!dto.codeVerifier) throw new BadRequestError({ message: "Missing PKCE code_verifier" });
        if (!PKCE_CODE_VERIFIER_REGEX.test(dto.codeVerifier)) {
          throw new BadRequestError({
            message: "Invalid PKCE code_verifier: must be 43-128 characters using only [A-Za-z0-9-._~]"
          });
        }
        if (computePkceChallenge(dto.codeVerifier) !== codePayload.codeChallenge) {
          throw new BadRequestError({ message: "PKCE challenge mismatch" });
        }
      } else if (client.requirePkce) {
        throw new BadRequestError({ message: "This OAuth client requires PKCE" });
      }

      const tokenSession = await tokenService.getUserTokenSessionById(codePayload.tokenVersionId, codePayload.userId);
      if (!tokenSession) throw new UnauthorizedError({ message: "User session not found" });

      const { accessTokenExpiresIn, refreshTokenExpiresIn } = await getTokenLifetimes(codePayload.orgId);

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

      const refreshToken = signOauthToken(
        {
          ...sharedClaims,
          tokenType: AuthTokenType.REFRESH_TOKEN,
          version: tokenSession.refreshVersion,
          oauthClientId: client.clientId
        },
        refreshTokenExpiresIn
      );

      return {
        access_token: accessToken,
        token_type: "Bearer" as const,
        expires_in: expiresInToSeconds(accessTokenExpiresIn),
        refresh_token: refreshToken,
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

    const { accessTokenExpiresIn, refreshTokenExpiresIn } = await getTokenLifetimes(decodedToken.organizationId);

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
