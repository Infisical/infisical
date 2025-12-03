import { ForbiddenError, subject } from "@casl/ability";
import { requestContext } from "@fastify/request-context";

import { AccessScope, ActionProjectType, IdentityAuthMethod, OrganizationActionScope } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { extractX509CertFromChain } from "@app/lib/certificates/extract-certificate";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import {
  BadRequestError,
  ForbiddenRequestError,
  NotFoundError,
  PermissionBoundaryError,
  UnauthorizedError
} from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";
import { AuthAttemptAuthMethod, AuthAttemptAuthResult, authAttemptCounter } from "@app/lib/telemetry/metrics";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { validateIdentityUpdateForSuperAdminPrivileges } from "../super-admin/super-admin-fns";
import { TIdentityTlsCertAuthDALFactory } from "./identity-tls-cert-auth-dal";
import { TIdentityTlsCertAuthServiceFactory } from "./identity-tls-cert-auth-types";

type TIdentityTlsCertAuthServiceFactoryDep = {
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create" | "delete">;
  identityTlsCertAuthDAL: Pick<
    TIdentityTlsCertAuthDALFactory,
    "findOne" | "transaction" | "create" | "updateById" | "delete"
  >;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "findOne" | "update" | "getIdentityById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findOne">;
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
  identityDAL,
  identityAccessTokenDAL,
  identityTlsCertAuthDAL,
  membershipIdentityDAL,
  licenseService,
  permissionService,
  kmsService,
  orgDAL
}: TIdentityTlsCertAuthServiceFactoryDep): TIdentityTlsCertAuthServiceFactory => {
  const login: TIdentityTlsCertAuthServiceFactory["login"] = async ({
    identityId,
    clientCertificate,
    subOrganizationName
  }) => {
    const appCfg = getConfig();
    const identityTlsCertAuth = await identityTlsCertAuthDAL.findOne({ identityId });
    if (!identityTlsCertAuth) {
      throw new NotFoundError({
        message: "TLS Certificate auth method not found for identity, did you configure TLS Certificate auth?"
      });
    }

    const identity = await identityDAL.findById(identityTlsCertAuth.identityId);
    if (!identity) throw new UnauthorizedError({ message: "Identity not found" });

    const org = await orgDAL.findById(identity.orgId);
    const isSubOrgIdentity = Boolean(org.rootOrgId);

    // If the identity is a sub-org identity, then the scope is always the org.id, and if it's a root org identity, then we need to resolve the scope if a subOrganizationName is specified
    let subOrganizationId = isSubOrgIdentity ? org.id : null;

    if (subOrganizationName) {
      if (!isSubOrgIdentity) {
        const subOrg = await orgDAL.findOne({ rootOrgId: org.id, slug: subOrganizationName });

        if (subOrg) {
          const subOrgMembership = await membershipIdentityDAL.findOne({
            scope: AccessScope.Organization,
            actorIdentityId: identity.id,
            scopeOrgId: subOrg.id
          });
          if (subOrgMembership) {
            subOrganizationId = subOrg.id;
          }
        }
      }
    }

    try {
      const { decryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.Organization,
        orgId: identity.orgId
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
            authMethod: IdentityAuthMethod.TLS_CERT_AUTH,
            subOrganizationId
          },
          tx
        );
        return newToken;
      });

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

      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        authAttemptCounter.add(1, {
          "infisical.identity.id": identityTlsCertAuth.identityId,
          "infisical.identity.name": identity.name,
          "infisical.organization.id": org.id,
          "infisical.organization.name": org.name,
          "infisical.identity.auth_method": AuthAttemptAuthMethod.TLS_CERT_AUTH,
          "infisical.identity.auth_result": AuthAttemptAuthResult.SUCCESS,
          "client.address": requestContext.get("ip"),
          "user_agent.original": requestContext.get("userAgent")
        });
      }

      return {
        identityTlsCertAuth,
        accessToken,
        identityAccessToken,
        identity
      };
    } catch (error) {
      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        authAttemptCounter.add(1, {
          "infisical.identity.id": identityTlsCertAuth.identityId,
          "infisical.identity.name": identity.name,
          "infisical.organization.id": org.id,
          "infisical.organization.name": org.name,
          "infisical.identity.auth_method": AuthAttemptAuthMethod.TLS_CERT_AUTH,
          "infisical.identity.auth_result": AuthAttemptAuthResult.FAILURE,
          "client.address": requestContext.get("ip"),
          "user_agent.original": requestContext.get("userAgent")
        });
      }
      throw error;
    }
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

    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TLS_CERT_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add TLS Certificate Auth to already configured identity"
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

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.scopeOrgId
    });

    const identityTlsCertAuth = await identityTlsCertAuthDAL.transaction(async (tx) => {
      const doc = await identityTlsCertAuthDAL.create(
        {
          identityId: identityMembershipOrg.identity.id,
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
    return { ...identityTlsCertAuth, orgId: identityMembershipOrg.scopeOrgId };
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
    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.scopeOrgId
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

    return { ...updatedTlsCertAuth, orgId: identityMembershipOrg.scopeOrgId };
  };

  const getTlsCertAuth: TIdentityTlsCertAuthServiceFactory["getTlsCertAuth"] = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }) => {
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

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TLS_CERT_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have TLS Certificate Auth attached"
      });
    }

    const identityAuth = await identityTlsCertAuthDAL.findOne({ identityId });

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

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.scopeOrgId
    });
    let caCertificate = "";
    if (identityAuth.encryptedCaCertificate) {
      caCertificate = decryptor({ cipherTextBlob: identityAuth.encryptedCaCertificate }).toString();
    }

    return { ...identityAuth, caCertificate, orgId: identityMembershipOrg.scopeOrgId };
  };

  const revokeTlsCertAuth: TIdentityTlsCertAuthServiceFactory["revokeTlsCertAuth"] = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }) => {
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
    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TLS_CERT_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have TLS Certificate auth"
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

      const { permission: rolePermission, memberships } = await permissionService.getOrgPermission({
        actor: ActorType.IDENTITY,
        actorId: identityMembershipOrg.identity.id,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId,
        scope: OrganizationActionScope.Any
      });
      const shouldUseNewPrivilegeSystem = Boolean(memberships?.[0]?.shouldUseNewPrivilegeSystem);
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
    }

    const revokedIdentityTlsCertAuth = await identityTlsCertAuthDAL.transaction(async (tx) => {
      const deletedTlsCertAuth = await identityTlsCertAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({ identityId, authMethod: IdentityAuthMethod.TLS_CERT_AUTH }, tx);

      return { ...deletedTlsCertAuth?.[0], orgId: identityMembershipOrg.scopeOrgId };
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
