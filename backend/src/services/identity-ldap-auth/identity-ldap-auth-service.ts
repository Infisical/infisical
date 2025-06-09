/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ForbiddenError } from "@casl/ability";
import jwt from "jsonwebtoken";

import { IdentityAuthMethod } from "@app/db/schemas";
import { testLDAPConfig } from "@app/ee/services/ldap-config/ldap-fns";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError, PermissionBoundaryError } from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { validateIdentityUpdateForSuperAdminPrivileges } from "../super-admin/super-admin-fns";
import { TIdentityLdapAuthDALFactory } from "./identity-ldap-auth-dal";
import {
  AllowedFieldsSchema,
  TAttachLdapAuthDTO,
  TGetLdapAuthDTO,
  TLoginLdapAuthDTO,
  TRevokeLdapAuthDTO,
  TUpdateLdapAuthDTO
} from "./identity-ldap-auth-types";

type TIdentityLdapAuthServiceFactoryDep = {
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create" | "delete">;
  identityLdapAuthDAL: Pick<
    TIdentityLdapAuthDALFactory,
    "findOne" | "transaction" | "create" | "updateById" | "delete"
  >;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  kmsService: TKmsServiceFactory;
  identityDAL: TIdentityDALFactory;
};

export type TIdentityLdapAuthServiceFactory = ReturnType<typeof identityLdapAuthServiceFactory>;

