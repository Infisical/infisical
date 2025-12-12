import { ForbiddenError, subject } from "@casl/ability";
import { requestContext } from "@fastify/request-context";
import axios from "axios";
import https from "https";
import jwt from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";

import {
  AccessScope,
  ActionProjectType,
  IdentityAuthMethod,
  OrganizationActionScope,
  TIdentityOidcAuthsUpdate
, SubscriptionProductCategory } from "@app/db/schemas";
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
import { AuthAttemptAuthMethod, AuthAttemptAuthResult, authAttemptCounter } from "@app/lib/telemetry/metrics";
import { getValueByDot } from "@app/lib/template/dot-access";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { validateIdentityUpdateForSuperAdminPrivileges } from "../super-admin/super-admin-fns";
import { TIdentityOidcAuthDALFactory } from "./identity-oidc-auth-dal";
import { doesAudValueMatchOidcPolicy, doesFieldValueMatchOidcPolicy } from "./identity-oidc-auth-fns";
import {
  TAttachOidcAuthDTO,
  TGetOidcAuthDTO,
  TLoginOidcAuthDTO,
  TRevokeOidcAuthDTO,
  TUpdateOidcAuthDTO
} from "./identity-oidc-auth-types";

type TIdentityOidcAuthServiceFactoryDep = {
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  identityOidcAuthDAL: TIdentityOidcAuthDALFactory;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "findOne" | "update" | "getIdentityById">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create" | "delete">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findOne">;
};

export type TIdentityOidcAuthServiceFactory = ReturnType<typeof identityOidcAuthServiceFactory>;

