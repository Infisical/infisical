import { ForbiddenError, subject } from "@casl/ability";
import { requestContext } from "@fastify/request-context";
import jwt from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";

import {
  AccessScope,
  ActionProjectType,
  IdentityAuthMethod,
  OrganizationActionScope,
  TIdentityJwtAuthsUpdate
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
import { extractIPDetails, isValidIpOrCidr, TIp } from "@app/lib/ip";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { AuthAttemptAuthMethod, AuthAttemptAuthResult, authAttemptCounter } from "@app/lib/telemetry/metrics";
import { getValueByDot } from "@app/lib/template/dot-access";
import { blockLocalAndPrivateIpAddresses, buildSsrfSafeAgent } from "@app/lib/validator";

import { ActorType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenServiceFactory } from "../identity-access-token/identity-access-token-service";
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
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "delete">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findOne" | "findEffectiveOrgMembership">;
  identityAccessTokenService: Pick<
    TIdentityAccessTokenServiceFactory,
    "issueIdentityAccessToken" | "revokeAllTokensForIdentity"
  >;
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
  orgDAL,
  identityAccessTokenService
}: TIdentityJwtAuthServiceFactoryDep) => {
  const login = async ({ identityId, jwt: jwtValue, organizationSlug }: TLoginJwtAuthDTO) => {
    const appCfg = getConfig();
    const identityJwtAuth = await identityJwtAuthDAL.findOne({ identityId });
    if (!identityJwtAuth) {
      throw new NotFoundError({ message: "JWT auth method not found for identity, did you configure JWT auth?" });
    }

    const identity = await requestMemoize(requestMemoKeys.identityFindById(identityJwtAuth.identityId), () =>
      identityDAL.findById(identityJwtAuth.identityId)
    );
    if (!identity)
      throw new UnauthorizedError({
        message: "Identity not found"
      });

    const org = await requestMemoize(requestMemoKeys.orgFindById(identity.orgId), () =>
      orgDAL.findById(identity.orgId)
    );
    const isSubOrgIdentity = Boolean(org.rootOrgId);

    // If the identity is a sub-org identity, then the scope is always the org.id, and if it's a root org identity, then we need to resolve the scope if a organizationSlug is specified
    let subOrganizationId = isSubOrgIdentity ? org.id : null;

    try {
      const { decryptor: orgDataKeyDecryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.Organization,
        orgId: identity.orgId
      });

      const decodedToken = crypto.jwt().decode(jwtValue, { complete: true });
      if (!decodedToken) {
        throw new UnauthorizedError({
          message: "Invalid JWT",
          detail: {
            reasonCode: "invalid_jwt",
            identityId: identity.id,
            orgId: identity.orgId,
            identityName: identity.name
          }
        });
      }

      let tokenData: Record<string, string | boolean | number> = {};

      if (identityJwtAuth.configurationType === JwtConfigurationType.JWKS) {
        // Validate the jwksUrl AND build a pinned agent in one step. JwksClient
        // performs its own HTTP under the hood, so we hand it our pinned agent
        // to defeat DNS rebinding on the JWKS fetch (TOCTOU window between a
        // pre-validation and the actual connection).
        let decryptedJwksCaCert: string | undefined;
        if (identityJwtAuth.jwksUrl.includes("https:")) {
          decryptedJwksCaCert = orgDataKeyDecryptor({
            cipherTextBlob: identityJwtAuth.encryptedJwksCaCert
          }).toString();
        }

        const jwksRequestAgent = await buildSsrfSafeAgent(identityJwtAuth.jwksUrl, {
          ca: decryptedJwksCaCert || undefined,
          rejectUnauthorized: true
        });

        const client = new JwksClient({
          jwksUri: identityJwtAuth.jwksUrl,
          requestAgent: jwksRequestAgent
        });

        const { kid } = decodedToken.header as { kid: string };
        const jwtSigningKey = await client.getSigningKey(kid);

        try {
          tokenData = crypto.jwt().verify(jwtValue, jwtSigningKey.getPublicKey()) as Record<string, string>;
        } catch (error) {
          if (error instanceof jwt.JsonWebTokenError) {
            throw new UnauthorizedError({
              message: `Access denied: ${error.message}`,
              detail: {
                reasonCode: "jwt_verification_failed",
                identityId: identity.id,
                orgId: identity.orgId,
                identityName: identity.name
              }
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
            message: `Access denied: JWT verification failed with all keys. Errors - ${errors.join("; ")}`,
            detail: {
              reasonCode: "jwt_verification_failed",
              identityId: identity.id,
              orgId: identity.orgId,
              identityName: identity.name
            }
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
            message: "Access denied: token has no subject field",
            detail: {
              reasonCode: "missing_subject",
              identityId: identity.id,
              orgId: identity.orgId,
              identityName: identity.name
            }
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
            message: "Access denied: token has no audience field",
            detail: {
              reasonCode: "missing_audience",
              identityId: identity.id,
              orgId: identity.orgId,
              identityName: identity.name
            }
          });
        }

        if (
          !identityJwtAuth.boundAudiences
            .split(", ")
            .some((policyValue) => doesFieldValueMatchJwtPolicy(tokenData.aud, policyValue))
        ) {
          throw new UnauthorizedError({
            message: "Access denied: token audience not allowed",
            detail: {
              reasonCode: "audience_not_allowed",
              identityId: identity.id,
              orgId: identity.orgId,
              identityName: identity.name
            }
          });
        }
      }

      if (identityJwtAuth.boundClaims) {
        Object.keys(identityJwtAuth.boundClaims).forEach((claimKey) => {
          const claimValue = (identityJwtAuth.boundClaims as Record<string, string>)[claimKey];
          const value = getValueByDot(tokenData, claimKey);

          if (!value) {
            throw new UnauthorizedError({
              message: `Access denied: token has no ${claimKey} field`,
              detail: {
                reasonCode: "missing_claim",
                identityId: identity.id,
                orgId: identity.orgId,
                identityName: identity.name
              }
            });
          }

          // handle both single and multi-valued claims
          if (!claimValue.split(", ").some((claimEntry) => doesFieldValueMatchJwtPolicy(value, claimEntry))) {
            throw new UnauthorizedError({
              message: `Access denied: claim mismatch for field ${claimKey}`,
              detail: {
                reasonCode: "claim_mismatch",
                identityId: identity.id,
                orgId: identity.orgId,
                identityName: identity.name
              }
            });
          }
        });
      }

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

      await identityJwtAuthDAL.transaction(async (tx) => {
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
      });

      const subOrgDetails =
        subOrganizationId && subOrganizationId !== org.id ? await orgDAL.findById(subOrganizationId) : null;
      const tokenScopeOrg = subOrgDetails ?? org;
      const tokenRootOrgId = tokenScopeOrg.rootOrgId ?? tokenScopeOrg.id;
      const tokenParentOrgId = tokenScopeOrg.parentOrgId ?? tokenRootOrgId;

      const { accessToken, identityAccessToken } = await identityAccessTokenService.issueIdentityAccessToken({
        identityId: identityJwtAuth.identityId,
        identityName: identity.name,
        authMethod: IdentityAuthMethod.JWT_AUTH,
        orgId: tokenScopeOrg.id,
        rootOrgId: tokenRootOrgId,
        parentOrgId: tokenParentOrgId,
        subOrganizationId,
        accessTokenTTL: Number(identityJwtAuth.accessTokenTTL),
        accessTokenMaxTTL: Number(identityJwtAuth.accessTokenMaxTTL),
        accessTokenNumUsesLimit: Number(identityJwtAuth.accessTokenNumUsesLimit),
        accessTokenPeriod: Number(identityJwtAuth.accessTokenPeriod) || 0,
        accessTokenTrustedIps: identityJwtAuth.accessTokenTrustedIps as TIp[]
      });

      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        authAttemptCounter.add(1, {
          "infisical.identity.id": identityJwtAuth.identityId,
          "infisical.identity.name": identity.name,
          "infisical.organization.id": org.id,
          "infisical.organization.name": org.name,
          "infisical.identity.auth_method": AuthAttemptAuthMethod.JWT_AUTH,
          "infisical.identity.auth_result": AuthAttemptAuthResult.SUCCESS,
          "client.address": requestContext.get(RequestContextKey.Ip),
          "user_agent.original": requestContext.get(RequestContextKey.UserAgent)
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
          "client.address": requestContext.get(RequestContextKey.Ip),
          "user_agent.original": requestContext.get(RequestContextKey.UserAgent)
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

    if (configurationType === JwtConfigurationType.JWKS && jwksUrl) {
      await blockLocalAndPrivateIpAddresses(jwksUrl);
    }

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

    if (jwksUrl) {
      await blockLocalAndPrivateIpAddresses(jwksUrl);
    }

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

      const { shouldUseNewPrivilegeSystem } = await requestMemoize(
        requestMemoKeys.orgFindById(identityMembershipOrg.scopeOrgId),
        () => orgDAL.findById(identityMembershipOrg.scopeOrgId)
      );
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

    // Detaching the auth method must invalidate any tokens already issued
    // through it; without this, leaked tokens authenticate up to MAX_AGE
    // even after the admin pulled the auth method.
    await identityAccessTokenService.revokeAllTokensForIdentity(identityId);

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
