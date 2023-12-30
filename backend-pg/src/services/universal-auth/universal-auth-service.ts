import crypto from "node:crypto";

import { ForbiddenError } from "@casl/ability";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { IdentityAuthMethod } from "@app/db/schemas";
import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, UnauthorizedError } from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityDalFactory } from "../identity/identity-dal";
import { TIdentityOrgDalFactory } from "../identity/identity-org-dal";
import { TIdentityAccessTokenDalFactory } from "../identity-access-token/identity-access-token-dal";
import { TUaClientSecretDalFactory } from "./ua-client-secret-dal";
import { TUniversalAuthDalFactory } from "./universal-auth-dal";
import {
  TAttachUaDTO,
  TCreateUaClientSecretDTO,
  TGetUaClientSecretsDTO,
  TGetUaDTO,
  TRevokeUaClientSecretDTO,
  TUpdateUaDTO
} from "./universal-auth-types";

type TUniversalAuthServiceFactoryDep = {
  universalAuthDal: TUniversalAuthDalFactory;
  uaClientSecretDal: TUaClientSecretDalFactory;
  identityAccessTokenDal: TIdentityAccessTokenDalFactory;
  identityOrgDal: TIdentityOrgDalFactory;
  identityDal: Pick<TIdentityDalFactory, "updateById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export type TUniversalAuthServiceFactory = ReturnType<typeof universalAuthServiceFactory>;

export const universalAuthServiceFactory = ({
  universalAuthDal,
  uaClientSecretDal,
  identityAccessTokenDal,
  identityOrgDal,
  identityDal,
  permissionService
}: TUniversalAuthServiceFactoryDep) => {
  const login = async (clientId: string, clientSecret: string) => {
    const identityUa = await universalAuthDal.findOne({ clientId });
    if (!identityUa) throw new UnauthorizedError();

    // TODO(akhilmhdh-pg): add ip checking
    const clientSecrtInfo = await uaClientSecretDal.find({
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
        await uaClientSecretDal.updateById(validClientSecretInfo.id, {
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
      await uaClientSecretDal.updateById(validClientSecretInfo.id, { isClientSecretRevoked: true });
      throw new UnauthorizedError({
        message:
          "Failed to authenticate identity credentials due to client secret number of uses limit reached"
      });
    }

    const identityAccessToken = await universalAuthDal.transaction(async (tx) => {
      const uaClientSecretDoc = await uaClientSecretDal.incrementUsage(
        validClientSecretInfo.id,
        tx
      );
      const newToken = await identityAccessTokenDal.create(
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
      },
      appCfg.JWT_AUTH_SECRET,
      {
        expiresIn:
          identityAccessToken.accessTokenMaxTTL === 0
            ? undefined
            : identityAccessToken.accessTokenMaxTTL
      }
    );
    return { accessToken, identityUa };
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
    const identityMembershipOrg = await identityOrgDal.findOne({ identityId });
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
    const reformattedClientSecretTrustedIps = clientSecretTrustedIps.map(
      (clientSecretTrustedIp) => {
        // TODO(akhilmhdh-pg): add licence server here
        if (/* !plan.ipAllowlisting && */ clientSecretTrustedIp.ipAddress !== "0.0.0.0/0")
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
      // TODO(akhilmhdh-pg): add licence server here
      if (/* !plan.ipAllowlisting && */ accessTokenTrustedIp.ipAddress !== "0.0.0.0/0")
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

    const identityUa = await universalAuthDal.transaction(async (tx) => {
      const doc = await universalAuthDal.create(
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
      await identityDal.updateById(
        identityMembershipOrg.identityId,
        {
          authMethod: IdentityAuthMethod.Univeral
        },
        tx
      );
      return doc;
    });
    return identityUa;
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
    const identityMembershipOrg = await identityOrgDal.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.Univeral)
      throw new BadRequestError({
        message: "Failed to updated universal auth"
      });

    const uaIdentityAuth = await universalAuthDal.findOne({ identityId });

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
    const reformattedClientSecretTrustedIps = clientSecretTrustedIps?.map(
      (clientSecretTrustedIp) => {
        // TODO(akhilmhdh-pg): add licence server here
        if (/* !plan.ipAllowlisting && */ clientSecretTrustedIp.ipAddress !== "0.0.0.0/0")
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
      // TODO(akhilmhdh-pg): add licence server here
      if (/* !plan.ipAllowlisting && */ accessTokenTrustedIp.ipAddress !== "0.0.0.0/0")
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

    const updatedUaAuth = await universalAuthDal.updateById(uaIdentityAuth.id, {
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
    return updatedUaAuth;
  };

  const getIdentityUa = async ({ identityId, actorId, actor }: TGetUaDTO) => {
    const identityMembershipOrg = await identityOrgDal.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.Univeral)
      throw new BadRequestError({
        message: "The identity does not have universal auth"
      });

    const uaIdentityAuth = await universalAuthDal.findOne({ identityId });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Identity
    );
    return uaIdentityAuth;
  };

  const createUaClientSecret = async ({
    actor,
    actorId,
    identityId,
    ttl,
    description,
    numUsesLimit
  }: TCreateUaClientSecretDTO) => {
    const identityMembershipOrg = await identityOrgDal.findOne({ identityId });
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
    const identityUniversalAuth = await universalAuthDal.findOne({
      identityId
    });

    const identityUaClientSecret = await uaClientSecretDal.create({
      identityUAId: identityUniversalAuth.id,
      description,
      clientSecretPrefix: clientSecret.slice(0, 4),
      clientSecretHash,
      clientSecretNumUses: 0,
      clientSecretNumUsesLimit: numUsesLimit,
      clientSecretTTL: ttl,
      isClientSecretRevoked: false
    });
    return { clientSecret: identityUaClientSecret, uaAuth: identityUniversalAuth };
  };

  const getUaClientSecrets = async ({ actor, actorId, identityId }: TGetUaClientSecretsDTO) => {
    const identityMembershipOrg = await identityOrgDal.findOne({ identityId });
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

    const identityUniversalAuth = await universalAuthDal.findOne({
      identityId
    });

    const clientSecrets = await uaClientSecretDal.findOne({
      identityUAId: identityUniversalAuth.id,
      isClientSecretRevoked: false
    });
    return clientSecrets;
  };

  const revokeUaClientSecret = async ({
    identityId,
    actorId,
    actor,
    clientSecretId
  }: TRevokeUaClientSecretDTO) => {
    const identityMembershipOrg = await identityOrgDal.findOne({ identityId });
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

    const clientSecret = await uaClientSecretDal.updateById(clientSecretId, {
      isClientSecretRevoked: true
    });
    return clientSecret;
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
