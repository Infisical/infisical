import { ForbiddenError, subject } from "@casl/ability";
import { requestContext } from "@fastify/request-context";
import { createLocalJWKSet, errors as joseErrors, JSONWebKeySet, jwtVerify } from "jose";

import {
  AccessScope,
  ActionProjectType,
  IdentityAuthMethod,
  OrganizationActionScope,
  TIdentitySpiffeAuths,
  TIdentitySpiffeAuthsUpdate
} from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import {
  BadRequestError,
  ForbiddenRequestError,
  NotFoundError,
  PermissionBoundaryError,
  UnauthorizedError
} from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";
import { logger } from "@app/lib/logger";
import { requestContextKeys } from "@app/lib/request-context/request-context-keys";
import { AuthAttemptAuthMethod, AuthAttemptAuthResult, authAttemptCounter } from "@app/lib/telemetry/metrics";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { validateIdentityUpdateForSuperAdminPrivileges } from "../super-admin/super-admin-fns";
import { TIdentitySpiffeAuthDALFactory } from "./identity-spiffe-auth-dal";
import {
  doesSpiffeIdMatchPattern,
  extractTrustDomainFromSpiffeId,
  fetchRemoteBundleJwks,
  isValidSpiffeId
} from "./identity-spiffe-auth-fns";
import {
  FIPS_APPROVED_JWT_ALGORITHMS,
  SpiffeTrustBundleProfile,
  TAttachSpiffeAuthDTO,
  TGetSpiffeAuthDTO,
  TLoginSpiffeAuthDTO,
  TRevokeSpiffeAuthDTO,
  TSpiffeTrustBundleDistribution,
  TSpiffeTrustBundleDistributionResponse,
  TUpdateSpiffeAuthDTO
} from "./identity-spiffe-auth-types";

type TIdentitySpiffeAuthServiceFactoryDep = {
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  identitySpiffeAuthDAL: TIdentitySpiffeAuthDALFactory;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "findOne" | "update" | "getIdentityById">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create" | "delete">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findOne" | "findEffectiveOrgMembership">;
};

export type TIdentitySpiffeAuthServiceFactory = ReturnType<typeof identitySpiffeAuthServiceFactory>;

const verifyJwtSvid = async (jwtValue: string, jwksJson: string, allowedAudiences: string[]) => {
  const jwks = createLocalJWKSet(JSON.parse(jwksJson) as JSONWebKeySet);

  try {
    const { payload } = await jwtVerify(jwtValue, jwks, {
      audience: allowedAudiences,
      algorithms: FIPS_APPROVED_JWT_ALGORITHMS
    });
    return payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) {
      throw new UnauthorizedError({ message: "JWT-SVID has expired" });
    }
    if (error instanceof joseErrors.JWSSignatureVerificationFailed) {
      throw new UnauthorizedError({ message: "JWT-SVID signature verification failed" });
    }
    if (error instanceof joseErrors.JWTClaimValidationFailed) {
      throw new UnauthorizedError({ message: "JWT-SVID audience validation failed" });
    }
    throw new UnauthorizedError({ message: "JWT-SVID verification failed" });
  }
};

const validateSpiffeClaims = (
  tokenData: Record<string, unknown>,
  config: { trustDomain: string; allowedSpiffeIds: string }
): boolean => {
  const tokenSub = tokenData.sub as string;
  if (!tokenSub || !isValidSpiffeId(tokenSub)) {
    return false;
  }

  const tokenTrustDomain = extractTrustDomainFromSpiffeId(tokenSub);
  if (tokenTrustDomain !== config.trustDomain) {
    return false;
  }

  if (!doesSpiffeIdMatchPattern(tokenSub, config.allowedSpiffeIds)) {
    return false;
  }

  return true;
};

