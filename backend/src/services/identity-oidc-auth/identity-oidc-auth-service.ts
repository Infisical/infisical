import { ForbiddenError } from "@casl/ability";
import axios from "axios";
import https from "https";
import jwt from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";

import { IdentityAuthMethod, TIdentityOidcAuthsUpdate } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TOrgDALFactory } from "../org/org-dal";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
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
import { getValueByDot } from "@app/lib/template/dot-access";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
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
  identityOidcAuthDAL: TIdentityOidcAuthDALFactory;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne" | "updateById">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create" | "delete">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
};

export type TIdentityOidcAuthServiceFactory = ReturnType<typeof identityOidcAuthServiceFactory>;

export const identityOidcAuthServiceFactory = ({
  identityOidcAuthDAL,
  identityOrgMembershipDAL,
  permissionService,
  licenseService,
  identityAccessTokenDAL,
  kmsService,
  orgDAL
}: TIdentityOidcAuthServiceFactoryDep) => {
  const login = async ({ identityId, jwt: oidcJwt }: TLoginOidcAuthDTO) => {
    const identityOidcAuth = await identityOidcAuthDAL.findOne({ identityId });
    if (!identityOidcAuth) {
      throw new NotFoundError({ message: "OIDC auth method not found for identity, did you configure OIDC auth?" });
    }

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({
      identityId: identityOidcAuth.identityId
    });
    if (!identityMembershipOrg) {
      throw new NotFoundError({
        message: `Identity organization membership for identity with ID '${identityOidcAuth.identityId}' not found`
      });
    }

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.orgId
    });

    let caCert = "";
    if (identityOidcAuth.encryptedCaCertificate) {
      caCert = decryptor({ cipherTextBlob: identityOidcAuth.encryptedCaCertificate }).toString();
    }

    const requestAgent = new https.Agent({ ca: caCert, rejectUnauthorized: !!caCert });
    const { data: discoveryDoc } = await axios.get<{ jwks_uri: string }>(
      `${identityOidcAuth.oidcDiscoveryUrl}/.well-known/openid-configuration`,
      {
        httpsAgent: identityOidcAuth.oidcDiscoveryUrl.includes("https") ? requestAgent : undefined
      }
    );
    const jwksUri = discoveryDoc.jwks_uri;

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

    const { kid } = decodedToken.header as { kid: string };
    const oidcSigningKey = await client.getSigningKey(kid);

    let tokenData: Record<string, string>;
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

    if (identityOidcAuth.boundSubject) {
      if (!doesFieldValueMatchOidcPolicy(tokenData.sub, identityOidcAuth.boundSubject)) {
        throw new ForbiddenRequestError({
          message: "Access denied: OIDC subject not allowed."
        });
      }
    }

    if (identityOidcAuth.boundAudiences) {
      if (
        !identityOidcAuth.boundAudiences
          .split(", ")
          .some((policyValue) => doesAudValueMatchOidcPolicy(tokenData.aud, policyValue))
      ) {
        throw new UnauthorizedError({
          message: "Access denied: OIDC audience not allowed."
        });
      }
    }

    if (identityOidcAuth.boundClaims) {
      Object.keys(identityOidcAuth.boundClaims).forEach((claimKey) => {
        const claimValue = (identityOidcAuth.boundClaims as Record<string, string>)[claimKey];
        const value = getValueByDot(tokenData, claimKey);

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
        const value = getValueByDot(tokenData, claimKey);
        if (!value) {
          throw new UnauthorizedError({
            message: `Access denied: token has no ${claimKey} field`
          });
        }
        filteredClaims[permissionKey] = value.toString();
      });
    }

    const identityAccessToken = await identityOidcAuthDAL.transaction(async (tx) => {
      await identityOrgMembershipDAL.updateById(
        identityMembershipOrg.id,
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
          authMethod: IdentityAuthMethod.OIDC_AUTH
        },
        tx
      );
      return newToken;
    });

    const appCfg = getConfig();
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

    return { accessToken, identityOidcAuth, identityAccessToken, identityMembershipOrg, oidcTokenData: tokenData };
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
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) {
      if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    }
    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.OIDC_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add OIDC Auth to already configured identity"
      });
    }

    if (accessTokenMaxTTL > 0 && accessTokenTTL > accessTokenMaxTTL) {
      throw new BadRequestError({ message: "Access token TTL cannot be greater than max TTL" });
    }

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Create, OrgPermissionSubjects.Identity);

    const plan = await licenseService.getPlan(identityMembershipOrg.orgId);
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

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.orgId
    });

    const identityOidcAuth = await identityOidcAuthDAL.transaction(async (tx) => {
      const doc = await identityOidcAuthDAL.create(
        {
          identityId: identityMembershipOrg.identityId,
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
    return { ...identityOidcAuth, orgId: identityMembershipOrg.orgId, caCert };
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
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

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

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);

    const plan = await licenseService.getPlan(identityMembershipOrg.orgId);
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
      orgId: identityMembershipOrg.orgId
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
      orgId: identityMembershipOrg.orgId,
      caCert: updatedCACert
    };
  };

  const getOidcAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetOidcAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.OIDC_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have OIDC Auth attached"
      });
    }

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);

    const identityOidcAuth = await identityOidcAuthDAL.findOne({ identityId });

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.orgId
    });

    const caCert = identityOidcAuth.encryptedCaCertificate
      ? decryptor({ cipherTextBlob: identityOidcAuth.encryptedCaCertificate }).toString()
      : "";

    return { ...identityOidcAuth, orgId: identityMembershipOrg.orgId, caCert };
  };

  const revokeOidcAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TRevokeOidcAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) {
      throw new NotFoundError({ message: "Failed to find identity" });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.OIDC_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have OIDC auth"
      });
    }

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);

    const { permission: rolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      identityMembershipOrg.identityId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );

    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(identityMembershipOrg.orgId);
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

    const revokedIdentityOidcAuth = await identityOidcAuthDAL.transaction(async (tx) => {
      const deletedOidcAuth = await identityOidcAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({ identityId, authMethod: IdentityAuthMethod.OIDC_AUTH }, tx);

      return { ...deletedOidcAuth?.[0], orgId: identityMembershipOrg.orgId };
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
