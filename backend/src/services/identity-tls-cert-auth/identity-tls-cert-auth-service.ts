import { ForbiddenError } from "@casl/ability";

import { IdentityAuthMethod } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TOrgDALFactory } from "../org/org-dal";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { extractX509CertFromChain } from "@app/lib/certificates/extract-certificate";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError, PermissionBoundaryError, UnauthorizedError } from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { validateIdentityUpdateForSuperAdminPrivileges } from "../super-admin/super-admin-fns";
import { TIdentityTlsCertAuthDALFactory } from "./identity-tls-cert-auth-dal";
import { TIdentityTlsCertAuthServiceFactory } from "./identity-tls-cert-auth-types";

type TIdentityTlsCertAuthServiceFactoryDep = {
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create" | "delete">;
  identityTlsCertAuthDAL: Pick<
    TIdentityTlsCertAuthDALFactory,
    "findOne" | "transaction" | "create" | "updateById" | "delete"
  >;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne" | "updateById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
};

const parseSubjectDetails = (data: string) => {
  const values: Record<string, string> = {};
  data.split("\n").forEach((el) => {
    const [key, value] = el.split("=");
    values[key.trim()] = value.trim();
  });
  return values;
};

export const identityTlsCertAuthServiceFactory = ({
  identityAccessTokenDAL,
  identityTlsCertAuthDAL,
  identityOrgMembershipDAL,
  licenseService,
  permissionService,
  kmsService,
  orgDAL
}: TIdentityTlsCertAuthServiceFactoryDep): TIdentityTlsCertAuthServiceFactory => {
  const login: TIdentityTlsCertAuthServiceFactory["login"] = async ({ identityId, clientCertificate }) => {
    const identityTlsCertAuth = await identityTlsCertAuthDAL.findOne({ identityId });
    if (!identityTlsCertAuth) {
      throw new NotFoundError({
        message: "TLS Certificate auth method not found for identity, did you configure TLS Certificate auth?"
      });
    }

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({
      identityId: identityTlsCertAuth.identityId
    });

    if (!identityMembershipOrg) {
      throw new NotFoundError({
        message: `Identity organization membership for identity with ID '${identityTlsCertAuth.identityId}' not found`
      });
    }

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.orgId
    });

    const caCertificate = decryptor({
      cipherTextBlob: identityTlsCertAuth.encryptedCaCertificate
    }).toString();

    const leafCertificate = extractX509CertFromChain(decodeURIComponent(clientCertificate))?.[0];
    if (!leafCertificate) {
      throw new BadRequestError({ message: "Missing client certificate" });
    }

    const clientCertificateX509 = new crypto.nativeCrypto.X509Certificate(leafCertificate);
    const caCertificateX509 = new crypto.nativeCrypto.X509Certificate(caCertificate);

    const isValidCertificate = clientCertificateX509.verify(caCertificateX509.publicKey);
    if (!isValidCertificate)
      throw new UnauthorizedError({
        message: "Access denied: Certificate not issued by the provided CA."
      });

    if (new Date(clientCertificateX509.validTo) < new Date()) {
      throw new UnauthorizedError({
        message: "Access denied: Certificate has expired."
      });
    }

    if (new Date(clientCertificateX509.validFrom) > new Date()) {
      throw new UnauthorizedError({
        message: "Access denied: Certificate not yet valid."
      });
    }

    const subjectDetails = parseSubjectDetails(clientCertificateX509.subject);
    if (identityTlsCertAuth.allowedCommonNames) {
      const isValidCommonName = identityTlsCertAuth.allowedCommonNames.split(",").includes(subjectDetails.CN);
      if (!isValidCommonName) {
        throw new UnauthorizedError({
          message: "Access denied: TLS Certificate Auth common name not allowed."
        });
      }
    }

    // Generate the token
    const identityAccessToken = await identityTlsCertAuthDAL.transaction(async (tx) => {
      await identityOrgMembershipDAL.updateById(
        identityMembershipOrg.id,
        {
          lastLoginAuthMethod: IdentityAuthMethod.TLS_CERT_AUTH,
          lastLoginTime: new Date()
        },
        tx
      );
      const newToken = await identityAccessTokenDAL.create(
        {
          identityId: identityTlsCertAuth.identityId,
          isAccessTokenRevoked: false,
          accessTokenTTL: identityTlsCertAuth.accessTokenTTL,
          accessTokenMaxTTL: identityTlsCertAuth.accessTokenMaxTTL,
          accessTokenNumUses: 0,
          accessTokenNumUsesLimit: identityTlsCertAuth.accessTokenNumUsesLimit,
          authMethod: IdentityAuthMethod.TLS_CERT_AUTH
        },
        tx
      );
      return newToken;
    });

    const appCfg = getConfig();
    const accessToken = crypto.jwt().sign(
      {
        identityId: identityTlsCertAuth.identityId,
        identityAccessTokenId: identityAccessToken.id,
        authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN
      } as TIdentityAccessTokenJwtPayload,
      appCfg.AUTH_SECRET,
      Number(identityAccessToken.accessTokenTTL) === 0
        ? undefined
        : {
            expiresIn: Number(identityAccessToken.accessTokenTTL)
          }
    );

    return {
      identityTlsCertAuth,
      accessToken,
      identityAccessToken,
      identityMembershipOrg
    };
  };

  const attachTlsCertAuth: TIdentityTlsCertAuthServiceFactory["attachTlsCertAuth"] = async ({
    identityId,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    isActorSuperAdmin,
    caCertificate,
    allowedCommonNames
  }) => {
    await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TLS_CERT_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add TLS Certificate Auth to already configured identity"
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

    const identityTlsCertAuth = await identityTlsCertAuthDAL.transaction(async (tx) => {
      const doc = await identityTlsCertAuthDAL.create(
        {
          identityId: identityMembershipOrg.identityId,
          accessTokenMaxTTL,
          allowedCommonNames,
          accessTokenTTL,
          encryptedCaCertificate: encryptor({ plainText: Buffer.from(caCertificate) }).cipherTextBlob,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps: JSON.stringify(reformattedAccessTokenTrustedIps)
        },
        tx
      );
      return doc;
    });
    return { ...identityTlsCertAuth, orgId: identityMembershipOrg.orgId };
  };

  const updateTlsCertAuth: TIdentityTlsCertAuthServiceFactory["updateTlsCertAuth"] = async ({
    identityId,
    caCertificate,
    allowedCommonNames,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TLS_CERT_AUTH)) {
      throw new NotFoundError({
        message: "The identity does not have TLS Certificate Auth attached"
      });
    }

    const identityTlsCertAuth = await identityTlsCertAuthDAL.findOne({ identityId });

    if (
      (accessTokenMaxTTL || identityTlsCertAuth.accessTokenMaxTTL) > 0 &&
      (accessTokenTTL || identityTlsCertAuth.accessTokenTTL) >
        (accessTokenMaxTTL || identityTlsCertAuth.accessTokenMaxTTL)
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
    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.orgId
    });

    const updatedTlsCertAuth = await identityTlsCertAuthDAL.updateById(identityTlsCertAuth.id, {
      allowedCommonNames,
      encryptedCaCertificate: caCertificate
        ? encryptor({ plainText: Buffer.from(caCertificate) }).cipherTextBlob
        : undefined,
      accessTokenMaxTTL,
      accessTokenTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps: reformattedAccessTokenTrustedIps
        ? JSON.stringify(reformattedAccessTokenTrustedIps)
        : undefined
    });

    return { ...updatedTlsCertAuth, orgId: identityMembershipOrg.orgId };
  };

  const getTlsCertAuth: TIdentityTlsCertAuthServiceFactory["getTlsCertAuth"] = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TLS_CERT_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have TLS Certificate Auth attached"
      });
    }

    const identityAuth = await identityTlsCertAuthDAL.findOne({ identityId });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);
    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.orgId
    });
    let caCertificate = "";
    if (identityAuth.encryptedCaCertificate) {
      caCertificate = decryptor({ cipherTextBlob: identityAuth.encryptedCaCertificate }).toString();
    }

    return { ...identityAuth, caCertificate, orgId: identityMembershipOrg.orgId };
  };

  const revokeTlsCertAuth: TIdentityTlsCertAuthServiceFactory["revokeTlsCertAuth"] = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TLS_CERT_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have TLS Certificate auth"
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
          "Failed to revoke TLS Certificate auth of identity with more privileged role",
          shouldUseNewPrivilegeSystem,
          OrgPermissionIdentityActions.RevokeAuth,
          OrgPermissionSubjects.Identity
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });

    const revokedIdentityTlsCertAuth = await identityTlsCertAuthDAL.transaction(async (tx) => {
      const deletedTlsCertAuth = await identityTlsCertAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({ identityId, authMethod: IdentityAuthMethod.TLS_CERT_AUTH }, tx);

      return { ...deletedTlsCertAuth?.[0], orgId: identityMembershipOrg.orgId };
    });
    return revokedIdentityTlsCertAuth;
  };

  return {
    login,
    attachTlsCertAuth,
    updateTlsCertAuth,
    getTlsCertAuth,
    revokeTlsCertAuth
  };
};
