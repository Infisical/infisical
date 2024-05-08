import { ForbiddenError } from "@casl/ability";
import { iam_v1 } from "googleapis";
import jwt from "jsonwebtoken";

import { IdentityAuthMethod, SecretKeyEncoding, TIdentityGcpAuthsUpdate } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { getConfig } from "@app/lib/config/env";
import {
  decryptSymmetric,
  encryptSymmetric,
  generateAsymmetricKeyPair,
  generateSymmetricKey,
  infisicalSymmetricDecrypt,
  infisicalSymmetricEncypt
} from "@app/lib/crypto/encryption";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";
import { TOrgBotDALFactory } from "@app/services/org/org-bot-dal";

import { AuthTokenType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { TIdentityGcpAuthDALFactory } from "./identity-gcp-auth-dal";
import { validateGceIdentity, validateIamIdentity } from "./identity-gcp-auth-fns";
import {
  TAttachGcpAuthDTO,
  TGcpGceIdTokenPayload,
  TGetGcpAuthDTO,
  TLoginGcpAuthDTO,
  TUpdateGcpAuthDTO
} from "./identity-gcp-auth-types";

type TIdentityGcpAuthServiceFactoryDep = {
  identityGcpAuthDAL: Pick<TIdentityGcpAuthDALFactory, "findOne" | "transaction" | "create" | "updateById">;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create">;
  identityDAL: Pick<TIdentityDALFactory, "updateById">;
  orgBotDAL: Pick<TOrgBotDALFactory, "findOne" | "create" | "transaction">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TIdentityGcpAuthServiceFactory = ReturnType<typeof identityGcpAuthServiceFactory>;

export const identityGcpAuthServiceFactory = ({
  identityGcpAuthDAL,
  identityOrgMembershipDAL,
  identityAccessTokenDAL,
  identityDAL,
  orgBotDAL,
  permissionService,
  licenseService
}: TIdentityGcpAuthServiceFactoryDep) => {
  const login = async ({ identityId, jwt: serviceAccountJwt }: TLoginGcpAuthDTO) => {
    const identityGcpAuth = await identityGcpAuthDAL.findOne({ identityId });
    if (!identityGcpAuth) throw new UnauthorizedError();

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId: identityGcpAuth.identityId });
    if (!identityMembershipOrg) throw new UnauthorizedError();

    const orgBot = await orgBotDAL.findOne({ orgId: identityMembershipOrg.orgId });
    if (!orgBot) throw new BadRequestError({ message: "Org bot not found", name: "OrgBotNotFound" });

    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    const { encryptedCredentials, credentialsIV, credentialsTag } = identityGcpAuth;
    let credentials = "";
    if (encryptedCredentials && credentialsIV && credentialsTag) {
      credentials = decryptSymmetric({
        ciphertext: encryptedCredentials,
        key,
        tag: credentialsTag,
        iv: credentialsIV
      });
    }

    let serviceAccountDetails: iam_v1.Schema$ServiceAccount;
    let gceInstanceDetails: TGcpGceIdTokenPayload | undefined;
    switch (identityGcpAuth.type) {
      case "gce": {
        const gceIdentity = await validateGceIdentity({
          identityId,
          jwt: serviceAccountJwt,
          credentials
        });
        serviceAccountDetails = gceIdentity.serviceAccountDetails;
        gceInstanceDetails = gceIdentity.gceInstanceDetails;
        break;
      }
      case "iam": {
        const iamIdentity = await validateIamIdentity({
          identityId,
          jwt: serviceAccountJwt,
          credentials
        });
        serviceAccountDetails = iamIdentity.serviceAccountDetails;
        break;
      }
      default: {
        throw new BadRequestError({ message: "Invalid GCP Auth type" });
      }
    }

    if (identityGcpAuth.allowedServiceAccounts) {
      // validate if the service account is in the list of allowed service accounts

      const isServiceAccountAllowed = identityGcpAuth.allowedServiceAccounts
        .split(",")
        .map((serviceAccount) => serviceAccount.trim())
        .some(
          (serviceAccount) =>
            serviceAccount === serviceAccountDetails.email || serviceAccount === serviceAccountDetails.uniqueId
        );

      if (!isServiceAccountAllowed) throw new UnauthorizedError();
    }

    if (identityGcpAuth.allowedProjects) {
      // validate if the project that the service account belongs to is in the list of allowed projects

      const isProjectAllowed = identityGcpAuth.allowedProjects
        .split(",")
        .map((project) => project.trim())
        .some((project) => project === serviceAccountDetails.projectId);

      if (!isProjectAllowed) throw new UnauthorizedError();
    }

    if (identityGcpAuth.type === "gce" && gceInstanceDetails && identityGcpAuth.allowedZones) {
      const isZoneAllowed = identityGcpAuth.allowedZones
        .split(",")
        .map((zone) => zone.trim())
        .some((zone) => zone === gceInstanceDetails!.google.compute_engine.zone);

      if (!isZoneAllowed) throw new UnauthorizedError();
    }

    const identityAccessToken = await identityGcpAuthDAL.transaction(async (tx) => {
      const newToken = await identityAccessTokenDAL.create(
        {
          identityId: identityGcpAuth.identityId,
          isAccessTokenRevoked: false,
          accessTokenTTL: identityGcpAuth.accessTokenTTL,
          accessTokenMaxTTL: identityGcpAuth.accessTokenMaxTTL,
          accessTokenNumUses: 0,
          accessTokenNumUsesLimit: identityGcpAuth.accessTokenNumUsesLimit
        },
        tx
      );
      return newToken;
    });

    const appCfg = getConfig();
    const accessToken = jwt.sign(
      {
        identityId: identityGcpAuth.identityId,
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

    return { accessToken, identityGcpAuth, identityAccessToken, identityMembershipOrg };
  };

  const attachGcpAuth = async ({
    identityId,
    credentials,
    type,
    allowedServiceAccounts,
    allowedProjects,
    allowedZones,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TAttachGcpAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity.authMethod)
      throw new BadRequestError({
        message: "Failed to add GCP Auth to already configured identity"
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

    const orgBot = await orgBotDAL.transaction(async (tx) => {
      const doc = await orgBotDAL.findOne({ orgId: identityMembershipOrg.orgId }, tx);
      if (doc) return doc;

      const { privateKey, publicKey } = generateAsymmetricKeyPair();
      const key = generateSymmetricKey();
      const {
        ciphertext: encryptedPrivateKey,
        iv: privateKeyIV,
        tag: privateKeyTag,
        encoding: privateKeyKeyEncoding,
        algorithm: privateKeyAlgorithm
      } = infisicalSymmetricEncypt(privateKey);
      const {
        ciphertext: encryptedSymmetricKey,
        iv: symmetricKeyIV,
        tag: symmetricKeyTag,
        encoding: symmetricKeyKeyEncoding,
        algorithm: symmetricKeyAlgorithm
      } = infisicalSymmetricEncypt(key);

      return orgBotDAL.create(
        {
          name: "Infisical org bot",
          publicKey,
          privateKeyIV,
          encryptedPrivateKey,
          symmetricKeyIV,
          symmetricKeyTag,
          encryptedSymmetricKey,
          symmetricKeyAlgorithm,
          orgId: identityMembershipOrg.orgId,
          privateKeyTag,
          privateKeyAlgorithm,
          privateKeyKeyEncoding,
          symmetricKeyKeyEncoding
        },
        tx
      );
    });

    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    const {
      ciphertext: encryptedCredentials,
      iv: credentialsIV,
      tag: credentialsTag
    } = encryptSymmetric(credentials, key);

    const identityGcpAuth = await identityGcpAuthDAL.transaction(async (tx) => {
      const doc = await identityGcpAuthDAL.create(
        {
          identityId: identityMembershipOrg.identityId,
          type,
          allowedServiceAccounts,
          allowedProjects,
          allowedZones,
          encryptedCredentials,
          credentialsIV,
          credentialsTag,
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
          authMethod: IdentityAuthMethod.GCP_AUTH
        },
        tx
      );
      return doc;
    });
    return { ...identityGcpAuth, credentials, orgId: identityMembershipOrg.orgId };
  };

  const updateGcpAuth = async ({
    identityId,
    type,
    credentials,
    allowedServiceAccounts,
    allowedProjects,
    allowedZones,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateGcpAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.GCP_AUTH)
      throw new BadRequestError({
        message: "Failed to update GCP Auth"
      });

    const identityGcpAuth = await identityGcpAuthDAL.findOne({ identityId });

    if (
      (accessTokenMaxTTL || identityGcpAuth.accessTokenMaxTTL) > 0 &&
      (accessTokenTTL || identityGcpAuth.accessTokenMaxTTL) > (accessTokenMaxTTL || identityGcpAuth.accessTokenMaxTTL)
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

    const updateQuery: TIdentityGcpAuthsUpdate = {
      type,
      allowedServiceAccounts,
      allowedProjects,
      allowedZones,
      accessTokenMaxTTL,
      accessTokenTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps: reformattedAccessTokenTrustedIps
        ? JSON.stringify(reformattedAccessTokenTrustedIps)
        : undefined
    };

    const orgBot = await orgBotDAL.findOne({ orgId: identityMembershipOrg.orgId });
    if (!orgBot) throw new BadRequestError({ message: "Org bot not found", name: "OrgBotNotFound" });
    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    if (credentials !== undefined) {
      const {
        ciphertext: encryptedCredentials,
        iv: credentialsIV,
        tag: credentialsTag
      } = encryptSymmetric(credentials, key);
      updateQuery.encryptedCredentials = encryptedCredentials;
      updateQuery.credentialsIV = credentialsIV;
      updateQuery.credentialsTag = credentialsTag;
    }

    const updatedGcpAuth = await identityGcpAuthDAL.updateById(identityGcpAuth.id, updateQuery);

    return {
      ...updatedGcpAuth,
      credentials: decryptSymmetric({
        ciphertext: updatedGcpAuth.encryptedCredentials,
        iv: updatedGcpAuth.credentialsIV,
        tag: updatedGcpAuth.credentialsTag,
        key
      }),
      orgId: identityMembershipOrg.orgId
    };
  };

  const getGcpAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetGcpAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.GCP_AUTH)
      throw new BadRequestError({
        message: "The identity does not have GCP Auth attached"
      });

    const identityGcpAuth = await identityGcpAuthDAL.findOne({ identityId });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Identity);

    const orgBot = await orgBotDAL.findOne({ orgId: identityMembershipOrg.orgId });
    if (!orgBot) throw new BadRequestError({ message: "Org bot not found", name: "OrgBotNotFound" });

    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    const { encryptedCredentials, credentialsIV, credentialsTag } = identityGcpAuth;
    let credentials = "";
    if (encryptedCredentials && credentialsIV && credentialsTag) {
      credentials = decryptSymmetric({
        ciphertext: encryptedCredentials,
        key,
        tag: credentialsTag,
        iv: credentialsIV
      });
    }

    return { ...identityGcpAuth, credentials, orgId: identityMembershipOrg.orgId };
  };

  return {
    login,
    attachGcpAuth,
    updateGcpAuth,
    getGcpAuth
  };
};