export const identityOidcAuthServiceFactory = ({
  identityDAL,
  identityOidcAuthDAL,
  membershipIdentityDAL,
  permissionService,
  licenseService,
  identityAccessTokenDAL,
  kmsService,
  orgDAL
}: TIdentityOidcAuthServiceFactoryDep) => {
  const login = async ({ identityId, jwt: oidcJwt, subOrganizationName }: TLoginOidcAuthDTO) => {
    const appCfg = getConfig();
    const identityOidcAuth = await identityOidcAuthDAL.findOne({ identityId });
    if (!identityOidcAuth) {
      throw new NotFoundError({ message: "OIDC auth method not found for identity, did you configure OIDC auth?" });
    }

    const identity = await identityDAL.findById(identityOidcAuth.identityId);
    if (!identity) throw new UnauthorizedError({ message: "Identity not found" });

    const org = await orgDAL.findById(identity.orgId);
    const isSubOrgIdentity = Boolean(org.rootOrgId);

    // If the identity is a sub-org identity, then the scope is always the org.id, and if it's a root org identity, then we need to resolve the scope if a subOrganizationName is specified
    let subOrganizationId = isSubOrgIdentity ? org.id : null;

    try {
      const { decryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.Organization,
        orgId: identity.orgId
      });

      let caCert = "";
      if (identityOidcAuth.encryptedCaCertificate) {
        caCert = decryptor({ cipherTextBlob: identityOidcAuth.encryptedCaCertificate }).toString();
      }

      const requestAgent = new https.Agent({ ca: caCert, rejectUnauthorized: !!caCert });

      let discoveryDoc: { jwks_uri: string };
      try {
        const response = await axios.get<{ jwks_uri: string }>(
          `${identityOidcAuth.oidcDiscoveryUrl}/.well-known/openid-configuration`,
          {
            httpsAgent: identityOidcAuth.oidcDiscoveryUrl.includes("https") ? requestAgent : undefined
          }
        );
        discoveryDoc = response.data;
      } catch (error) {
        throw new UnauthorizedError({
          message: `Access denied: Failed to fetch OIDC discovery document from ${identityOidcAuth.oidcDiscoveryUrl}. ${error instanceof Error ? error.message : String(error)}`
        });
      }

      const jwksUri = discoveryDoc.jwks_uri;
      if (!jwksUri) {
        throw new UnauthorizedError({
          message: `Access denied: OIDC discovery document does not contain a jwks_uri. The identity provider may be misconfigured.`
        });
      }

      const decodedToken = crypto.jwt().decode(oidcJwt, { complete: true });
      if (!decodedToken) {
        throw new UnauthorizedError({
          message: "Invalid JWT"
        });
      }

      const client = new JwksClient({
        jwksUri,
        requestAgent: identityOidcAuth.oidcDiscoveryUrl.includes("https") ? requestAgent : undefined
      });

      const { kid } = decodedToken.header as { kid?: string };

      let tokenData: Record<string, string> | undefined;

      // If kid is provided, try to get the specific signing key
      if (kid) {
        let oidcSigningKey;
        try {
          oidcSigningKey = await client.getSigningKey(kid);
        } catch (error) {
          if (error instanceof Error && error.name === "SigningKeyNotFoundError") {
            throw new UnauthorizedError({
              message: `Access denied: Unable to verify JWT signature. The signing key '${kid}' was not found in the OIDC provider's JWKS endpoint. This may indicate an invalid token or misconfigured OIDC provider.`
            });
          }
          throw new UnauthorizedError({
            message: `Access denied: Failed to retrieve signing key from OIDC provider: ${error instanceof Error ? error.message : String(error)}`
          });
        }

        try {
          tokenData = crypto.jwt().verify(oidcJwt, oidcSigningKey.getPublicKey(), {
            issuer: identityOidcAuth.boundIssuer
          }) as Record<string, string>;
        } catch (error) {
          if (error instanceof jwt.JsonWebTokenError) {
            throw new UnauthorizedError({
              message: `Access denied: ${error.message}`
            });
          }
          throw error;
        }
      } else {
        // If kid is not provided, try all available signing keys
        logger.warn(
          `OIDC login without KID header [identityId=${identityOidcAuth.identityId}] [orgId=${org.id}] [ip=${requestContext.get("ip")}]`
        );

        let allSigningKeys;
        try {
          allSigningKeys = await client.getSigningKeys();
        } catch (error) {
          throw new UnauthorizedError({
            message: `Access denied: Failed to retrieve signing keys from OIDC provider: ${error instanceof Error ? error.message : String(error)}`
          });
        }

        if (!allSigningKeys || allSigningKeys.length === 0) {
          throw new UnauthorizedError({
            message: "Access denied: No signing keys available from OIDC provider's JWKS endpoint."
          });
        }

        // Limit the number of keys to try to prevent abuse
        const MAX_KEYS_TO_TRY = 10;
        if (allSigningKeys.length > MAX_KEYS_TO_TRY) {
          throw new UnauthorizedError({
            message: `Access denied: OIDC provider has ${allSigningKeys.length} signing keys. Tokens must include 'kid' header when provider has more than ${MAX_KEYS_TO_TRY} keys.`
          });
        }

        let lastError: Error | null = null;
        let verified = false;

        // Try each signing key until one works
        for (const signingKey of allSigningKeys) {
          try {
            tokenData = crypto.jwt().verify(oidcJwt, signingKey.getPublicKey(), {
              issuer: identityOidcAuth.boundIssuer
            }) as Record<string, string>;
            verified = true;
            break;
          } catch (error) {
            if (error instanceof jwt.JsonWebTokenError) {
              lastError = error;
              // Continue trying other keys
            } else {
              throw error;
            }
          }
        }

        if (!verified) {
          throw new UnauthorizedError({
            message: `Access denied: Unable to verify JWT signature with any available signing key. ${lastError ? lastError.message : "Invalid token"}`
          });
        }
      }

      // Ensure tokenData was successfully assigned
      if (!tokenData) {
        throw new UnauthorizedError({
          message: "Access denied: Failed to verify JWT token"
        });
      }

      const verifiedTokenData: Record<string, string> = tokenData;

      if (identityOidcAuth.boundSubject) {
        if (!doesFieldValueMatchOidcPolicy(verifiedTokenData.sub, identityOidcAuth.boundSubject)) {
          throw new ForbiddenRequestError({
            message: "Access denied: OIDC subject not allowed."
          });
        }
      }

      if (identityOidcAuth.boundAudiences) {
        if (
          !identityOidcAuth.boundAudiences
            .split(", ")
            .some((policyValue) => doesAudValueMatchOidcPolicy(verifiedTokenData.aud, policyValue))
        ) {
          throw new UnauthorizedError({
            message: "Access denied: OIDC audience not allowed."
          });
        }
      }

      if (identityOidcAuth.boundClaims) {
        Object.keys(identityOidcAuth.boundClaims).forEach((claimKey) => {
          const claimValue = (identityOidcAuth.boundClaims as Record<string, string>)[claimKey];
          const value = getValueByDot(verifiedTokenData, claimKey);

          if (!value) {
            throw new UnauthorizedError({
              message: `Access denied: token has no ${claimKey} field`
            });
          }

          // handle both single and multi-valued claims
          if (!claimValue.split(", ").some((claimEntry) => doesFieldValueMatchOidcPolicy(value, claimEntry))) {
            throw new UnauthorizedError({
              message: "Access denied: OIDC claim not allowed."
            });
          }
        });
      }

      const filteredClaims: Record<string, string> = {};
      if (identityOidcAuth.claimMetadataMapping) {
        Object.keys(identityOidcAuth.claimMetadataMapping).forEach((permissionKey) => {
          const claimKey = (identityOidcAuth.claimMetadataMapping as Record<string, string>)[permissionKey];
          const value = getValueByDot(verifiedTokenData, claimKey);
          if (!value) {
            throw new UnauthorizedError({
              message: `Access denied: token has no ${claimKey} field`
            });
          }
          filteredClaims[permissionKey] = value.toString();
        });
      }

      if (subOrganizationName) {
        if (!isSubOrgIdentity) {
          const subOrg = await orgDAL.findOne({ rootOrgId: org.id, slug: subOrganizationName });

          if (!subOrg) {
            throw new NotFoundError({ message: `Sub organization with name ${subOrganizationName} not found` });
          }

          const subOrgMembership = await membershipIdentityDAL.findOne({
            scope: AccessScope.Organization,
            actorIdentityId: identity.id,
            scopeOrgId: subOrg.id
          });

          if (!subOrgMembership) {
            throw new UnauthorizedError({
              message: `Identity not authorized to access sub organization ${subOrganizationName}`
            });
          }

          subOrganizationId = subOrg.id;
        }
      }

      const identityAccessToken = await identityOidcAuthDAL.transaction(async (tx) => {
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
            lastLoginAuthMethod: IdentityAuthMethod.OIDC_AUTH,
            lastLoginTime: new Date()
          },
          tx
        );
        const newToken = await identityAccessTokenDAL.create(
          {
            identityId: identityOidcAuth.identityId,
            isAccessTokenRevoked: false,
            accessTokenTTL: identityOidcAuth.accessTokenTTL,
            accessTokenMaxTTL: identityOidcAuth.accessTokenMaxTTL,
            accessTokenNumUses: 0,
            accessTokenNumUsesLimit: identityOidcAuth.accessTokenNumUsesLimit,
            authMethod: IdentityAuthMethod.OIDC_AUTH,
            subOrganizationId
          },
          tx
        );
        return newToken;
      });

      const accessToken = crypto.jwt().sign(
        {
          identityId: identityOidcAuth.identityId,
          identityAccessTokenId: identityAccessToken.id,
          authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN,
          identityAuth: {
            oidc: {
              claims: filteredClaims
            }
          }
        } as TIdentityAccessTokenJwtPayload,
        appCfg.AUTH_SECRET,
        // akhilmhdh: for non-expiry tokens you should not even set the value, including undefined. Even for undefined jsonwebtoken throws error
        Number(identityAccessToken.accessTokenTTL) === 0
          ? undefined
          : {
              expiresIn: Number(identityAccessToken.accessTokenTTL)
            }
      );

      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        authAttemptCounter.add(1, {
          "infisical.identity.id": identityOidcAuth.identityId,
          "infisical.identity.name": identity.name,
          "infisical.organization.id": org.id,
          "infisical.organization.name": org.name,
          "infisical.identity.auth_method": AuthAttemptAuthMethod.OIDC_AUTH,
          "infisical.identity.auth_result": AuthAttemptAuthResult.SUCCESS,
          "client.address": requestContext.get("ip"),
          "user_agent.original": requestContext.get("userAgent")
        });
      }

      return { accessToken, identityOidcAuth, identityAccessToken, identity, oidcTokenData: verifiedTokenData };
    } catch (error) {
      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        authAttemptCounter.add(1, {
          "infisical.identity.id": identityOidcAuth.identityId,
          "infisical.identity.name": identity.name,
          "infisical.organization.id": org.id,
          "infisical.organization.name": org.name,
          "infisical.identity.auth_method": AuthAttemptAuthMethod.OIDC_AUTH,
          "infisical.identity.auth_result": AuthAttemptAuthResult.FAILURE,
          "client.address": requestContext.get("ip"),
          "user_agent.original": requestContext.get("userAgent")
        });
      }
      throw error;
    }
  };

  const attachOidcAuth = async ({
    identityId,
    oidcDiscoveryUrl,
    caCert,
    boundIssuer,
    boundAudiences,
    boundClaims,
    claimMetadataMapping,
    boundSubject,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    isActorSuperAdmin
  }: TAttachOidcAuthDTO) => {
    await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) {
      throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    }
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }
    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.OIDC_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add OIDC Auth to already configured identity"
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
        !plan.get(SubscriptionProductCategory.Platform, "ipAllowlisting") &&
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

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.scopeOrgId
    });

    const identityOidcAuth = await identityOidcAuthDAL.transaction(async (tx) => {
      const doc = await identityOidcAuthDAL.create(
        {
          identityId: identityMembershipOrg.identity.id,
          oidcDiscoveryUrl,
          encryptedCaCertificate: encryptor({ plainText: Buffer.from(caCert) }).cipherTextBlob,
          boundIssuer,
          boundAudiences,
          boundClaims,
          claimMetadataMapping,
          boundSubject,
          accessTokenMaxTTL,
          accessTokenTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps: JSON.stringify(reformattedAccessTokenTrustedIps)
        },
        tx
      );
      return doc;
    });
    return { ...identityOidcAuth, orgId: identityMembershipOrg.scopeOrgId, caCert };
  };

  const updateOidcAuth = async ({
    identityId,
    oidcDiscoveryUrl,
    caCert,
    boundIssuer,
    boundAudiences,
    boundClaims,
    claimMetadataMapping,
    boundSubject,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateOidcAuthDTO) => {
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

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.OIDC_AUTH)) {
      throw new BadRequestError({
        message: "Failed to update OIDC Auth"
      });
    }

    const identityOidcAuth = await identityOidcAuthDAL.findOne({ identityId });

    if (
      (accessTokenMaxTTL || identityOidcAuth.accessTokenMaxTTL) > 0 &&
      (accessTokenTTL || identityOidcAuth.accessTokenMaxTTL) > (accessTokenMaxTTL || identityOidcAuth.accessTokenMaxTTL)
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
        !plan.get(SubscriptionProductCategory.Platform, "ipAllowlisting") &&
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

    const updateQuery: TIdentityOidcAuthsUpdate = {
      oidcDiscoveryUrl,
      boundIssuer,
      boundAudiences,
      boundClaims,
      claimMetadataMapping,
      boundSubject,
      accessTokenMaxTTL,
      accessTokenTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps: reformattedAccessTokenTrustedIps
        ? JSON.stringify(reformattedAccessTokenTrustedIps)
        : undefined
    };

    const { encryptor, decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.scopeOrgId
    });

    if (caCert !== undefined) {
      updateQuery.encryptedCaCertificate = encryptor({ plainText: Buffer.from(caCert) }).cipherTextBlob;
    }

    const updatedOidcAuth = await identityOidcAuthDAL.updateById(identityOidcAuth.id, updateQuery);
    const updatedCACert = updatedOidcAuth.encryptedCaCertificate
      ? decryptor({ cipherTextBlob: updatedOidcAuth.encryptedCaCertificate }).toString()
      : "";

    return {
      ...updatedOidcAuth,
      orgId: identityMembershipOrg.scopeOrgId,
      caCert: updatedCACert
    };
  };

  const getOidcAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetOidcAuthDTO) => {
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

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.OIDC_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have OIDC Auth attached"
      });
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

    const identityOidcAuth = await identityOidcAuthDAL.findOne({ identityId });

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.scopeOrgId
    });

    const caCert = identityOidcAuth.encryptedCaCertificate
      ? decryptor({ cipherTextBlob: identityOidcAuth.encryptedCaCertificate }).toString()
      : "";

    return { ...identityOidcAuth, orgId: identityMembershipOrg.scopeOrgId, caCert };
  };

  const revokeOidcAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TRevokeOidcAuthDTO) => {
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

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.OIDC_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have OIDC auth"
      });
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
        actor: ActorType.IDENTITY,
        actorId: identityMembershipOrg.identity.id,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId,
        scope: OrganizationActionScope.Any
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
            "Failed to revoke oidc auth of identity with more privileged role",
            shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.RevokeAuth,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }

    const revokedIdentityOidcAuth = await identityOidcAuthDAL.transaction(async (tx) => {
      const deletedOidcAuth = await identityOidcAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({ identityId, authMethod: IdentityAuthMethod.OIDC_AUTH }, tx);

      return { ...deletedOidcAuth?.[0], orgId: identityMembershipOrg.scopeOrgId };
    });

    return revokedIdentityOidcAuth;
  };

  return {
    attachOidcAuth,
    updateOidcAuth,
    getOidcAuth,
    revokeOidcAuth,
    login
  };
};
