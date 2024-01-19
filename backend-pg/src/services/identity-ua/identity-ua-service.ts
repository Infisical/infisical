import crypto from "node:crypto";

import { ForbiddenError } from "@casl/ability";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { IdentityAuthMethod } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, UnauthorizedError } from "@app/lib/errors";
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
  TRevokeUaClientSecretDTO,
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
    if (!identityUa) throw new UnauthorizedError();

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
    if (!validClientSecretInfo) throw new UnauthorizedError();

    const { clientSecretTTL, clientSecretNumUses, clientSecretNumUsesLimit } =
      validClientSecretInfo;
    if (clientSecretTTL > 0) {
      const clientSecretCreated = new Date(validClientSecretInfo.createdAt);
      const ttlInMilliseconds = clientSecretTTL * 1000;
      const currentDate = new Date();
      const expirationTime = new Date(clientSecretCreated.getTime() + ttlInMilliseconds);

      if (currentDate > expirationTime) {
        await identityUaClientSecretDAL.updateById(validClientSecretInfo.id, {
          isClientSecretRevoked: true
        });

        throw new UnauthorizedError({
          message: "Failed to authenticate identity credentials due to expired client secret"
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
        message:
          "Failed to authenticate identity credentials due to client secret number of uses limit reached"
      });
    }

    const identityAccessToken = await identityUaDAL.transaction(async (tx) => {
      const uaClientSecretDoc = await identityUaClientSecretDAL.incrementUsage(
        validClientSecretInfo.id,
        tx
      );
      const newToken = await identityAccessTokenDAL.create(
        {
          identityId: identityUa.identityId,
          authType: IdentityAuthMethod.Univeral,
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
      appCfg.JWT_AUTH_SECRET,
      {
        expiresIn:
          identityAccessToken.accessTokenMaxTTL === 0
            ? undefined
            : identityAccessToken.accessTokenMaxTTL
      }
    );
    return { accessToken, identityUa, validClientSecretInfo, identityAccessToken };
  };

  const attachUa = async ({
    accessTokenMaxTTL,
    identityId,
    accessTokenNumUsesLimit,
    accessTokenTTL,
    accessTokenTrustedIps,
    clientSecretTrustedIps,
    actorId,
    actor
  }: TAttachUaDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
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
      identityMembershipOrg.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Create,
      OrgPermissionSubjects.Identity
    );

    const plan = await licenseService.getPlan(identityMembershipOrg.orgId);
    const reformattedClientSecretTrustedIps = clientSecretTrustedIps.map(
      (clientSecretTrustedIp) => {
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
      }
    );
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

  const updateUa = async ({
    accessTokenMaxTTL,
    identityId,
    accessTokenNumUsesLimit,
    accessTokenTTL,
    accessTokenTrustedIps,
    clientSecretTrustedIps,
    actorId,
    actor
  }: TUpdateUaDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.Univeral)
      throw new BadRequestError({
        message: "Failed to updated universal auth"
      });

    const uaIdentityAuth = await identityUaDAL.findOne({ identityId });

    if (
      (accessTokenMaxTTL || uaIdentityAuth.accessTokenMaxTTL) > 0 &&
      (accessTokenTTL || uaIdentityAuth.accessTokenMaxTTL) >
        (accessTokenMaxTTL || uaIdentityAuth.accessTokenMaxTTL)
    ) {
      throw new BadRequestError({ message: "Access token TTL cannot be greater than max TTL" });
    }

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Edit,
      OrgPermissionSubjects.Identity
    );

    const plan = await licenseService.getPlan(identityMembershipOrg.orgId);
    const reformattedClientSecretTrustedIps = clientSecretTrustedIps?.map(
      (clientSecretTrustedIp) => {
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
      }
    );
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

  const getIdentityUa = async ({ identityId, actorId, actor }: TGetUaDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.Univeral)
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });

    const uaIdentityAuth = await identityUaDAL.findOne({ identityId });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Identity
    );
    return { ...uaIdentityAuth, orgId: identityMembershipOrg.orgId };
  };

  const createUaClientSecret = async ({
    actor,
    actorId,
    identityId,
    ttl,
    description,
    numUsesLimit
  }: TCreateUaClientSecretDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.Univeral)
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Create,
      OrgPermissionSubjects.Identity
    );

    const { permission: rolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      identityMembershipOrg.identityId,
      identityMembershipOrg.orgId
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

  const getUaClientSecrets = async ({ actor, actorId, identityId }: TGetUaClientSecretsDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.Univeral)
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Identity
    );

    const { permission: rolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      identityMembershipOrg.identityId,
      identityMembershipOrg.orgId
    );
    const hasPriviledge = isAtLeastAsPrivileged(permission, rolePermission);
    if (!hasPriviledge)
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

  const revokeUaClientSecret = async ({
    identityId,
    actorId,
    actor,
    clientSecretId
  }: TRevokeUaClientSecretDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.Univeral)
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Delete,
      OrgPermissionSubjects.Identity
    );

    const { permission: rolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      identityMembershipOrg.identityId,
      identityMembershipOrg.orgId
    );
    const hasPriviledge = isAtLeastAsPrivileged(permission, rolePermission);
    if (!hasPriviledge)
      throw new ForbiddenRequestError({
        message: "Failed to add identity to project with more privileged role"
      });

    const clientSecret = await identityUaClientSecretDAL.updateById(clientSecretId, {
      isClientSecretRevoked: true
    });
    return { ...clientSecret, identityId, orgId: identityMembershipOrg.orgId };
  };

  return {
    login,
    attachUa,
    updateUa,
    getIdentityUa,
    createUaClientSecret,
    getUaClientSecrets,
    revokeUaClientSecret
  };
};
