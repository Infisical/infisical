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
import { ActorType, AuthMethod, AuthTokenType, MfaMethod } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TOrgDALFactory } from "@app/services/org/org-dal";

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
};

const signOauthAccessToken = (
  claims: TOauthTokenClaims & { accessVersion: number; oauthClientId: string },
  expiresIn: string | number
) => {
  const appCfg = getConfig();
  return crypto.jwt().sign(
    {
      authMethod: claims.authMethod,
      authTokenType: AuthTokenType.ACCESS_TOKEN,
      userId: claims.userId,
      tokenVersionId: claims.tokenVersionId,
      accessVersion: claims.accessVersion,
      organizationId: claims.organizationId,
      isMfaVerified: claims.isMfaVerified,
      mfaMethod: claims.mfaMethod,
      // Marks this as a delegated OAuth access token. extractAuth maps tokens carrying this
      // claim to AuthMode.OAUTH so they are rejected by the default first-party JWT middleware.
      oauthClientId: claims.oauthClientId
    },
    appCfg.AUTH_SECRET,
    { expiresIn }
  );
};

const signOauthRefreshToken = (
  claims: TOauthTokenClaims & { refreshVersion: number; oauthClientId: string },
  expiresIn: string | number
) => {
  const appCfg = getConfig();
  return crypto.jwt().sign(
    {
      authMethod: claims.authMethod,
      authTokenType: AuthTokenType.REFRESH_TOKEN,
      userId: claims.userId,
      tokenVersionId: claims.tokenVersionId,
      refreshVersion: claims.refreshVersion,
      organizationId: claims.organizationId,
      isMfaVerified: claims.isMfaVerified,
      mfaMethod: claims.mfaMethod,
      oauthClientId: claims.oauthClientId
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
  orgDAL
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

    const client = await oauthClientDAL.findOne({ id: clientDbId, orgId: actor.orgId });
    if (!client) throw new NotFoundError({ message: `OAuth client with ID '${clientDbId}' not found` });

    return sanitizeOauthClient(client);
  };

  const updateOauthClient = async (dto: TUpdateOauthClientDTO, actor: OrgServiceActor) => {
    await checkOauthClientPermission(actor, OrgPermissionActions.Edit);

    const client = await oauthClientDAL.findOne({ id: dto.clientDbId, orgId: actor.orgId });
    if (!client) throw new NotFoundError({ message: `OAuth client with ID '${dto.clientDbId}' not found` });

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

    const client = await oauthClientDAL.findOne({ id: clientDbId, orgId: actor.orgId });
    if (!client) throw new NotFoundError({ message: `OAuth client with ID '${clientDbId}' not found` });

    const deletedClient = await oauthClientDAL.deleteById(client.id);

    // Revoke all access/refresh tokens issued for this client. The OAuth token sessions are tagged
    // with the client's userAgent, so deleting them makes fnValidateJwtIdentity reject every token
    // the client issued on the next request, rather than letting them live until JWT expiry.
    await tokenService.revokeSessionsByUserAgent(getOauthClientSessionUserAgent(client.clientId));

    return sanitizeOauthClient(deletedClient);
  };

  const rotateOauthClientSecret = async (clientDbId: string, actor: OrgServiceActor) => {
    await checkOauthClientPermission(actor, OrgPermissionActions.Edit);

    const client = await oauthClientDAL.findOne({ id: clientDbId, orgId: actor.orgId });
    if (!client) throw new NotFoundError({ message: `OAuth client with ID '${clientDbId}' not found` });

    const appCfg = getConfig();
    const clientSecret = crypto.randomBytes(32).toString("hex");
    const clientSecretHash = await crypto.hashing().createHash(clientSecret, appCfg.SALT_ROUNDS);

    const updatedClient = await oauthClientDAL.updateById(client.id, {
      clientSecretHash,
      clientSecretPrefix: clientSecret.slice(0, 4)
    });

    return { client: sanitizeOauthClient(updatedClient), clientSecret };
  };

  const getAuthorizeInfo = async ({ clientId, redirectUri }: TOauthAuthorizeInfoDTO) => {
    const client = await oauthClientDAL.findOne({ clientId });
    if (!client) throw new UnauthorizedError({ message: "OAuth client not found" });

    if (!isRegisteredRedirectUri(client.redirectUris, redirectUri)) {
      throw new BadRequestError({ message: "Redirect URI is not registered for this OAuth client" });
    }

    return {
      clientName: client.name,
      clientDescription: client.description,
      orgId: client.orgId,
      requirePkce: client.requirePkce
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

    await permissionService.getOrgPermission({
      actor: ActorType.USER,
      actorId: dto.userId,
      orgId: client.orgId,
      actorAuthMethod: dto.authMethod,
      actorOrgId: client.orgId,
      scope: OrganizationActionScope.ParentOrganization
    });

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
        scope: dto.scope
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

      const sharedClaims = {
        authMethod: codePayload.authMethod,
        userId: codePayload.userId,
        tokenVersionId: tokenSession.id,
        organizationId: codePayload.orgId,
        isMfaVerified: codePayload.isMfaVerified,
        mfaMethod: codePayload.mfaMethod
      };

      const accessToken = signOauthAccessToken(
        { ...sharedClaims, accessVersion: tokenSession.accessVersion, oauthClientId: client.clientId },
        accessTokenExpiresIn
      );

      const refreshToken = signOauthRefreshToken(
        { ...sharedClaims, refreshVersion: tokenSession.refreshVersion, oauthClientId: client.clientId },
        refreshTokenExpiresIn
      );

      return {
        access_token: accessToken,
        token_type: "Bearer" as const,
        expires_in: expiresInToSeconds(accessTokenExpiresIn),
        refresh_token: refreshToken,
        scope: codePayload.scope ?? ""
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

    const sharedClaims = {
      authMethod: decodedToken.authMethod,
      userId: decodedToken.userId,
      tokenVersionId: tokenVersion.id,
      organizationId: decodedToken.organizationId,
      isMfaVerified: decodedToken.isMfaVerified,
      mfaMethod: decodedToken.mfaMethod
    };

    if (!isGraceHit) {
      const { updatedSession } = await tokenService.rotateRefreshToken(decodedToken, tokenVersion);
      refreshVersion = updatedSession.refreshVersion;

      refreshToken = signOauthRefreshToken(
        { ...sharedClaims, refreshVersion, oauthClientId: client.clientId },
        refreshTokenExpiresIn
      );
    }

    const accessToken = signOauthAccessToken(
      { ...sharedClaims, accessVersion: tokenVersion.accessVersion, oauthClientId: client.clientId },
      accessTokenExpiresIn
    );

    return {
      access_token: accessToken,
      token_type: "Bearer" as const,
      expires_in: expiresInToSeconds(accessTokenExpiresIn),
      refresh_token: refreshToken,
      scope: ""
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