export const identityLdapAuthServiceFactory = ({
  identityAccessTokenDAL,
  identityDAL,
  identityLdapAuthDAL,
  identityOrgMembershipDAL,
  licenseService,
  permissionService,
  kmsService
}: TIdentityLdapAuthServiceFactoryDep) => {
  const getLdapConfig = async (identityId: string) => {
    const identity = await identityDAL.findOne({ id: identityId });
    if (!identity) throw new NotFoundError({ message: `Identity with ID '${identityId}' not found` });

    const identityOrgMembership = await identityOrgMembershipDAL.findOne({ identityId: identity.id });
    if (!identityOrgMembership) throw new NotFoundError({ message: `Identity with ID '${identityId}' not found` });

    const ldapAuth = await identityLdapAuthDAL.findOne({ identityId: identity.id });
    if (!ldapAuth) throw new NotFoundError({ message: `LDAP auth with ID '${identityId}' not found` });

    const parsedAllowedFields = ldapAuth.allowedFields
      ? AllowedFieldsSchema.array().parse(ldapAuth.allowedFields)
      : undefined;

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityOrgMembership.orgId
    });

    const bindDN = decryptor({ cipherTextBlob: ldapAuth.encryptedBindDN }).toString();
    const bindPass = decryptor({ cipherTextBlob: ldapAuth.encryptedBindPass }).toString();
    const ldapCaCertificate = ldapAuth.encryptedLdapCaCertificate
      ? decryptor({ cipherTextBlob: ldapAuth.encryptedLdapCaCertificate }).toString()
      : undefined;

    const ldapConfig = {
      id: ldapAuth.id,
      organization: identityOrgMembership.orgId,
      url: ldapAuth.url,
      bindDN,
      bindPass,
      searchBase: ldapAuth.searchBase,
      searchFilter: ldapAuth.searchFilter,
      caCert: ldapCaCertificate || "",
      allowedFields: parsedAllowedFields
    };

    const opts = {
      server: {
        url: ldapAuth.url,
        bindDN,
        bindCredentials: bindPass,
        searchBase: ldapAuth.searchBase,
        searchFilter: ldapAuth.searchFilter,
        ...(ldapCaCertificate
          ? {
              tlsOptions: {
                ca: [ldapCaCertificate]
              }
            }
          : {})
      },
      passReqToCallback: true
    };

    return { opts, ldapConfig };
  };

  const login = async ({ identityId }: TLoginLdapAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });

    if (!identityMembershipOrg) {
      throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    }

    const identityLdapAuth = await identityLdapAuthDAL.findOne({ identityId });

    if (!identityLdapAuth) {
      throw new NotFoundError({ message: `Failed to find LDAP auth for identity with ID ${identityId}` });
    }

    const plan = await licenseService.getPlan(identityMembershipOrg.orgId);
    if (!plan.ldap) {
      throw new BadRequestError({
        message:
          "Failed to login to identity due to plan restriction. Upgrade plan to login to use LDAP authentication."
      });
    }

    const identityAccessToken = await identityLdapAuthDAL.transaction(async (tx) => {
      const newToken = await identityAccessTokenDAL.create(
        {
          identityId: identityLdapAuth.identityId,
          isAccessTokenRevoked: false,
          accessTokenTTL: identityLdapAuth.accessTokenTTL,
          accessTokenMaxTTL: identityLdapAuth.accessTokenMaxTTL,
          accessTokenNumUses: 0,
          accessTokenNumUsesLimit: identityLdapAuth.accessTokenNumUsesLimit,
          authMethod: IdentityAuthMethod.LDAP_AUTH
        },
        tx
      );
      return newToken;
    });

    const appCfg = getConfig();
    const accessToken = jwt.sign(
      {
        identityId: identityLdapAuth.identityId,
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

    return { accessToken, identityLdapAuth, identityAccessToken, identityMembershipOrg };
  };

  const attachLdapAuth = async ({
    identityId,
    url,
    searchBase,
    searchFilter,
    bindDN,
    bindPass,
    ldapCaCertificate,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    isActorSuperAdmin,
    allowedFields
  }: TAttachLdapAuthDTO) => {
    await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.LDAP_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add LDAP Auth to already configured identity"
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

    if (!plan.ldap) {
      throw new BadRequestError({
        message: "Failed to add LDAP Auth to identity due to plan restriction. Upgrade plan to add LDAP Auth."
      });
    }

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

    if (allowedFields) AllowedFieldsSchema.array().parse(allowedFields);

    const identityLdapAuth = await identityLdapAuthDAL.transaction(async (tx) => {
      const { encryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.Organization,
        orgId: identityMembershipOrg.orgId
      });

      const { cipherTextBlob: encryptedBindPass } = encryptor({
        plainText: Buffer.from(bindPass)
      });

      let encryptedLdapCaCertificate: Buffer | undefined;
      if (ldapCaCertificate) {
        const { cipherTextBlob: encryptedCertificate } = encryptor({
          plainText: Buffer.from(ldapCaCertificate)
        });

        encryptedLdapCaCertificate = encryptedCertificate;
      }

      const { cipherTextBlob: encryptedBindDN } = encryptor({
        plainText: Buffer.from(bindDN)
      });

      const isConnected = await testLDAPConfig({
        bindDN,
        bindPass,
        caCert: ldapCaCertificate || "",
        url
      });

      if (!isConnected) {
        throw new BadRequestError({
          message:
            "Failed to connect to LDAP server. Please ensure that the LDAP server is running and your credentials are correct."
        });
      }

      const doc = await identityLdapAuthDAL.create(
        {
          identityId: identityMembershipOrg.identityId,
          encryptedBindDN,
          encryptedBindPass,
          searchBase,
          searchFilter,
          url,
          encryptedLdapCaCertificate,
          accessTokenMaxTTL,
          accessTokenTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps: JSON.stringify(reformattedAccessTokenTrustedIps),
          allowedFields: allowedFields ? JSON.stringify(allowedFields) : undefined
        },
        tx
      );
      return doc;
    });
    return { ...identityLdapAuth, orgId: identityMembershipOrg.orgId };
  };

  const updateLdapAuth = async ({
    identityId,
    url,
    searchBase,
    searchFilter,
    bindDN,
    bindPass,
    ldapCaCertificate,
    allowedFields,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateLdapAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.LDAP_AUTH)) {
      throw new NotFoundError({
        message: "The identity does not have LDAP Auth attached"
      });
    }

    const identityLdapAuth = await identityLdapAuthDAL.findOne({ identityId });

    if (
      (accessTokenMaxTTL || identityLdapAuth.accessTokenMaxTTL) > 0 &&
      (accessTokenTTL || identityLdapAuth.accessTokenTTL) > (accessTokenMaxTTL || identityLdapAuth.accessTokenMaxTTL)
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

    if (!plan.ldap) {
      throw new BadRequestError({
        message: "Failed to update LDAP Auth due to plan restriction. Upgrade plan to update LDAP Auth."
      });
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

    if (allowedFields) AllowedFieldsSchema.array().parse(allowedFields);

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.orgId
    });

    let encryptedBindPass: Buffer | undefined;
    if (bindPass) {
      const { cipherTextBlob: bindPassCiphertext } = encryptor({
        plainText: Buffer.from(bindPass)
      });

      encryptedBindPass = bindPassCiphertext;
    }

    let encryptedLdapCaCertificate: Buffer | undefined;
    if (ldapCaCertificate) {
      const { cipherTextBlob: ldapCaCertificateCiphertext } = encryptor({
        plainText: Buffer.from(ldapCaCertificate)
      });

      encryptedLdapCaCertificate = ldapCaCertificateCiphertext;
    }

    let encryptedBindDN: Buffer | undefined;
    if (bindDN) {
      const { cipherTextBlob: bindDNCiphertext } = encryptor({
        plainText: Buffer.from(bindDN)
      });

      encryptedBindDN = bindDNCiphertext;
    }

    const { ldapConfig } = await getLdapConfig(identityId);

    const isConnected = await testLDAPConfig({
      bindDN: bindDN || ldapConfig.bindDN,
      bindPass: bindPass || ldapConfig.bindPass,
      caCert: ldapCaCertificate || ldapConfig.caCert,
      url: url || ldapConfig.url
    });

    if (!isConnected) {
      throw new BadRequestError({
        message:
          "Failed to connect to LDAP server. Please ensure that the LDAP server is running and your credentials are correct."
      });
    }

    const updatedLdapAuth = await identityLdapAuthDAL.updateById(identityLdapAuth.id, {
      url,
      searchBase,
      searchFilter,
      encryptedBindDN,
      encryptedBindPass,
      encryptedLdapCaCertificate,
      allowedFields: allowedFields ? JSON.stringify(allowedFields) : undefined,
      accessTokenMaxTTL,
      accessTokenTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps: reformattedAccessTokenTrustedIps
        ? JSON.stringify(reformattedAccessTokenTrustedIps)
        : undefined
    });

    return { ...updatedLdapAuth, orgId: identityMembershipOrg.orgId };
  };

  const getLdapAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetLdapAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.LDAP_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have LDAP Auth attached"
      });
    }

    const ldapIdentityAuth = await identityLdapAuthDAL.findOne({ identityId });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.orgId
    });

    const bindDN = decryptor({ cipherTextBlob: ldapIdentityAuth.encryptedBindDN }).toString();
    const bindPass = decryptor({ cipherTextBlob: ldapIdentityAuth.encryptedBindPass }).toString();
    const ldapCaCertificate = ldapIdentityAuth.encryptedLdapCaCertificate
      ? decryptor({ cipherTextBlob: ldapIdentityAuth.encryptedLdapCaCertificate }).toString()
      : undefined;

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);
    return { ...ldapIdentityAuth, orgId: identityMembershipOrg.orgId, bindDN, bindPass, ldapCaCertificate };
  };

  const revokeIdentityLdapAuth = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TRevokeLdapAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.LDAP_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have LDAP Auth attached"
      });
    }
    const { permission, membership } = await permissionService.getOrgPermission(
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

    const permissionBoundary = validatePrivilegeChangeOperation(
      membership.shouldUseNewPrivilegeSystem,
      OrgPermissionIdentityActions.RevokeAuth,
      OrgPermissionSubjects.Identity,
      permission,
      rolePermission
    );

    if (!permissionBoundary.isValid)
      throw new PermissionBoundaryError({
        message: constructPermissionErrorMessage(
          "Failed to revoke LDAP auth of identity with more privileged role",
          membership.shouldUseNewPrivilegeSystem,
          OrgPermissionIdentityActions.RevokeAuth,
          OrgPermissionSubjects.Identity
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });

    const revokedIdentityLdapAuth = await identityLdapAuthDAL.transaction(async (tx) => {
      const [deletedLdapAuth] = await identityLdapAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({ identityId, authMethod: IdentityAuthMethod.LDAP_AUTH }, tx);

      return { ...deletedLdapAuth, orgId: identityMembershipOrg.orgId };
    });
    return revokedIdentityLdapAuth;
  };

  return {
    attachLdapAuth,
    getLdapConfig,
    updateLdapAuth,
    login,
    revokeIdentityLdapAuth,
    getLdapAuth
  };
};
