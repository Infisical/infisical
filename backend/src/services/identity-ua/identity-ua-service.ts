import { ForbiddenError } from "@casl/ability";

import { IdentityAuthMethod } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError, PermissionBoundaryError, UnauthorizedError } from "@app/lib/errors";
import { checkIPAgainstBlocklist, extractIPDetails, isValidIpOrCidr, TIp } from "@app/lib/ip";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { validateIdentityUpdateForSuperAdminPrivileges } from "../super-admin/super-admin-fns";
import { TIdentityUaClientSecretDALFactory } from "./identity-ua-client-secret-dal";
import { TIdentityUaDALFactory } from "./identity-ua-dal";
import {
  TAttachUaDTO,
  TCreateUaClientSecretDTO,
  TGetUaClientSecretsDTO,
  TGetUaDTO,
  TGetUniversalAuthClientSecretByIdDTO,
  TRevokeUaClientSecretDTO,
  TRevokeUaDTO,
  TUpdateUaDTO
} from "./identity-ua-types";

type TIdentityUaServiceFactoryDep = {
  identityUaDAL: TIdentityUaDALFactory;
  identityUaClientSecretDAL: TIdentityUaClientSecretDALFactory;
  identityAccessTokenDAL: TIdentityAccessTokenDALFactory;
  identityOrgMembershipDAL: TIdentityOrgDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TIdentityUaServiceFactory = ReturnType<typeof identityUaServiceFactory>;

export const identityUaServiceFactory = ({
  identityUaDAL,
  identityUaClientSecretDAL,
  identityAccessTokenDAL,
  identityOrgMembershipDAL,
  permissionService,
  licenseService
}: TIdentityUaServiceFactoryDep) => {
  const login = async (clientId: string, clientSecret: string, ip: string) => {
    const identityUa = await identityUaDAL.findOne({ clientId });
    if (!identityUa) {
      throw new NotFoundError({
        message: "No identity with specified client ID was found"
      });
    }

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId: identityUa.identityId });

    checkIPAgainstBlocklist({
      ipAddress: ip,
      trustedIps: identityUa.clientSecretTrustedIps as TIp[]
    });
    const clientSecretPrefix = clientSecret.slice(0, 4);
    const clientSecrtInfo = await identityUaClientSecretDAL.find({
      identityUAId: identityUa.id,
      isClientSecretRevoked: false,
      clientSecretPrefix
    });

    let validClientSecretInfo: (typeof clientSecrtInfo)[0] | null = null;
    for await (const info of clientSecrtInfo) {
      const isMatch = await crypto.hashing().compareHash(clientSecret, info.clientSecretHash);

      if (isMatch) {
        validClientSecretInfo = info;
        break;
      }
    }

    if (!validClientSecretInfo) throw new UnauthorizedError({ message: "Invalid credentials" });

    const { clientSecretTTL, clientSecretNumUses, clientSecretNumUsesLimit } = validClientSecretInfo;
    if (Number(clientSecretTTL) > 0) {
      const clientSecretCreated = new Date(validClientSecretInfo.createdAt);
      const ttlInMilliseconds = Number(clientSecretTTL) * 1000;
      const currentDate = new Date();
      const expirationTime = new Date(clientSecretCreated.getTime() + ttlInMilliseconds);

      if (currentDate > expirationTime) {
        await identityUaClientSecretDAL.updateById(validClientSecretInfo.id, {
          isClientSecretRevoked: true
        });

        throw new UnauthorizedError({
          message: "Access denied due to expired client secret"
        });
      }
    }

    if (clientSecretNumUsesLimit > 0 && clientSecretNumUses === clientSecretNumUsesLimit) {
      // number of times client secret can be used for
      // a login operation reached
      await identityUaClientSecretDAL.updateById(validClientSecretInfo.id, {
        isClientSecretRevoked: true
      });
      throw new UnauthorizedError({
        message: "Access denied due to client secret usage limit reached"
      });
    }

    const accessTokenTTLParams =
      Number(identityUa.accessTokenPeriod) === 0
        ? {
            accessTokenTTL: identityUa.accessTokenTTL,
            accessTokenMaxTTL: identityUa.accessTokenMaxTTL
          }
        : {
            accessTokenTTL: identityUa.accessTokenPeriod,
            // We set a very large Max TTL for periodic tokens to ensure that clients (even outdated ones) can always renew their token
            // without them having to update their SDKs, CLIs, etc. This workaround sets it to 30 years to emulate "forever"
            accessTokenMaxTTL: 1000000000
          };

    const identityAccessToken = await identityUaDAL.transaction(async (tx) => {
      const uaClientSecretDoc = await identityUaClientSecretDAL.incrementUsage(validClientSecretInfo!.id, tx);

      const newToken = await identityAccessTokenDAL.create(
        {
          identityId: identityUa.identityId,
          isAccessTokenRevoked: false,
          identityUAClientSecretId: uaClientSecretDoc.id,
          accessTokenNumUses: 0,
          accessTokenNumUsesLimit: identityUa.accessTokenNumUsesLimit,
          accessTokenPeriod: identityUa.accessTokenPeriod,
          authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
          ...accessTokenTTLParams
        },
        tx
      );

      return newToken;
    });

    const appCfg = getConfig();
    const accessToken = crypto.jwt().sign(
      {
        identityId: identityUa.identityId,
        clientSecretId: validClientSecretInfo.id,
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

    return {
      accessToken,
      identityUa,
      validClientSecretInfo,
      identityAccessToken,
      identityMembershipOrg,
      ...accessTokenTTLParams
    };
  };

  const attachUniversalAuth = async ({
    accessTokenMaxTTL,
    identityId,
    accessTokenNumUsesLimit,
    accessTokenTTL,
    accessTokenTrustedIps,
    clientSecretTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    isActorSuperAdmin,
    accessTokenPeriod
  }: TAttachUaDTO) => {
    await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add universal auth to already configured identity"
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
    const reformattedClientSecretTrustedIps = clientSecretTrustedIps.map((clientSecretTrustedIp) => {
      if (
        !plan.ipAllowlisting &&
        clientSecretTrustedIp.ipAddress !== "0.0.0.0/0" &&
        clientSecretTrustedIp.ipAddress !== "::/0"
      )
        throw new BadRequestError({
          message:
            "Failed to add IP access range to service token due to plan restriction. Upgrade plan to add IP access range."
        });
      if (!isValidIpOrCidr(clientSecretTrustedIp.ipAddress))
        throw new BadRequestError({
          message: "The IP is not a valid IPv4, IPv6, or CIDR block"
        });
      return extractIPDetails(clientSecretTrustedIp.ipAddress);
    });
    const reformattedAccessTokenTrustedIps = accessTokenTrustedIps.map((accessTokenTrustedIp) => {
      if (
        !plan.ipAllowlisting &&
        accessTokenTrustedIp.ipAddress !== "0.0.0.0/0" &&
        accessTokenTrustedIp.ipAddress !== "::/0"
      )
        throw new BadRequestError({
          message:
            "Failed to add IP access range to service token due to plan restriction. Upgrade plan to add IP access range."
        });
      if (!isValidIpOrCidr(accessTokenTrustedIp.ipAddress))
        throw new BadRequestError({
          message: "The IP is not a valid IPv4, IPv6, or CIDR block"
        });
      return extractIPDetails(accessTokenTrustedIp.ipAddress);
    });

    const identityUa = await identityUaDAL.transaction(async (tx) => {
      const doc = await identityUaDAL.create(
        {
          identityId: identityMembershipOrg.identityId,
          clientId: crypto.nativeCrypto.randomUUID(),
          clientSecretTrustedIps: JSON.stringify(reformattedClientSecretTrustedIps),
          accessTokenMaxTTL,
          accessTokenTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps: JSON.stringify(reformattedAccessTokenTrustedIps),
          accessTokenPeriod
        },
        tx
      );
      return doc;
    });
    return { ...identityUa, orgId: identityMembershipOrg.orgId };
  };

  const updateUniversalAuth = async ({
    accessTokenMaxTTL,
    identityId,
    accessTokenNumUsesLimit,
    accessTokenTTL,
    accessTokenTrustedIps,
    clientSecretTrustedIps,
    accessTokenPeriod,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateUaDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    const uaIdentityAuth = await identityUaDAL.findOne({ identityId });
    if (!uaIdentityAuth) {
      throw new NotFoundError({ message: `Failed to find universal auth for identity with ID ${identityId}` });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });
    }

    if (
      (accessTokenMaxTTL || uaIdentityAuth.accessTokenMaxTTL) > 0 &&
      (accessTokenTTL || uaIdentityAuth.accessTokenMaxTTL) > (accessTokenMaxTTL || uaIdentityAuth.accessTokenMaxTTL)
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
    const reformattedClientSecretTrustedIps = clientSecretTrustedIps?.map((clientSecretTrustedIp) => {
      if (
        !plan.ipAllowlisting &&
        clientSecretTrustedIp.ipAddress !== "0.0.0.0/0" &&
        clientSecretTrustedIp.ipAddress !== "::/0"
      )
        throw new BadRequestError({
          message:
            "Failed to add IP access range to service token due to plan restriction. Upgrade plan to add IP access range."
        });
      if (!isValidIpOrCidr(clientSecretTrustedIp.ipAddress))
        throw new BadRequestError({
          message: "The IP is not a valid IPv4, IPv6, or CIDR block"
        });
      return extractIPDetails(clientSecretTrustedIp.ipAddress);
    });
    const reformattedAccessTokenTrustedIps = accessTokenTrustedIps?.map((accessTokenTrustedIp) => {
      if (
        !plan.ipAllowlisting &&
        accessTokenTrustedIp.ipAddress !== "0.0.0.0/0" &&
        accessTokenTrustedIp.ipAddress !== "::/0"
      )
        throw new BadRequestError({
          message:
            "Failed to add IP access range to service token due to plan restriction. Upgrade plan to add IP access range."
        });
      if (!isValidIpOrCidr(accessTokenTrustedIp.ipAddress))
        throw new BadRequestError({
          message: "The IP is not a valid IPv4, IPv6, or CIDR block"
        });
      return extractIPDetails(accessTokenTrustedIp.ipAddress);
    });

    const updatedUaAuth = await identityUaDAL.updateById(uaIdentityAuth.id, {
      clientSecretTrustedIps: reformattedClientSecretTrustedIps
        ? JSON.stringify(reformattedClientSecretTrustedIps)
        : undefined,
      accessTokenMaxTTL,
      accessTokenTTL,
      accessTokenNumUsesLimit,
      accessTokenPeriod,
      accessTokenTrustedIps: reformattedAccessTokenTrustedIps
        ? JSON.stringify(reformattedAccessTokenTrustedIps)
        : undefined
    });
    return { ...updatedUaAuth, orgId: identityMembershipOrg.orgId };
  };

  const getIdentityUniversalAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetUaDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    const uaIdentityAuth = await identityUaDAL.findOne({ identityId });
    if (!uaIdentityAuth) {
      throw new NotFoundError({ message: `Failed to find universal auth for identity with ID ${identityId}` });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have universal auth"
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
    return { ...uaIdentityAuth, orgId: identityMembershipOrg.orgId };
  };

  const revokeIdentityUniversalAuth = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TRevokeUaDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have universal auth"
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

    const { permission: rolePermission, membership } = await permissionService.getOrgPermission(
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
          "Failed to revoke universal auth of identity with more privileged role",
          membership.shouldUseNewPrivilegeSystem,
          OrgPermissionIdentityActions.RevokeAuth,
          OrgPermissionSubjects.Identity
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });

    const revokedIdentityUniversalAuth = await identityUaDAL.transaction(async (tx) => {
      const deletedUniversalAuth = await identityUaDAL.delete({ identityId }, tx);
      return { ...deletedUniversalAuth?.[0], orgId: identityMembershipOrg.orgId };
    });
    return revokedIdentityUniversalAuth;
  };

  const createUniversalAuthClientSecret = async ({
    actor,
    actorId,
    actorOrgId,
    identityId,
    ttl,
    actorAuthMethod,
    description,
    numUsesLimit
  }: TCreateUaClientSecretDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });
    }

    const { permission, membership } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Create, OrgPermissionSubjects.Identity);

    const { permission: rolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      identityMembershipOrg.identityId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    const permissionBoundary = validatePrivilegeChangeOperation(
      membership.shouldUseNewPrivilegeSystem,
      OrgPermissionIdentityActions.CreateToken,
      OrgPermissionSubjects.Identity,
      permission,
      rolePermission
    );
    if (!permissionBoundary.isValid)
      throw new PermissionBoundaryError({
        message: constructPermissionErrorMessage(
          "Failed to create client secret for identity.",
          membership.shouldUseNewPrivilegeSystem,
          OrgPermissionIdentityActions.CreateToken,
          OrgPermissionSubjects.Identity
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });

    const appCfg = getConfig();
    const clientSecret = crypto.randomBytes(32).toString("hex");
    const clientSecretHash = await crypto.hashing().createHash(clientSecret, appCfg.SALT_ROUNDS);

    const identityUaAuth = await identityUaDAL.findOne({ identityId: identityMembershipOrg.identityId });
    if (!identityUaAuth) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    const identityUaClientSecret = await identityUaClientSecretDAL.create({
      identityUAId: identityUaAuth.id,
      description,
      clientSecretPrefix: clientSecret.slice(0, 4),
      clientSecretHash,
      clientSecretNumUses: 0,
      clientSecretNumUsesLimit: numUsesLimit,
      clientSecretTTL: ttl,
      isClientSecretRevoked: false
    });
    return {
      clientSecret,
      clientSecretData: identityUaClientSecret,
      orgId: identityMembershipOrg.orgId
    };
  };

  const getUniversalAuthClientSecrets = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    identityId
  }: TGetUaClientSecretsDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });
    }
    const { permission, membership } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);

    const { permission: rolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      identityMembershipOrg.identityId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );

    const permissionBoundary = validatePrivilegeChangeOperation(
      membership.shouldUseNewPrivilegeSystem,
      OrgPermissionIdentityActions.GetToken,
      OrgPermissionSubjects.Identity,
      permission,
      rolePermission
    );
    if (!permissionBoundary.isValid)
      throw new PermissionBoundaryError({
        message: constructPermissionErrorMessage(
          "Failed to get identity client secret with more privileged role",
          membership.shouldUseNewPrivilegeSystem,
          OrgPermissionIdentityActions.GetToken,
          OrgPermissionSubjects.Identity
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });

    const identityUniversalAuth = await identityUaDAL.findOne({
      identityId
    });

    const clientSecrets = await identityUaClientSecretDAL.find({
      identityUAId: identityUniversalAuth.id,
      isClientSecretRevoked: false
    });
    return { clientSecrets, orgId: identityMembershipOrg.orgId };
  };

  const getUniversalAuthClientSecretById = async ({
    identityId,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    clientSecretId
  }: TGetUniversalAuthClientSecretByIdDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });
    }

    const identityUa = await identityUaDAL.findOne({ identityId });
    if (!identityUa) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    const clientSecret = await identityUaClientSecretDAL.findOne({ id: clientSecretId, identityUAId: identityUa.id });
    if (!clientSecret) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    const { permission, membership } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);

    const { permission: rolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      identityMembershipOrg.identityId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    const permissionBoundary = validatePrivilegeChangeOperation(
      membership.shouldUseNewPrivilegeSystem,
      OrgPermissionIdentityActions.GetToken,
      OrgPermissionSubjects.Identity,
      permission,
      rolePermission
    );
    if (!permissionBoundary.isValid)
      throw new PermissionBoundaryError({
        message: constructPermissionErrorMessage(
          "Failed to read identity client secret of identity with more privileged role",
          membership.shouldUseNewPrivilegeSystem,
          OrgPermissionIdentityActions.GetToken,
          OrgPermissionSubjects.Identity
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });

    return { ...clientSecret, identityId, orgId: identityMembershipOrg.orgId };
  };

  const revokeUniversalAuthClientSecret = async ({
    identityId,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    clientSecretId
  }: TRevokeUaClientSecretDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.UNIVERSAL_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });
    }

    const identityUa = await identityUaDAL.findOne({ identityId });
    if (!identityUa) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    const clientSecret = await identityUaClientSecretDAL.findOne({ id: clientSecretId, identityUAId: identityUa.id });
    if (!clientSecret) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    const { permission, membership } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Delete, OrgPermissionSubjects.Identity);

    const { permission: rolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      identityMembershipOrg.identityId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );

    const permissionBoundary = validatePrivilegeChangeOperation(
      membership.shouldUseNewPrivilegeSystem,
      OrgPermissionIdentityActions.DeleteToken,
      OrgPermissionSubjects.Identity,
      permission,
      rolePermission
    );
    if (!permissionBoundary.isValid) {
      throw new PermissionBoundaryError({
        message: constructPermissionErrorMessage(
          "Failed to revoke identity client secret with more privileged role",
          membership.shouldUseNewPrivilegeSystem,
          OrgPermissionIdentityActions.DeleteToken,
          OrgPermissionSubjects.Identity
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });
    }

    const updatedClientSecret = await identityUaClientSecretDAL.updateById(clientSecretId, {
      isClientSecretRevoked: true
    });

    return { ...updatedClientSecret, identityId, orgId: identityMembershipOrg.orgId };
  };

  return {
    login,
    attachUniversalAuth,
    updateUniversalAuth,
    getIdentityUniversalAuth,
    revokeIdentityUniversalAuth,
    createUniversalAuthClientSecret,
    getUniversalAuthClientSecrets,
    revokeUniversalAuthClientSecret,
    getUniversalAuthClientSecretById
  };
};
