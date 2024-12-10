import { ForbiddenError } from "@casl/ability";

import { IdentityAuthMethod, TIdentityJwtAuthsUpdate } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";

import { ActorType } from "../auth/auth-type";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TIdentityJwtAuthDALFactory } from "./identity-jwt-auth-dal";
import { TAttachJwtAuthDTO, TGetJwtAuthDTO, TRevokeJwtAuthDTO, TUpdateJwtAuthDTO } from "./identity-jwt-auth-types";

type TIdentityJwtAuthServiceFactoryDep = {
  identityJwtAuthDAL: TIdentityJwtAuthDALFactory;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create" | "delete">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TIdentityJwtAuthServiceFactory = ReturnType<typeof identityJwtAuthServiceFactory>;

export const identityJwtAuthServiceFactory = ({
  identityJwtAuthDAL,
  identityOrgMembershipDAL,
  permissionService,
  licenseService,
  identityAccessTokenDAL,
  kmsService
}: TIdentityJwtAuthServiceFactoryDep) => {
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
    actorOrgId
  }: TAttachJwtAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) {
      if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    }
    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.JWT_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add JWT Auth to already configured identity"
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

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Identity);

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
          identityId: identityMembershipOrg.identityId,
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
    return { ...identityJwtAuth, orgId: identityMembershipOrg.orgId, jwksCaCert, publicKeys };
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
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

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

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Identity);

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

    if (jwksCaCert) {
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
      orgId: identityMembershipOrg.orgId,
      jwksCaCert: decryptedJwksCaCert,
      publicKeys: decryptedPublicKeys
    };
  };

  const getJwtAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetJwtAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.JWT_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have JWT Auth attached"
      });
    }

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Identity);

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
      orgId: identityMembershipOrg.orgId,
      jwksCaCert: decryptedJwksCaCert,
      publicKeys: decryptedPublicKeys
    };
  };

  const revokeJwtAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TRevokeJwtAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) {
      throw new NotFoundError({ message: "Failed to find identity" });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.JWT_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have JWT auth"
      });
    }

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Identity);

    const { permission: rolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      identityMembershipOrg.identityId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );

    if (!isAtLeastAsPrivileged(permission, rolePermission)) {
      throw new ForbiddenRequestError({
        message: "Failed to revoke JWT auth of identity with more privileged role"
      });
    }

    const revokedIdentityJwtAuth = await identityJwtAuthDAL.transaction(async (tx) => {
      const deletedJwtAuth = await identityJwtAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({ identityId, authMethod: IdentityAuthMethod.JWT_AUTH }, tx);

      return { ...deletedJwtAuth?.[0], orgId: identityMembershipOrg.orgId };
    });

    return revokedIdentityJwtAuth;
  };

  return {
    attachJwtAuth,
    updateJwtAuth,
    getJwtAuth,
    revokeJwtAuth
  };
};