export const identitySpiffeAuthServiceFactory = ({
  identityDAL,
  identitySpiffeAuthDAL,
  membershipIdentityDAL,
  permissionService,
  licenseService,
  identityAccessTokenDAL,
  kmsService,
  orgDAL
}: TIdentitySpiffeAuthServiceFactoryDep) => {
  type TFlattenedTrustBundle = {
    configurationType: string;
    caBundleJwks: string | null;
    bundleEndpointUrl: string | null;
    bundleEndpointCaCert: string | null;
    bundleRefreshHintSeconds: number | undefined;
  };

  const $flattenTrustBundleDistribution = (dist: TSpiffeTrustBundleDistribution): TFlattenedTrustBundle => {
    if (dist.profile === SpiffeTrustBundleProfile.STATIC) {
      return {
        configurationType: dist.profile,
        caBundleJwks: dist.bundle,
        bundleEndpointUrl: null,
        bundleEndpointCaCert: null,
        bundleRefreshHintSeconds: undefined
      };
    }
    return {
      configurationType: dist.profile,
      caBundleJwks: null,
      bundleEndpointUrl: dist.endpointUrl,
      bundleEndpointCaCert: dist.caCert || null,
      bundleRefreshHintSeconds: dist.refreshHintSeconds
    };
  };

  const $buildTrustBundleDistributionResponse = (
    dbRow: Pick<
      TIdentitySpiffeAuths,
      "configurationType" | "bundleEndpointUrl" | "cachedBundleLastRefreshedAt" | "bundleRefreshHintSeconds"
    >,
    decryptedJwks: string,
    decryptedCaCert: string
  ): TSpiffeTrustBundleDistributionResponse => {
    if (dbRow.configurationType === SpiffeTrustBundleProfile.STATIC) {
      return { profile: SpiffeTrustBundleProfile.STATIC, bundle: decryptedJwks };
    }
    return {
      profile: SpiffeTrustBundleProfile.HTTPS_WEB_BUNDLE,
      endpointUrl: dbRow.bundleEndpointUrl || "",
      caCert: decryptedCaCert,
      refreshHintSeconds: dbRow.bundleRefreshHintSeconds,
      cachedBundleLastRefreshedAt: dbRow.cachedBundleLastRefreshedAt
    };
  };

  const $validateSpiffeConfig = async (dist: TSpiffeTrustBundleDistribution) => {
    if (dist.profile === SpiffeTrustBundleProfile.STATIC) {
      try {
        createLocalJWKSet(JSON.parse(dist.bundle) as JSONWebKeySet);
      } catch {
        throw new BadRequestError({ message: "The provided CA Bundle JWKS is not valid JWKS" });
      }
      return;
    }

    try {
      const bundleJwks = await fetchRemoteBundleJwks(dist.endpointUrl, dist.caCert);
      createLocalJWKSet(JSON.parse(bundleJwks) as JSONWebKeySet);
    } catch (error) {
      if (error instanceof BadRequestError) throw error;
      throw new BadRequestError({
        message:
          "Failed to fetch or validate the remote SPIFFE trust bundle. Verify the bundle endpoint URL and CA certificate are correct."
      });
    }
  };

  const $resolveJwks = async ({
    config,
    orgId,
    forceRefresh
  }: {
    config: Pick<
      TIdentitySpiffeAuths,
      | "id"
      | "configurationType"
      | "encryptedCaBundleJwks"
      | "encryptedCachedBundleJwks"
      | "bundleEndpointUrl"
      | "encryptedBundleEndpointCaCert"
      | "bundleRefreshHintSeconds"
      | "cachedBundleLastRefreshedAt"
    >;
    orgId: string;
    forceRefresh?: boolean;
  }): Promise<{ jwksJson: string; fromCache: boolean }> => {
    const { decryptor: orgDataKeyDecryptor, encryptor: orgDataKeyEncryptor } =
      await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.Organization,
        orgId
      });

    if (config.configurationType === SpiffeTrustBundleProfile.STATIC) {
      if (!config.encryptedCaBundleJwks) {
        throw new BadRequestError({ message: "Static SPIFFE auth has no CA bundle JWKS configured" });
      }

      return {
        jwksJson: orgDataKeyDecryptor({ cipherTextBlob: config.encryptedCaBundleJwks }).toString(),
        fromCache: false
      };
    }

    // Remote configuration: check cache freshness
    if (!forceRefresh && config.encryptedCachedBundleJwks) {
      const refreshIntervalMs = (config.bundleRefreshHintSeconds || 3600) * 1000;
      const lastRefreshed = config.cachedBundleLastRefreshedAt
        ? new Date(config.cachedBundleLastRefreshedAt).getTime()
        : 0;

      if (Date.now() - lastRefreshed < refreshIntervalMs) {
        return {
          jwksJson: orgDataKeyDecryptor({ cipherTextBlob: config.encryptedCachedBundleJwks }).toString(),
          fromCache: true
        };
      }
    }

    // Fetch fresh bundle
    if (!config.bundleEndpointUrl) {
      throw new BadRequestError({ message: "Remote SPIFFE auth has no bundle endpoint URL configured" });
    }

    await blockLocalAndPrivateIpAddresses(config.bundleEndpointUrl);

    let caCert: string | undefined;
    if (config.encryptedBundleEndpointCaCert) {
      caCert = orgDataKeyDecryptor({ cipherTextBlob: config.encryptedBundleEndpointCaCert }).toString();
    }

    let bundleJson: string;
    try {
      bundleJson = await fetchRemoteBundleJwks(config.bundleEndpointUrl, caCert);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      throw new BadRequestError({ message: `Failed to fetch SPIFFE trust bundle from remote endpoint: ${msg}` });
    }

    const { cipherTextBlob: encryptedCachedBundleJwks } = orgDataKeyEncryptor({
      plainText: Buffer.from(bundleJson)
    });

    await identitySpiffeAuthDAL.updateById(config.id, {
      encryptedCachedBundleJwks,
      cachedBundleLastRefreshedAt: new Date()
    });

    logger.info(`SPIFFE auth: refreshed JWKS bundle for config ${config.id}`);

    return { jwksJson: bundleJson, fromCache: false };
  };

  const login = async ({ identityId, jwt: jwtValue, organizationSlug }: TLoginSpiffeAuthDTO) => {
    const appCfg = getConfig();
    const identitySpiffeAuth = await identitySpiffeAuthDAL.findOne({ identityId });
    if (!identitySpiffeAuth) {
      throw new NotFoundError({
        message: "SPIFFE auth method not found for identity, did you configure SPIFFE auth?"
      });
    }

    const identity = await identityDAL.findById(identitySpiffeAuth.identityId);
    if (!identity)
      throw new UnauthorizedError({
        message: "Identity not found"
      });

    const org = await orgDAL.findById(identity.orgId);
    const isSubOrgIdentity = Boolean(org.rootOrgId);
    let subOrganizationId = isSubOrgIdentity ? org.id : null;

    try {
      // Resolve JWKS (lazy fetch for remote, decrypt for static)
      let { jwksJson, fromCache } = await $resolveJwks({ config: identitySpiffeAuth, orgId: identity.orgId });

      const allowedAudiences = identitySpiffeAuth.allowedAudiences
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);

      let tokenData: Record<string, unknown>;
      try {
        tokenData = await verifyJwtSvid(jwtValue, jwksJson, allowedAudiences);
      } catch (verifyError) {
        // Kid-miss retry: if we used a cached JWKS and the kid wasn't found, force-refresh once
        if (fromCache && verifyError instanceof Error && verifyError.message.includes("No key found in JWKS")) {
          ({ jwksJson, fromCache } = await $resolveJwks({
            config: identitySpiffeAuth,
            orgId: identity.orgId,
            forceRefresh: true
          }));
          try {
            tokenData = await verifyJwtSvid(jwtValue, jwksJson, allowedAudiences);
          } catch (retryError) {
            if (retryError instanceof UnauthorizedError) {
              retryError.detail = {
                reasonCode: "jwt_svid_verification_failed",
                identityId: identity.id,
                orgId: identity.orgId,
                identityName: identity.name
              };
            }
            throw retryError;
          }
        } else {
          if (verifyError instanceof UnauthorizedError) {
            verifyError.detail = {
              reasonCode: "jwt_svid_verification_failed",
              identityId: identity.id,
              orgId: identity.orgId,
              identityName: identity.name
            };
          }
          throw verifyError;
        }
      }

      if (!validateSpiffeClaims(tokenData, identitySpiffeAuth)) {
        throw new UnauthorizedError({
          message: "Access denied",
          detail: {
            reasonCode: "spiffe_claims_invalid",
            identityId: identity.id,
            orgId: identity.orgId,
            identityName: identity.name
          }
        });
      }

      // Sub-org resolution
      if (organizationSlug && org.slug !== organizationSlug) {
        if (!isSubOrgIdentity) {
          const subOrg = await orgDAL.findOne({ rootOrgId: org.id, slug: organizationSlug });
          if (!subOrg) {
            throw new NotFoundError({ message: `Sub organization with slug ${organizationSlug} not found` });
          }

          const subOrgMembership = await orgDAL.findEffectiveOrgMembership({
            actorType: ActorType.IDENTITY,
            actorId: identity.id,
            orgId: subOrg.id
          });

          if (!subOrgMembership) {
            throw new UnauthorizedError({
              message: `Identity not authorized to access sub organization ${organizationSlug}`,
              detail: {
                reasonCode: "sub_org_unauthorized",
                identityId: identity.id,
                orgId: identity.orgId,
                identityName: identity.name
              }
            });
          }

          subOrganizationId = subOrg.id;
        }
      }

      const identityAccessToken = await identitySpiffeAuthDAL.transaction(async (tx) => {
        await membershipIdentityDAL.update(
          identity.projectId
            ? {
                scope: AccessScope.Project,
                scopeOrgId: identity.orgId,
                scopeProjectId: identity.projectId,
                actorIdentityId: identity.id
              }
            : {
                scope: AccessScope.Organization,
                scopeOrgId: identity.orgId,
                actorIdentityId: identity.id
              },
          {
            lastLoginAuthMethod: IdentityAuthMethod.SPIFFE_AUTH,
            lastLoginTime: new Date()
          },
          tx
        );
        const newToken = await identityAccessTokenDAL.create(
          {
            identityId: identitySpiffeAuth.identityId,
            isAccessTokenRevoked: false,
            accessTokenTTL: identitySpiffeAuth.accessTokenTTL,
            accessTokenMaxTTL: identitySpiffeAuth.accessTokenMaxTTL,
            accessTokenNumUses: 0,
            accessTokenNumUsesLimit: identitySpiffeAuth.accessTokenNumUsesLimit,
            authMethod: IdentityAuthMethod.SPIFFE_AUTH,
            subOrganizationId
          },
          tx
        );

        return newToken;
      });

      let expireyOptions: { expiresIn: number } | undefined;
      const accessTokenTTL = Number(identityAccessToken.accessTokenTTL);
      if (accessTokenTTL > 0) {
        expireyOptions = { expiresIn: accessTokenTTL };
      }

      const accessToken = crypto.jwt().sign(
        {
          identityId: identitySpiffeAuth.identityId,
          identityAccessTokenId: identityAccessToken.id,
          authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN
        } as TIdentityAccessTokenJwtPayload,
        appCfg.AUTH_SECRET,
        expireyOptions
      );

      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        authAttemptCounter.add(1, {
          "infisical.identity.id": identitySpiffeAuth.identityId,
          "infisical.identity.name": identity.name,
          "infisical.organization.id": org.id,
          "infisical.organization.name": org.name,
          "infisical.identity.auth_method": AuthAttemptAuthMethod.SPIFFE_AUTH,
          "infisical.identity.auth_result": AuthAttemptAuthResult.SUCCESS,
          "client.address": requestContext.get(requestContextKeys.ip),
          "user_agent.original": requestContext.get(requestContextKeys.userAgent)
        });
      }

      return { accessToken, identitySpiffeAuth, identityAccessToken, identity };
    } catch (error) {
      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        authAttemptCounter.add(1, {
          "infisical.identity.id": identitySpiffeAuth.identityId,
          "infisical.identity.name": identity.name,
          "infisical.organization.id": org.id,
          "infisical.organization.name": org.name,
          "infisical.identity.auth_method": AuthAttemptAuthMethod.SPIFFE_AUTH,
          "infisical.identity.auth_result": AuthAttemptAuthResult.FAILURE,
          "client.address": requestContext.get(requestContextKeys.ip),
          "user_agent.original": requestContext.get(requestContextKeys.userAgent)
        });
      }
      throw error;
    }
  };

  const attachSpiffeAuth = async ({
    identityId,
    trustDomain,
    allowedSpiffeIds,
    allowedAudiences,
    trustBundleDistribution,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    isActorSuperAdmin
  }: TAttachSpiffeAuthDTO) => {
    await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);

    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }
    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.SPIFFE_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add SPIFFE Auth to already configured identity"
      });
    }

    if (accessTokenMaxTTL > 0 && accessTokenTTL > accessTokenMaxTTL) {
      throw new BadRequestError({ message: "Access token TTL cannot be greater than max TTL" });
    }

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.Create,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionIdentityActions.Create,
        OrgPermissionSubjects.Identity
      );
    }

    const plan = await licenseService.getPlan(identityMembershipOrg.scopeOrgId);
    const reformattedAccessTokenTrustedIps = accessTokenTrustedIps.map((accessTokenTrustedIp) => {
      if (
        !plan.ipAllowlisting &&
        accessTokenTrustedIp.ipAddress !== "0.0.0.0/0" &&
        accessTokenTrustedIp.ipAddress !== "::/0"
      )
        throw new BadRequestError({
          message:
            "Failed to add IP access range to access token due to plan restriction. Upgrade plan to add IP access range."
        });
      if (!isValidIpOrCidr(accessTokenTrustedIp.ipAddress))
        throw new BadRequestError({
          message: "The IP is not a valid IPv4, IPv6, or CIDR block"
        });
      return extractIPDetails(accessTokenTrustedIp.ipAddress);
    });

    const flatBundle = $flattenTrustBundleDistribution(trustBundleDistribution);

    if (flatBundle.bundleEndpointUrl) {
      await blockLocalAndPrivateIpAddresses(flatBundle.bundleEndpointUrl);
    }

    await $validateSpiffeConfig(trustBundleDistribution);

    const { encryptor: orgDataKeyEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: actorOrgId
    });

    const encryptedCaBundleJwks = flatBundle.caBundleJwks
      ? orgDataKeyEncryptor({ plainText: Buffer.from(flatBundle.caBundleJwks) }).cipherTextBlob
      : null;

    const encryptedBundleEndpointCaCert = flatBundle.bundleEndpointCaCert
      ? orgDataKeyEncryptor({ plainText: Buffer.from(flatBundle.bundleEndpointCaCert) }).cipherTextBlob
      : null;

    const identitySpiffeAuth = await identitySpiffeAuthDAL.transaction(async (tx) => {
      const doc = await identitySpiffeAuthDAL.create(
        {
          identityId: identityMembershipOrg.identity.id,
          trustDomain,
          allowedSpiffeIds,
          allowedAudiences,
          configurationType: flatBundle.configurationType,
          encryptedCaBundleJwks,
          bundleEndpointUrl: flatBundle.bundleEndpointUrl || null,
          encryptedBundleEndpointCaCert,
          bundleRefreshHintSeconds: flatBundle.bundleRefreshHintSeconds || 300,
          accessTokenMaxTTL,
          accessTokenTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps: JSON.stringify(reformattedAccessTokenTrustedIps)
        },
        tx
      );

      return doc;
    });

    return {
      ...identitySpiffeAuth,
      orgId: identityMembershipOrg.scopeOrgId,
      trustBundleDistribution: $buildTrustBundleDistributionResponse(
        identitySpiffeAuth,
        flatBundle.caBundleJwks || "",
        flatBundle.bundleEndpointCaCert || ""
      )
    };
  };

  const updateSpiffeAuth = async ({
    identityId,
    trustDomain,
    allowedSpiffeIds,
    allowedAudiences,
    trustBundleDistribution,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateSpiffeAuthDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.SPIFFE_AUTH)) {
      throw new BadRequestError({ message: "Failed to update SPIFFE Auth" });
    }

    const identitySpiffeAuth = await identitySpiffeAuthDAL.findOne({ identityId });

    if (
      (accessTokenMaxTTL || identitySpiffeAuth.accessTokenMaxTTL) > 0 &&
      (accessTokenTTL || identitySpiffeAuth.accessTokenTTL) >
        (accessTokenMaxTTL || identitySpiffeAuth.accessTokenMaxTTL)
    ) {
      throw new BadRequestError({ message: "Access token TTL cannot be greater than max TTL" });
    }

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.Edit,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);
    }

    const plan = await licenseService.getPlan(identityMembershipOrg.scopeOrgId);
    const reformattedAccessTokenTrustedIps = accessTokenTrustedIps?.map((accessTokenTrustedIp) => {
      if (
        !plan.ipAllowlisting &&
        accessTokenTrustedIp.ipAddress !== "0.0.0.0/0" &&
        accessTokenTrustedIp.ipAddress !== "::/0"
      )
        throw new BadRequestError({
          message:
            "Failed to add IP access range to access token due to plan restriction. Upgrade plan to add IP access range."
        });
      if (!isValidIpOrCidr(accessTokenTrustedIp.ipAddress))
        throw new BadRequestError({
          message: "The IP is not a valid IPv4, IPv6, or CIDR block"
        });
      return extractIPDetails(accessTokenTrustedIp.ipAddress);
    });

    const updateQuery: TIdentitySpiffeAuthsUpdate = {
      trustDomain,
      allowedSpiffeIds,
      allowedAudiences,
      accessTokenMaxTTL,
      accessTokenTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps: reformattedAccessTokenTrustedIps
        ? JSON.stringify(reformattedAccessTokenTrustedIps)
        : undefined
    };

    const { encryptor: orgDataKeyEncryptor, decryptor: orgDataKeyDecryptor } =
      await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.Organization,
        orgId: actorOrgId
      });

    if (trustBundleDistribution) {
      const flatBundle = $flattenTrustBundleDistribution(trustBundleDistribution);

      if (flatBundle.bundleEndpointUrl) {
        await blockLocalAndPrivateIpAddresses(flatBundle.bundleEndpointUrl);
      }

      await $validateSpiffeConfig(trustBundleDistribution);

      updateQuery.configurationType = flatBundle.configurationType;
      updateQuery.bundleEndpointUrl = flatBundle.bundleEndpointUrl;
      updateQuery.bundleRefreshHintSeconds = flatBundle.bundleRefreshHintSeconds;
      updateQuery.encryptedCaBundleJwks = flatBundle.caBundleJwks
        ? orgDataKeyEncryptor({ plainText: Buffer.from(flatBundle.caBundleJwks) }).cipherTextBlob
        : null;
      updateQuery.encryptedBundleEndpointCaCert = flatBundle.bundleEndpointCaCert
        ? orgDataKeyEncryptor({ plainText: Buffer.from(flatBundle.bundleEndpointCaCert) }).cipherTextBlob
        : null;
    }

    const updatedSpiffeAuth = await identitySpiffeAuthDAL.updateById(identitySpiffeAuth.id, updateQuery);

    const decryptedCaBundleJwks = updatedSpiffeAuth.encryptedCaBundleJwks
      ? orgDataKeyDecryptor({ cipherTextBlob: updatedSpiffeAuth.encryptedCaBundleJwks }).toString()
      : "";
    const decryptedBundleEndpointCaCert = updatedSpiffeAuth.encryptedBundleEndpointCaCert
      ? orgDataKeyDecryptor({ cipherTextBlob: updatedSpiffeAuth.encryptedBundleEndpointCaCert }).toString()
      : "";

    return {
      ...updatedSpiffeAuth,
      orgId: identityMembershipOrg.scopeOrgId,
      trustBundleDistribution: $buildTrustBundleDistributionResponse(
        updatedSpiffeAuth,
        decryptedCaBundleJwks,
        decryptedBundleEndpointCaCert
      )
    };
  };

  const getSpiffeAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetSpiffeAuthDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.SPIFFE_AUTH)) {
      throw new BadRequestError({ message: "The identity does not have SPIFFE Auth attached" });
    }

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.Read,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);
    }

    const identitySpiffeAuth = await identitySpiffeAuthDAL.findOne({ identityId });

    const { decryptor: orgDataKeyDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: actorOrgId
    });

    const decryptedCaBundleJwks = identitySpiffeAuth.encryptedCaBundleJwks
      ? orgDataKeyDecryptor({ cipherTextBlob: identitySpiffeAuth.encryptedCaBundleJwks }).toString()
      : "";
    const decryptedBundleEndpointCaCert = identitySpiffeAuth.encryptedBundleEndpointCaCert
      ? orgDataKeyDecryptor({ cipherTextBlob: identitySpiffeAuth.encryptedBundleEndpointCaCert }).toString()
      : "";

    return {
      ...identitySpiffeAuth,
      orgId: identityMembershipOrg.scopeOrgId,
      trustBundleDistribution: $buildTrustBundleDistributionResponse(
        identitySpiffeAuth,
        decryptedCaBundleJwks,
        decryptedBundleEndpointCaCert
      )
    };
  };

  const revokeSpiffeAuth = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TRevokeSpiffeAuthDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) {
      throw new NotFoundError({ message: "Failed to find identity" });
    }
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.SPIFFE_AUTH)) {
      throw new BadRequestError({ message: "The identity does not have SPIFFE auth" });
    }

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.RevokeAuth,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);

      const { permission: rolePermission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor: ActorType.IDENTITY,
        actorId: identityMembershipOrg.identity.id,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });

      const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(identityMembershipOrg.scopeOrgId);
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        OrgPermissionIdentityActions.RevokeAuth,
        OrgPermissionSubjects.Identity,
        permission,
        rolePermission
      );
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to revoke SPIFFE auth of identity with more privileged role",
            shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.RevokeAuth,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }

    const revokedIdentitySpiffeAuth = await identitySpiffeAuthDAL.transaction(async (tx) => {
      const deletedSpiffeAuth = await identitySpiffeAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({ identityId, authMethod: IdentityAuthMethod.SPIFFE_AUTH }, tx);

      return deletedSpiffeAuth?.[0];
    });

    const { decryptor: orgDataKeyDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.scopeOrgId
    });

    const decryptedCaBundleJwks = revokedIdentitySpiffeAuth.encryptedCaBundleJwks
      ? orgDataKeyDecryptor({ cipherTextBlob: revokedIdentitySpiffeAuth.encryptedCaBundleJwks }).toString()
      : "";
    const decryptedBundleEndpointCaCert = revokedIdentitySpiffeAuth.encryptedBundleEndpointCaCert
      ? orgDataKeyDecryptor({ cipherTextBlob: revokedIdentitySpiffeAuth.encryptedBundleEndpointCaCert }).toString()
      : "";

    return {
      ...revokedIdentitySpiffeAuth,
      orgId: identityMembershipOrg.scopeOrgId,
      trustBundleDistribution: $buildTrustBundleDistributionResponse(
        revokedIdentitySpiffeAuth,
        decryptedCaBundleJwks,
        decryptedBundleEndpointCaCert
      )
    };
  };

  const refreshSpiffeBundle = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TGetSpiffeAuthDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.SPIFFE_AUTH)) {
      throw new BadRequestError({ message: "The identity does not have SPIFFE Auth attached" });
    }

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.Edit,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);
    }

    const identitySpiffeAuth = await identitySpiffeAuthDAL.findOne({ identityId });

    if (identitySpiffeAuth.configurationType === SpiffeTrustBundleProfile.STATIC) {
      throw new BadRequestError({
        message: "Bundle refresh is only applicable to identities with remote SPIFFE Auth configuration"
      });
    }

    const { jwksJson } = await $resolveJwks({
      config: identitySpiffeAuth,
      orgId: identityMembershipOrg.scopeOrgId,
      forceRefresh: true
    });

    const { decryptor: orgDataKeyDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: actorOrgId
    });

    const decryptedBundleEndpointCaCert = identitySpiffeAuth.encryptedBundleEndpointCaCert
      ? orgDataKeyDecryptor({ cipherTextBlob: identitySpiffeAuth.encryptedBundleEndpointCaCert }).toString()
      : "";

    // Use the existing row with the refresh timestamp set to now, avoiding a redundant DB read.
    const refreshedRow = {
      ...identitySpiffeAuth,
      cachedBundleLastRefreshedAt: new Date()
    };

    return {
      ...refreshedRow,
      orgId: identityMembershipOrg.scopeOrgId,
      trustBundleDistribution: $buildTrustBundleDistributionResponse(
        refreshedRow,
        jwksJson,
        decryptedBundleEndpointCaCert
      )
    };
  };

  return {
    login,
    attachSpiffeAuth,
    updateSpiffeAuth,
    getSpiffeAuth,
    revokeSpiffeAuth,
    refreshSpiffeBundle
  };
};
