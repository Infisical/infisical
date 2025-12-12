import { ForbiddenError, subject } from "@casl/ability";
import { requestContext } from "@fastify/request-context";
import https from "https";
import jwt from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";

import {
  AccessScope,
  ActionProjectType,
  IdentityAuthMethod,
  OrganizationActionScope,
  TIdentityJwtAuthsUpdate
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
import { TIdentityJwtAuthDALFactory } from "./identity-jwt-auth-dal";
import { doesFieldValueMatchJwtPolicy } from "./identity-jwt-auth-fns";
import {
  JwtConfigurationType,
  TAttachJwtAuthDTO,
  TGetJwtAuthDTO,
  TLoginJwtAuthDTO,
  TRevokeJwtAuthDTO,
  TUpdateJwtAuthDTO
} from "./identity-jwt-auth-types";

type TIdentityJwtAuthServiceFactoryDep = {
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  identityJwtAuthDAL: TIdentityJwtAuthDALFactory;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "findOne" | "update" | "getIdentityById">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create" | "delete">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findOne">;
};

export type TIdentityJwtAuthServiceFactory = ReturnType<typeof identityJwtAuthServiceFactory>;

export const identityJwtAuthServiceFactory = ({
  identityDAL,
  identityJwtAuthDAL,
  membershipIdentityDAL,
  permissionService,
  licenseService,
  identityAccessTokenDAL,
  kmsService,
  orgDAL
}: TIdentityJwtAuthServiceFactoryDep) => {
  const login = async ({ identityId, jwt: jwtValue, subOrganizationName }: TLoginJwtAuthDTO) => {
    const appCfg = getConfig();
    const identityJwtAuth = await identityJwtAuthDAL.findOne({ identityId });
    if (!identityJwtAuth) {
      throw new NotFoundError({ message: "JWT auth method not found for identity, did you configure JWT auth?" });
    }

    const identity = await identityDAL.findById(identityJwtAuth.identityId);
    if (!identity) throw new UnauthorizedError({ message: "Identity not found" });

    const org = await orgDAL.findById(identity.orgId);
    const isSubOrgIdentity = Boolean(org.rootOrgId);

    // If the identity is a sub-org identity, then the scope is always the org.id, and if it's a root org identity, then we need to resolve the scope if a subOrganizationName is specified
    let subOrganizationId = isSubOrgIdentity ? org.id : null;

    try {
      const { decryptor: orgDataKeyDecryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.Organization,
        orgId: identity.orgId
      });

      const decodedToken = crypto.jwt().decode(jwtValue, { complete: true });
      if (!decodedToken) {
        throw new UnauthorizedError({
          message: "Invalid JWT"
        });
      }

      let tokenData: Record<string, string | boolean | number> = {};

      if (identityJwtAuth.configurationType === JwtConfigurationType.JWKS) {
        let client: JwksClient;
        if (identityJwtAuth.jwksUrl.includes("https:")) {
          const decryptedJwksCaCert = orgDataKeyDecryptor({
            cipherTextBlob: identityJwtAuth.encryptedJwksCaCert
          }).toString();

          const requestAgent = new https.Agent({ ca: decryptedJwksCaCert, rejectUnauthorized: !!decryptedJwksCaCert });
          client = new JwksClient({
            jwksUri: identityJwtAuth.jwksUrl,
            requestAgent
          });
        } else {
          client = new JwksClient({
            jwksUri: identityJwtAuth.jwksUrl
          });
        }

        const { kid } = decodedToken.header as { kid: string };
        const jwtSigningKey = await client.getSigningKey(kid);

        try {
          tokenData = crypto.jwt().verify(jwtValue, jwtSigningKey.getPublicKey()) as Record<string, string>;
        } catch (error) {
          if (error instanceof jwt.JsonWebTokenError) {
            throw new UnauthorizedError({
              message: `Access denied: ${error.message}`
            });
          }

          throw error;
        }
      } else {
        const decryptedPublicKeys = orgDataKeyDecryptor({ cipherTextBlob: identityJwtAuth.encryptedPublicKeys })
          .toString()
          .split(",");

        const errors: string[] = [];
        let isMatchAnyKey = false;
        for (const publicKey of decryptedPublicKeys) {
          try {
            tokenData = crypto.jwt().verify(jwtValue, publicKey) as Record<string, string>;
            isMatchAnyKey = true;
          } catch (error) {
            if (error instanceof jwt.JsonWebTokenError) {
              errors.push(error.message);
            }
          }
        }

        if (!isMatchAnyKey) {
          throw new UnauthorizedError({
            message: `Access denied: JWT verification failed with all keys. Errors - ${errors.join("; ")}`
          });
        }
      }

      if (identityJwtAuth.boundIssuer) {
        if (tokenData.iss !== identityJwtAuth.boundIssuer) {
          throw new ForbiddenRequestError({
            message: "Access denied: issuer mismatch"
          });
        }
      }

      if (identityJwtAuth.boundSubject) {
        if (!tokenData.sub) {
          throw new UnauthorizedError({
            message: "Access denied: token has no subject field"
          });
        }

        if (!doesFieldValueMatchJwtPolicy(tokenData.sub, identityJwtAuth.boundSubject)) {
          throw new ForbiddenRequestError({
            message: "Access denied: subject not allowed"
          });
        }
      }

      if (identityJwtAuth.boundAudiences) {
        if (!tokenData.aud) {
          throw new UnauthorizedError({
            message: "Access denied: token has no audience field"
          });
        }

        if (
          !identityJwtAuth.boundAudiences
            .split(", ")
            .some((policyValue) => doesFieldValueMatchJwtPolicy(tokenData.aud, policyValue))
        ) {
          throw new UnauthorizedError({
            message: "Access denied: token audience not allowed"
          });
        }
      }

      if (identityJwtAuth.boundClaims) {
        Object.keys(identityJwtAuth.boundClaims).forEach((claimKey) => {
          const claimValue = (identityJwtAuth.boundClaims as Record<string, string>)[claimKey];
          const value = getValueByDot(tokenData, claimKey);

          if (!value) {
            throw new UnauthorizedError({
              message: `Access denied: token has no ${claimKey} field`
            });
          }

          // handle both single and multi-valued claims
          if (!claimValue.split(", ").some((claimEntry) => doesFieldValueMatchJwtPolicy(value, claimEntry))) {
            throw new UnauthorizedError({
              message: `Access denied: claim mismatch for field ${claimKey}`
            });
          }
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

      const identityAccessToken = await identityJwtAuthDAL.transaction(async (tx) => {
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
            lastLoginAuthMethod: IdentityAuthMethod.JWT_AUTH,
            lastLoginTime: new Date()
          },
          tx
        );
        const newToken = await identityAccessTokenDAL.create(
          {
            identityId: identityJwtAuth.identityId,
            isAccessTokenRevoked: false,
            accessTokenTTL: identityJwtAuth.accessTokenTTL,
            accessTokenMaxTTL: identityJwtAuth.accessTokenMaxTTL,
            accessTokenNumUses: 0,
            accessTokenNumUsesLimit: identityJwtAuth.accessTokenNumUsesLimit,
            authMethod: IdentityAuthMethod.JWT_AUTH,
            subOrganizationId
          },
          tx
        );

        return newToken;
      });

      const accessToken = crypto.jwt().sign(
        {
          identityId: identityJwtAuth.identityId,
          identityAccessTokenId: identityAccessToken.id,
          authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN
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
          "infisical.identity.id": identityJwtAuth.identityId,
          "infisical.identity.name": identity.name,
          "infisical.organization.id": org.id,
          "infisical.organization.name": org.name,
          "infisical.identity.auth_method": AuthAttemptAuthMethod.JWT_AUTH,
          "infisical.identity.auth_result": AuthAttemptAuthResult.SUCCESS,
          "client.address": requestContext.get("ip"),
          "user_agent.original": requestContext.get("userAgent")
        });
      }

      return { accessToken, identityJwtAuth, identityAccessToken, identity };
    } catch (error) {
      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        authAttemptCounter.add(1, {
          "infisical.identity.id": identityJwtAuth.identityId,
          "infisical.identity.name": identity.name,
          "infisical.organization.id": org.id,
          "infisical.organization.name": org.name,
          "infisical.identity.auth_method": AuthAttemptAuthMethod.JWT_AUTH,
          "infisical.identity.auth_result": AuthAttemptAuthResult.FAILURE,
          "client.address": requestContext.get("ip"),
          "user_agent.original": requestContext.get("userAgent")
        });
      }
      throw error;
    }
  };

  const attachJwtAuth = async ({
    identityId,
    configurationType,
    jwksUrl,
    jwksCaCert,
    publicKeys,
    boundIssuer,
    boundAudiences,
    boundClaims,
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
  }: TAttachJwtAuthDTO) => {
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
    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.JWT_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add JWT Auth to already configured identity"
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

    const { encryptor: orgDataKeyEncryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: actorOrgId
    });

    const { cipherTextBlob: encryptedJwksCaCert } = orgDataKeyEncryptor({
      plainText: Buffer.from(jwksCaCert)
    });

    const { cipherTextBlob: encryptedPublicKeys } = orgDataKeyEncryptor({
      plainText: Buffer.from(publicKeys.join(","))
    });

    const identityJwtAuth = await identityJwtAuthDAL.transaction(async (tx) => {
      const doc = await identityJwtAuthDAL.create(
        {
          identityId: identityMembershipOrg.identity.id,
          configurationType,
          jwksUrl,
          encryptedJwksCaCert,
          encryptedPublicKeys,
          boundIssuer,
          boundAudiences,
          boundClaims,
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
    return { ...identityJwtAuth, orgId: identityMembershipOrg.scopeOrgId, jwksCaCert, publicKeys };
  };

  const updateJwtAuth = async ({
    identityId,
    configurationType,
    jwksUrl,
    jwksCaCert,
    publicKeys,
    boundIssuer,
    boundAudiences,
    boundClaims,
    boundSubject,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateJwtAuthDTO) => {
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

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.JWT_AUTH)) {
      throw new BadRequestError({
        message: "Failed to update JWT Auth"
      });
    }

    const identityJwtAuth = await identityJwtAuthDAL.findOne({ identityId });

    if (
      (accessTokenMaxTTL || identityJwtAuth.accessTokenMaxTTL) > 0 &&
      (accessTokenTTL || identityJwtAuth.accessTokenMaxTTL) > (accessTokenMaxTTL || identityJwtAuth.accessTokenMaxTTL)
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

    const updateQuery: TIdentityJwtAuthsUpdate = {
      boundIssuer,
      configurationType,
      jwksUrl,
      boundAudiences,
      boundClaims,
      boundSubject,
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

    if (jwksCaCert !== undefined) {
      const { cipherTextBlob: encryptedJwksCaCert } = orgDataKeyEncryptor({
        plainText: Buffer.from(jwksCaCert)
      });

      updateQuery.encryptedJwksCaCert = encryptedJwksCaCert;
    }

    if (publicKeys) {
      const { cipherTextBlob: encryptedPublicKeys } = orgDataKeyEncryptor({
        plainText: Buffer.from(publicKeys.join(","))
      });

      updateQuery.encryptedPublicKeys = encryptedPublicKeys;
    }

    const updatedJwtAuth = await identityJwtAuthDAL.updateById(identityJwtAuth.id, updateQuery);
    const decryptedJwksCaCert = orgDataKeyDecryptor({ cipherTextBlob: updatedJwtAuth.encryptedJwksCaCert }).toString();
    const decryptedPublicKeys = orgDataKeyDecryptor({ cipherTextBlob: updatedJwtAuth.encryptedPublicKeys })
      .toString()
      .split(",");

    return {
      ...updatedJwtAuth,
      orgId: identityMembershipOrg.scopeOrgId,
      jwksCaCert: decryptedJwksCaCert,
      publicKeys: decryptedPublicKeys
    };
  };

  const getJwtAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetJwtAuthDTO) => {
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

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.JWT_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have JWT Auth attached"
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
    const identityJwtAuth = await identityJwtAuthDAL.findOne({ identityId });

    const { decryptor: orgDataKeyDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: actorOrgId
    });

    const decryptedJwksCaCert = orgDataKeyDecryptor({ cipherTextBlob: identityJwtAuth.encryptedJwksCaCert }).toString();
    const decryptedPublicKeys = orgDataKeyDecryptor({ cipherTextBlob: identityJwtAuth.encryptedPublicKeys })
      .toString()
      .split(",");

    return {
      ...identityJwtAuth,
      orgId: identityMembershipOrg.scopeOrgId,
      jwksCaCert: decryptedJwksCaCert,
      publicKeys: decryptedPublicKeys
    };
  };

  const revokeJwtAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TRevokeJwtAuthDTO) => {
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

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.JWT_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have JWT auth"
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
            "Failed to revoke jwt auth of identity with more privileged role",
            shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.RevokeAuth,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }
    const revokedIdentityJwtAuth = await identityJwtAuthDAL.transaction(async (tx) => {
      const deletedJwtAuth = await identityJwtAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({ identityId, authMethod: IdentityAuthMethod.JWT_AUTH }, tx);

      return { ...deletedJwtAuth?.[0], orgId: identityMembershipOrg.scopeOrgId };
    });

    return revokedIdentityJwtAuth;
  };

  return {
    login,
    attachJwtAuth,
    updateJwtAuth,
    getJwtAuth,
    revokeJwtAuth
  };
};
