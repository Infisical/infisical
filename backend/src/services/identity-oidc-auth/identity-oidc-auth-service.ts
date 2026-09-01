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
  TIdentityOidcAuthsUpdate
} from "@app/db/schemas";
import { TIdentityAuthTemplates } from "@app/db/schemas/identity-auth-templates";
import { TIdentityAuthTemplateDALFactory } from "@app/ee/services/identity-auth-template/identity-auth-template-dal";
import { IdentityAuthTemplateMethod } from "@app/ee/services/identity-auth-template/identity-auth-template-enums";
import { TOidcTemplateFields } from "@app/ee/services/identity-auth-template/identity-auth-template-types";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import {
  OrgPermissionIdentityActions,
  OrgPermissionMachineIdentityAuthTemplateActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto";
import {
  BadRequestError,
  ForbiddenRequestError,
  NotFoundError,
  PermissionBoundaryError,
  UnauthorizedError
} from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr, TIp } from "@app/lib/ip";
import { logger } from "@app/lib/logger";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import {
  AuthAttemptAuthMethod,
  AuthAttemptAuthResult,
  authAttemptCounter,
  recordAuthAttemptMetric
} from "@app/lib/telemetry/metrics";
import { getValueByDot } from "@app/lib/template/dot-access";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

import { ActorType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenServiceFactory } from "../identity-access-token/identity-access-token-service";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { recordIdentityLastLoginDebounced } from "../membership-identity/membership-identity-fns";
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
  identityAuthTemplateDAL: Pick<TIdentityAuthTemplateDALFactory, "findByIdAndOrgId">;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "findOne" | "update" | "getIdentityById">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiryNX">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "delete">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findOne" | "findEffectiveOrgMembership">;
  identityAccessTokenService: Pick<
    TIdentityAccessTokenServiceFactory,
    "issueIdentityAccessToken" | "revokeTokensForIdentityAuthMethod" | "invalidateTrustedIpsCache"
  >;
};

export type TIdentityOidcAuthServiceFactory = ReturnType<typeof identityOidcAuthServiceFactory>;

