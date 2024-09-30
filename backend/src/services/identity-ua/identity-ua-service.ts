import crypto from "node:crypto";

import { ForbiddenError } from "@casl/ability";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { IdentityAuthMethod } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { checkIPAgainstBlocklist, extractIPDetails, isValidIpOrCidr, TIp } from "@app/lib/ip";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
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
  identityDAL: Pick<TIdentityDALFactory, "updateById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TIdentityUaServiceFactory = ReturnType<typeof identityUaServiceFactory>;

export const identityUaServiceFactory = ({
  identityUaDAL,
  identityUaClientSecretDAL,
  identityAccessTokenDAL,
  identityOrgMembershipDAL,
  identityDAL,
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
    const clientSecrtInfo = await identityUaClientSecretDAL.find({
      identityUAId: identityUa.id,
      isClientSecretRevoked: false
    });

    const validClientSecretInfo = clientSecrtInfo.find(({ clientSecretHash }) =>
      bcrypt.compareSync(clientSecret, clientSecretHash)
    );
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

    const identityAccessToken = await identityUaDAL.transaction(async (tx) => {
      const uaClientSecretDoc = await identityUaClientSecretDAL.incrementUsage(validClientSecretInfo.id, tx);
      const newToken = await identityAccessTokenDAL.create(
        {
          identityId: identityUa.identityId,
          isAccessTokenRevoked: false,
          identityUAClientSecretId: uaClientSecretDoc.id,
          accessTokenTTL: identityUa.accessTokenTTL,
          accessTokenMaxTTL: identityUa.accessTokenMaxTTL,
          accessTokenNumUses: 0,
          accessTokenNumUsesLimit: identityUa.accessTokenNumUsesLimit
        },
        tx
      );
      return newToken;
    });

    const appCfg = getConfig();
    const accessToken = jwt.sign(
      {
        identityId: identityUa.identityId,
        clientSecretId: validClientSecretInfo.id,
        identityAccessTokenId: identityAccessToken.id,
        authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN
      } as TIdentityAccessTokenJwtPayload,
      appCfg.AUTH_SECRET,
      {
        expiresIn:
          Number(identityAccessToken.accessTokenMaxTTL) === 0
            ? undefined
            : Number(identityAccessToken.accessTokenMaxTTL)
      }
    );

    return { accessToken, identityUa, validClientSecretInfo, identityAccessToken, identityMembershipOrg };
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
    actorOrgId
  }: TAttachUaDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity.authMethod)
      throw new BadRequestError({
        message: "Failed to add universal auth to already configured identity"
      });

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
          clientId: crypto.randomUUID(),
          clientSecretTrustedIps: JSON.stringify(reformattedClientSecretTrustedIps),
          accessTokenMaxTTL,
          accessTokenTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps: JSON.stringify(reformattedAccessTokenTrustedIps)
        },
        tx
      );
      await identityDAL.updateById(
        identityMembershipOrg.identityId,
        {
          authMethod: IdentityAuthMethod.Univeral
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
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateUaDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.Univeral)
      throw new BadRequestError({
        message: "Failed to updated universal auth"
      });

    const uaIdentityAuth = await identityUaDAL.findOne({ identityId });

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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Identity);

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
      accessTokenTrustedIps: reformattedAccessTokenTrustedIps
        ? JSON.stringify(reformattedAccessTokenTrustedIps)
        : undefined
    });
    return { ...updatedUaAuth, orgId: identityMembershipOrg.orgId };
  };

  const getIdentityUniversalAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetUaDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.Univeral)
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });

    const uaIdentityAuth = await identityUaDAL.findOne({ identityId });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Identity);
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
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.Univeral)
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });
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
    if (!isAtLeastAsPrivileged(permission, rolePermission))
      throw new ForbiddenRequestError({
        message: "Failed to revoke universal auth of identity with more privileged role"
      });

    const revokedIdentityUniversalAuth = await identityUaDAL.transaction(async (tx) => {
      const deletedUniversalAuth = await identityUaDAL.delete({ identityId }, tx);
      await identityDAL.updateById(identityId, { authMethod: null }, tx);
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
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.Univeral)
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Identity);

    const { permission: rolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      identityMembershipOrg.identityId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    const hasPriviledge = isAtLeastAsPrivileged(permission, rolePermission);
    if (!hasPriviledge)
      throw new ForbiddenRequestError({
        message: "Failed to add identity to project with more privileged role"
      });

    const appCfg = getConfig();
    const clientSecret = crypto.randomBytes(32).toString("hex");
    const clientSecretHash = await bcrypt.hash(clientSecret, appCfg.SALT_ROUNDS);
    const identityUniversalAuth = await identityUaDAL.findOne({
      identityId
    });

    const identityUaClientSecret = await identityUaClientSecretDAL.create({
      identityUAId: identityUniversalAuth.id,
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
      uaAuth: identityUniversalAuth,
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
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.Univeral)
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Identity);

    const { permission: rolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      identityMembershipOrg.identityId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );

    if (!isAtLeastAsPrivileged(permission, rolePermission))
      throw new ForbiddenRequestError({
        message: "Failed to add identity to project with more privileged role"
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
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.Univeral)
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Identity);

    const { permission: rolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      identityMembershipOrg.identityId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    if (!isAtLeastAsPrivileged(permission, rolePermission))
      throw new ForbiddenRequestError({
        message: "Failed to read identity client secret of project with more privileged role"
      });

    const clientSecret = await identityUaClientSecretDAL.findById(clientSecretId);
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
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.Univeral)
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Identity);

    const { permission: rolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      identityMembershipOrg.identityId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );

    if (!isAtLeastAsPrivileged(permission, rolePermission))
      throw new ForbiddenRequestError({
        message: "Failed to revoke identity client secret with more privileged role"
      });

    const clientSecret = await identityUaClientSecretDAL.updateById(clientSecretId, {
      isClientSecretRevoked: true
    });
    return { ...clientSecret, identityId, orgId: identityMembershipOrg.orgId };
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