export const identityOidcAuthServiceFactory = ({
  identityDAL,
  identityOidcAuthDAL,
  identityAuthTemplateDAL,
  membershipIdentityDAL,
  keyStore,
  permissionService,
  licenseService,
  identityAccessTokenDAL,
  kmsService,
  orgDAL,
  identityAccessTokenService
}: TIdentityOidcAuthServiceFactoryDep) => {
  const login = async ({ identityId, jwt: oidcJwt, organizationSlug }: TLoginOidcAuthDTO) => {
    const authMetricStartTime = performance.now();
    const appCfg = getConfig();
    const identityOidcAuth = await identityOidcAuthDAL.findOne({ identityId });
    if (!identityOidcAuth) {
      throw new NotFoundError({ message: "OIDC auth method not found for identity, did you configure OIDC auth?" });
    }

    const identity = await requestMemoize(requestMemoKeys.identityFindById(identityOidcAuth.identityId), () =>
      identityDAL.findById(identityOidcAuth.identityId)
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
      const { decryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.Organization,
        orgId: identity.orgId
      });

      let caCert = "";
      if (identityOidcAuth.encryptedCaCertificate) {
        caCert = decryptor({ cipherTextBlob: identityOidcAuth.encryptedCaCertificate }).toString();
      }

      const requestAgent = caCert ? new https.Agent({ ca: caCert, rejectUnauthorized: true }) : undefined;

      await blockLocalAndPrivateIpAddresses(identityOidcAuth.oidcDiscoveryUrl);

      let discoveryDoc: { jwks_uri: string };
      try {
        const response = await request.get<{ jwks_uri: string }>(
          `${identityOidcAuth.oidcDiscoveryUrl}/.well-known/openid-configuration`,
          {
            httpsAgent: identityOidcAuth.oidcDiscoveryUrl.includes("https") ? requestAgent : undefined
          }
        );
        discoveryDoc = response.data;
      } catch (error) {
        logger.error(
          {
            error,
            errorName: error instanceof Error ? error.name : undefined,
            errorMessage: error instanceof Error ? error.message : String(error),
            errorCode: (error as NodeJS.ErrnoException)?.code,
            errorCause: (error as Error)?.cause,
            identityId: identity.id,
            discoveryUrl: identityOidcAuth.oidcDiscoveryUrl
          },
          `OIDC discovery document fetch failed [identityId=${identity.id}]`
        );
        throw new UnauthorizedError({
          message: `Access denied: Failed to fetch OIDC discovery document from ${identityOidcAuth.oidcDiscoveryUrl}. ${error instanceof Error ? error.message : String(error)}`,
          detail: {
            reasonCode: "discovery_document_fetch_failed",
            identityId: identity.id,
            orgId: identity.orgId,
            identityName: identity.name
          }
        });
      }

      const jwksUri = discoveryDoc.jwks_uri;
      if (!jwksUri) {
        throw new UnauthorizedError({
          message: `Access denied: OIDC discovery document does not contain a jwks_uri. The identity provider may be misconfigured.`,
          detail: {
            reasonCode: "missing_jwks_uri",
            identityId: identity.id,
            orgId: identity.orgId,
            identityName: identity.name
          }
        });
      }

      await blockLocalAndPrivateIpAddresses(jwksUri);

      const decodedToken = crypto.jwt().decode(oidcJwt, { complete: true });
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
          logger.error(
            {
              error,
              errorName: error instanceof Error ? error.name : undefined,
              errorMessage: error instanceof Error ? error.message : String(error),
              errorCode: (error as NodeJS.ErrnoException)?.code,
              errorCause: (error as Error)?.cause,
              identityId: identity.id,
              jwksUri,
              kid
            },
            `OIDC signing key retrieval failed [identityId=${identity.id}] [kid=${kid}]`
          );
          if (error instanceof Error && error.name === "SigningKeyNotFoundError") {
            throw new UnauthorizedError({
              message: `Access denied: Unable to verify JWT signature. The signing key '${kid}' was not found in the OIDC provider's JWKS endpoint. This may indicate an invalid token or misconfigured OIDC provider.`,
              detail: {
                reasonCode: "signing_key_not_found",
                identityId: identity.id,
                orgId: identity.orgId,
                identityName: identity.name
              }
            });
          }
          throw new UnauthorizedError({
            message: `Access denied: Failed to retrieve signing key from OIDC provider: ${error instanceof Error ? error.message : String(error)}`,
            detail: {
              reasonCode: "signing_key_retrieval_failed",
              identityId: identity.id,
              orgId: identity.orgId,
              identityName: identity.name
            }
          });
        }

        try {
          tokenData = crypto.jwt().verify(oidcJwt, oidcSigningKey.getPublicKey(), {
            issuer: identityOidcAuth.boundIssuer
          }) as Record<string, string>;
        } catch (error) {
          logger.error(
            {
              error,
              errorName: error instanceof Error ? error.name : undefined,
              errorMessage: error instanceof Error ? error.message : String(error),
              identityId: identity.id,
              boundIssuer: identityOidcAuth.boundIssuer,
              kid
            },
            `OIDC JWT verification failed [identityId=${identity.id}] [kid=${kid}]`
          );
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
        // If kid is not provided, try all available signing keys
        logger.warn(
          `OIDC login without KID header [identityId=${identityOidcAuth.identityId}] [orgId=${org.id}] [ip=${requestContext.get(RequestContextKey.Ip)}]`
        );

        let allSigningKeys;
        try {
          allSigningKeys = await client.getSigningKeys();
        } catch (error) {
          logger.error(
            {
              error,
              errorName: error instanceof Error ? error.name : undefined,
              errorMessage: error instanceof Error ? error.message : String(error),
              errorCode: (error as NodeJS.ErrnoException)?.code,
              errorCause: (error as Error)?.cause,
              identityId: identity.id,
              jwksUri
            },
            `OIDC signing keys retrieval failed [identityId=${identity.id}]`
          );
          throw new UnauthorizedError({
            message: `Access denied: Failed to retrieve signing keys from OIDC provider: ${error instanceof Error ? error.message : String(error)}`,
            detail: {
              reasonCode: "signing_keys_retrieval_failed",
              identityId: identity.id,
              orgId: identity.orgId,
              identityName: identity.name
            }
          });
        }

        if (!allSigningKeys || allSigningKeys.length === 0) {
          throw new UnauthorizedError({
            message: "Access denied: No signing keys available from OIDC provider's JWKS endpoint.",
            detail: {
              reasonCode: "no_signing_keys",
              identityId: identity.id,
              orgId: identity.orgId,
              identityName: identity.name
            }
          });
        }

        // Limit the number of keys to try to prevent abuse
        const MAX_KEYS_TO_TRY = 10;
        if (allSigningKeys.length > MAX_KEYS_TO_TRY) {
          throw new UnauthorizedError({
            message: `Access denied: OIDC provider has ${allSigningKeys.length} signing keys. Tokens must include 'kid' header when provider has more than ${MAX_KEYS_TO_TRY} keys.`,
            detail: {
              reasonCode: "too_many_signing_keys",
              identityId: identity.id,
              orgId: identity.orgId,
              identityName: identity.name
            }
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
          logger.error(
            {
              error: lastError,
              errorName: lastError?.name,
              errorMessage: lastError?.message,
              identityId: identity.id,
              boundIssuer: identityOidcAuth.boundIssuer,
              signingKeysCount: allSigningKeys.length
            },
            `OIDC JWT verification failed with all signing keys [identityId=${identity.id}]`
          );
          throw new UnauthorizedError({
            message: `Access denied: Unable to verify JWT signature with any available signing key. ${lastError ? lastError.message : "Invalid token"}`,
            detail: {
              reasonCode: "jwt_verification_failed",
              identityId: identity.id,
              orgId: identity.orgId,
              identityName: identity.name
            }
          });
        }
      }

      // Ensure tokenData was successfully assigned
      if (!tokenData) {
        throw new UnauthorizedError({
          message: "Access denied: Failed to verify JWT token",
          detail: {
            reasonCode: "jwt_verification_failed",
            identityId: identity.id,
            orgId: identity.orgId,
            identityName: identity.name
          }
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
            message: "Access denied: OIDC audience not allowed.",
            detail: {
              reasonCode: "audience_not_allowed",
              identityId: identity.id,
              orgId: identity.orgId,
              identityName: identity.name
            }
          });
        }
      }

      if (identityOidcAuth.boundClaims) {
        Object.keys(identityOidcAuth.boundClaims).forEach((claimKey) => {
          const claimValue = (identityOidcAuth.boundClaims as Record<string, string>)[claimKey];
          const value = getValueByDot(verifiedTokenData, claimKey);

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
          if (!claimValue.split(", ").some((claimEntry) => doesFieldValueMatchOidcPolicy(value, claimEntry))) {
            throw new UnauthorizedError({
              message: "Access denied: OIDC claim not allowed.",
              detail: {
                reasonCode: "claim_not_allowed",
                identityId: identity.id,
                orgId: identity.orgId,
                identityName: identity.name
              }
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
              message: `Access denied: token has no ${claimKey} field`,
              detail: {
                reasonCode: "missing_metadata_claim",
                identityId: identity.id,
                orgId: identity.orgId,
                identityName: identity.name
              }
            });
          }
          filteredClaims[permissionKey] = value.toString();
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

      await recordIdentityLastLoginDebounced({
        keyStore,
        membershipIdentityDAL,
        identity,
        lastLoginAuthMethod: IdentityAuthMethod.OIDC_AUTH
      });

      const subOrgDetails =
        subOrganizationId && subOrganizationId !== org.id ? await orgDAL.findById(subOrganizationId) : null;
      const tokenScopeOrg = subOrgDetails ?? org;
      const tokenRootOrgId = tokenScopeOrg.rootOrgId ?? tokenScopeOrg.id;
      const tokenParentOrgId = tokenScopeOrg.parentOrgId ?? tokenRootOrgId;

      const { accessToken, identityAccessToken } = await identityAccessTokenService.issueIdentityAccessToken({
        identityId: identityOidcAuth.identityId,
        identityName: identity.name,
        authMethod: IdentityAuthMethod.OIDC_AUTH,
        orgId: tokenScopeOrg.id,
        rootOrgId: tokenRootOrgId,
        parentOrgId: tokenParentOrgId,
        subOrganizationId,
        accessTokenTTL: Number(identityOidcAuth.accessTokenTTL),
        accessTokenMaxTTL: Number(identityOidcAuth.accessTokenMaxTTL),
        accessTokenNumUsesLimit: Number(identityOidcAuth.accessTokenNumUsesLimit),
        accessTokenPeriod: Number(identityOidcAuth.accessTokenPeriod) || 0,
        accessTokenTrustedIps: identityOidcAuth.accessTokenTrustedIps as TIp[],
        identityAuth: {
          oidc: {
            claims: filteredClaims
          }
        }
      });

      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        authAttemptCounter.add(1, {
          "infisical.identity.id": identityOidcAuth.identityId,
          "infisical.identity.name": identity.name,
          "infisical.organization.id": org.id,
          "infisical.organization.name": org.name,
          "infisical.identity.auth_method": AuthAttemptAuthMethod.OIDC_AUTH,
          "infisical.identity.auth_result": AuthAttemptAuthResult.SUCCESS,
          "client.address": requestContext.get(RequestContextKey.Ip),
          "user_agent.original": requestContext.get(RequestContextKey.UserAgent)
        });
      }

      recordAuthAttemptMetric({
        startTime: authMetricStartTime,
        method: AuthAttemptAuthMethod.OIDC_AUTH,
        result: AuthAttemptAuthResult.SUCCESS,
        orgId: org.id
      });

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
          "client.address": requestContext.get(RequestContextKey.Ip),
          "user_agent.original": requestContext.get(RequestContextKey.UserAgent)
        });
      }

      recordAuthAttemptMetric({
        startTime: authMetricStartTime,
        method: AuthAttemptAuthMethod.OIDC_AUTH,
        result: AuthAttemptAuthResult.FAILURE,
        orgId: org.id,
        error
      });
      throw error;
    }
  };

  const attachOidcAuth = async (dto: TAttachOidcAuthDTO) => {
    const {
      identityId,
      templateId,
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
    } = dto;
    // the route leaves these optional (no zod default) so template-managed values can be
    // detected and rejected when a template is used; defaulted below for the custom path
    let { oidcDiscoveryUrl, caCert, boundIssuer, boundAudiences } = dto;
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
        ProjectPermissionIdentityActions.EditAuth,
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
        OrgPermissionIdentityActions.EditAuth,
        OrgPermissionSubjects.Identity
      );
    }

    await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);

    const plan = await licenseService.getPlan(identityMembershipOrg.scopeOrgId);
    const { encryptor, decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.scopeOrgId
    });

    let template: TIdentityAuthTemplates | undefined;
    if (templateId) {
      if (!plan.machineIdentityAuthTemplates) {
        throw new BadRequestError({
          message:
            "Failed to use identity auth template due to plan restriction. Upgrade plan to access machine identity auth templates."
        });
      }

      const { permission: orgPermission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionMachineIdentityAuthTemplateActions.AttachTemplates,
        OrgPermissionSubjects.MachineIdentityAuthTemplate
      );

      template = await identityAuthTemplateDAL.findByIdAndOrgId(templateId, identityMembershipOrg.scopeOrgId);
      if (!template || template.authMethod !== IdentityAuthTemplateMethod.OIDC) {
        throw new NotFoundError({ message: `OIDC auth template with ID '${templateId}' not found` });
      }

      const templateFields = JSON.parse(
        decryptor({ cipherTextBlob: template.templateFields }).toString()
      ) as TOidcTemplateFields;

      oidcDiscoveryUrl = templateFields.oidcDiscoveryUrl;
      boundIssuer = templateFields.boundIssuer;
      boundAudiences = templateFields.boundAudiences ?? "";
      caCert = templateFields.caCert || "";

      // a template's bindings identify the issuer, not a workload; with no per-identity
      // binding, any token that issuer signs (e.g. any workflow in the org) could log in
      // as this identity, so require the caller to scope it
      if (!boundSubject && Object.keys(boundClaims).length === 0) {
        throw new BadRequestError({
          message:
            "When using an auth template, set a subject or at least one claim binding to restrict which workloads can authenticate as this identity."
        });
      }
    }

    if (!oidcDiscoveryUrl || !boundIssuer) {
      throw new BadRequestError({
        message: "OIDC discovery URL and issuer are required when not using an auth template."
      });
    }
    // consts so the narrowing survives into the transaction closure below
    const resolvedOidcDiscoveryUrl = oidcDiscoveryUrl;
    const resolvedBoundIssuer = boundIssuer;
    const resolvedCaCert = caCert ?? "";
    const resolvedBoundAudiences = boundAudiences ?? "";

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

    await blockLocalAndPrivateIpAddresses(resolvedOidcDiscoveryUrl);

    const identityOidcAuth = await identityOidcAuthDAL.transaction(async (tx) => {
      const doc = await identityOidcAuthDAL.create(
        {
          identityId: identityMembershipOrg.identity.id,
          templateId: template?.id ?? null,
          oidcDiscoveryUrl: resolvedOidcDiscoveryUrl,
          encryptedCaCertificate: encryptor({ plainText: Buffer.from(resolvedCaCert) }).cipherTextBlob,
          boundIssuer: resolvedBoundIssuer,
          boundAudiences: resolvedBoundAudiences,
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
    await identityAccessTokenService.invalidateTrustedIpsCache(identityId, IdentityAuthMethod.OIDC_AUTH);
    return { ...identityOidcAuth, orgId: identityMembershipOrg.scopeOrgId, caCert: resolvedCaCert };
  };

  const updateOidcAuth = async (dto: TUpdateOidcAuthDTO) => {
    const {
      identityId,
      templateId,
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
    } = dto;
    let { oidcDiscoveryUrl, caCert, boundIssuer, boundAudiences } = dto;
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
        ProjectPermissionIdentityActions.EditAuth,
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
        OrgPermissionIdentityActions.EditAuth,
        OrgPermissionSubjects.Identity
      );
    }

    await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);

    const plan = await licenseService.getPlan(identityMembershipOrg.scopeOrgId);
    const { encryptor, decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.scopeOrgId
    });

    let template: TIdentityAuthTemplates | undefined;
    // the UI re-sends the current templateId on every save of a linked identity, so only a
    // link CHANGE requires the attach-template permission; a re-assert must stay editable
    // for actors that hold identity EditAuth alone
    if (templateId && templateId !== identityOidcAuth.templateId) {
      if (!plan.machineIdentityAuthTemplates) {
        throw new BadRequestError({
          message:
            "Failed to use identity auth template due to plan restriction. Upgrade plan to access machine identity auth templates."
        });
      }

      const { permission: orgPermission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionMachineIdentityAuthTemplateActions.AttachTemplates,
        OrgPermissionSubjects.MachineIdentityAuthTemplate
      );

      template = await identityAuthTemplateDAL.findByIdAndOrgId(templateId, identityMembershipOrg.scopeOrgId);
      if (!template || template.authMethod !== IdentityAuthTemplateMethod.OIDC) {
        throw new NotFoundError({ message: `OIDC auth template with ID '${templateId}' not found` });
      }

      const templateFields = JSON.parse(
        decryptor({ cipherTextBlob: template.templateFields }).toString()
      ) as TOidcTemplateFields;

      oidcDiscoveryUrl = templateFields.oidcDiscoveryUrl;
      boundIssuer = templateFields.boundIssuer;
      boundAudiences = templateFields.boundAudiences ?? "";
      caCert = templateFields.caCert ?? "";
    } else if (templateId === undefined && identityOidcAuth.templateId) {
      const hasTemplateManagedFieldChanges =
        oidcDiscoveryUrl !== undefined ||
        boundIssuer !== undefined ||
        boundAudiences !== undefined ||
        caCert !== undefined;
      if (hasTemplateManagedFieldChanges) {
        throw new BadRequestError({
          message:
            "This identity's OIDC identity provider settings are managed by an auth template. Update the template to change them, or unlink the template by setting templateId to null."
        });
      }
    }

    // a linked identity must always carry its own principal binding (see attach); this
    // also covers linking a template onto an identity whose bindings are empty, and a
    // linked identity clearing them, since the template supplies no binding of its own
    const templateIdAfterUpdate = templateId === undefined ? identityOidcAuth.templateId : templateId;
    if (templateIdAfterUpdate) {
      const effectiveBoundSubject = boundSubject !== undefined ? boundSubject : (identityOidcAuth.boundSubject ?? "");
      const effectiveBoundClaims =
        boundClaims !== undefined ? boundClaims : ((identityOidcAuth.boundClaims ?? {}) as Record<string, string>);
      if (!effectiveBoundSubject && Object.keys(effectiveBoundClaims).length === 0) {
        throw new BadRequestError({
          message:
            "When using an auth template, set a subject or at least one claim binding to restrict which workloads can authenticate as this identity."
        });
      }
    }

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

    if (oidcDiscoveryUrl) {
      await blockLocalAndPrivateIpAddresses(oidcDiscoveryUrl);
    }

    const updateQuery: TIdentityOidcAuthsUpdate = {
      oidcDiscoveryUrl,
      boundIssuer,
      boundAudiences,
      boundClaims,
      claimMetadataMapping,
      boundSubject,
      // tri-state passthrough: undefined keeps the current link, null unlinks, a uuid links
      // (a re-assert of the current id skips the template load above, so template is unset)
      templateId,
      accessTokenMaxTTL,
      accessTokenTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps: reformattedAccessTokenTrustedIps
        ? JSON.stringify(reformattedAccessTokenTrustedIps)
        : undefined
    };

    if (caCert !== undefined) {
      updateQuery.encryptedCaCertificate = encryptor({ plainText: Buffer.from(caCert) }).cipherTextBlob;
    }

    const updatedOidcAuth = await identityOidcAuthDAL.updateById(identityOidcAuth.id, updateQuery);
    const updatedCACert = updatedOidcAuth.encryptedCaCertificate
      ? decryptor({ cipherTextBlob: updatedOidcAuth.encryptedCaCertificate }).toString()
      : "";

    await identityAccessTokenService.invalidateTrustedIpsCache(identityId, IdentityAuthMethod.OIDC_AUTH);
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

  const revokeOidcAuth = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    isActorSuperAdmin
  }: TRevokeOidcAuthDTO) => {
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
            "Failed to revoke oidc auth of identity with more privileged role",
            shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.RevokeAuth,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }

    await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);

    const revokedIdentityOidcAuth = await identityOidcAuthDAL.transaction(async (tx) => {
      const deletedOidcAuth = await identityOidcAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({ identityId, authMethod: IdentityAuthMethod.OIDC_AUTH }, tx);

      return { ...deletedOidcAuth?.[0], orgId: identityMembershipOrg.scopeOrgId };
    });

    // Detaching the auth method must invalidate any tokens already issued
    // through it; without this, leaked tokens authenticate up to MAX_AGE
    // even after the admin pulled the auth method.
    await identityAccessTokenService.revokeTokensForIdentityAuthMethod({
      identityId,
      authMethod: IdentityAuthMethod.OIDC_AUTH
    });
    await identityAccessTokenService.invalidateTrustedIpsCache(identityId, IdentityAuthMethod.OIDC_AUTH);

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
