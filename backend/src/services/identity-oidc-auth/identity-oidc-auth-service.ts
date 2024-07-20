import { ForbiddenError } from "@casl/ability";
import axios from "axios";
import https from "https";
import jwt from "jsonwebtoken";
import { JwksClient } from "jwks-rsa";

import { IdentityAuthMethod, SecretKeyEncoding, TIdentityOidcAuthsUpdate } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { getConfig } from "@app/lib/config/env";
import { generateAsymmetricKeyPair } from "@app/lib/crypto";
import {
  decryptSymmetric,
  encryptSymmetric,
  generateSymmetricKey,
  infisicalSymmetricDecrypt,
  infisicalSymmetricEncypt
} from "@app/lib/crypto/encryption";
import { BadRequestError, ForbiddenRequestError, UnauthorizedError } from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { TOrgBotDALFactory } from "../org/org-bot-dal";
import { TIdentityOidcAuthDALFactory } from "./identity-oidc-auth-dal";
import {
  TAttachOidcAuthDTO,
  TGetOidcAuthDTO,
  TLoginOidcAuthDTO,
  TRevokeOidcAuthDTO,
  TUpdateOidcAuthDTO
} from "./identity-oidc-auth-types";

type TIdentityOidcAuthServiceFactoryDep = {
  identityOidcAuthDAL: TIdentityOidcAuthDALFactory;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create">;
  identityDAL: Pick<TIdentityDALFactory, "updateById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  orgBotDAL: Pick<TOrgBotDALFactory, "findOne" | "transaction" | "create">;
};

export type TIdentityOidcAuthServiceFactory = ReturnType<typeof identityOidcAuthServiceFactory>;

export const identityOidcAuthServiceFactory = ({
  identityOidcAuthDAL,
  identityOrgMembershipDAL,
  identityDAL,
  permissionService,
  licenseService,
  identityAccessTokenDAL,
  orgBotDAL
}: TIdentityOidcAuthServiceFactoryDep) => {
  const login = async ({ identityId, jwt: oidcJwt }: TLoginOidcAuthDTO) => {
    const identityOidcAuth = await identityOidcAuthDAL.findOne({ identityId });
    if (!identityOidcAuth) {
      throw new UnauthorizedError();
    }

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({
      identityId: identityOidcAuth.identityId
    });
    if (!identityMembershipOrg) {
      throw new BadRequestError({ message: "Failed to find identity" });
    }

    const orgBot = await orgBotDAL.findOne({ orgId: identityMembershipOrg.orgId });
    if (!orgBot) {
      throw new BadRequestError({ message: "Org bot not found", name: "OrgBotNotFound" });
    }

    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    const { encryptedCaCert, caCertIV, caCertTag } = identityOidcAuth;

    let caCert = "";
    if (encryptedCaCert && caCertIV && caCertTag) {
      caCert = decryptSymmetric({
        ciphertext: encryptedCaCert,
        iv: caCertIV,
        tag: caCertTag,
        key
      });
    }

    const requestAgent = new https.Agent({ ca: caCert, rejectUnauthorized: !!caCert });
    const { data: discoveryDoc } = await axios.get<{ jwks_uri: string }>(
      `${identityOidcAuth.oidcDiscoveryUrl}/.well-known/openid-configuration`,
      {
        httpsAgent: requestAgent
      }
    );
    const jwksUri = discoveryDoc.jwks_uri;

    const decodedToken = jwt.decode(oidcJwt, { complete: true });
    if (!decodedToken) {
      throw new BadRequestError({
        message: "Invalid JWT"
      });
    }

    const client = new JwksClient({
      jwksUri,
      requestAgent
    });

    const { kid } = decodedToken.header;
    const oidcSigningKey = await client.getSigningKey(kid);

    const tokenData = jwt.verify(oidcJwt, oidcSigningKey.getPublicKey(), {
      issuer: identityOidcAuth.boundIssuer
    }) as Record<string, string>;

    if (identityOidcAuth.boundSubject) {
      if (tokenData.sub !== identityOidcAuth.boundSubject) {
        throw new ForbiddenRequestError({
          message: "Access denied: OIDC subject not allowed."
        });
      }
    }

    if (identityOidcAuth.boundAudiences) {
      if (!identityOidcAuth.boundAudiences.split(", ").includes(tokenData.aud)) {
        throw new ForbiddenRequestError({
          message: "Access denied: OIDC audience not allowed."
        });
      }
    }

    if (identityOidcAuth.boundClaims) {
      Object.keys(identityOidcAuth.boundClaims).forEach((claimKey) => {
        const claimValue = (identityOidcAuth.boundClaims as Record<string, string>)[claimKey];
        // handle both single and multi-valued claims
        if (!claimValue.split(", ").some((claimEntry) => tokenData[claimKey] === claimEntry)) {
          throw new ForbiddenRequestError({
            message: "Access denied: OIDC claim not allowed."
          });
        }
      });
    }

    const identityAccessToken = await identityOidcAuthDAL.transaction(async (tx) => {
      const newToken = await identityAccessTokenDAL.create(
        {
          identityId: identityOidcAuth.identityId,
          isAccessTokenRevoked: false,
          accessTokenTTL: identityOidcAuth.accessTokenTTL,
          accessTokenMaxTTL: identityOidcAuth.accessTokenMaxTTL,
          accessTokenNumUses: 0,
          accessTokenNumUsesLimit: identityOidcAuth.accessTokenNumUsesLimit
        },
        tx
      );
      return newToken;
    });

    const appCfg = getConfig();
    const accessToken = jwt.sign(
      {
        identityId: identityOidcAuth.identityId,
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

    return { accessToken, identityOidcAuth, identityAccessToken, identityMembershipOrg };
  };

  const attachOidcAuth = async ({
    identityId,
    oidcDiscoveryUrl,
    caCert,
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
  }: TAttachOidcAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) {
      throw new BadRequestError({ message: "Failed to find identity" });
    }
    if (identityMembershipOrg.identity.authMethod)
      throw new BadRequestError({
        message: "Failed to add OIDC Auth to already configured identity"
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

    const { ciphertext: encryptedCaCert, iv: caCertIV, tag: caCertTag } = encryptSymmetric(caCert, key);

    const identityOidcAuth = await identityOidcAuthDAL.transaction(async (tx) => {
      const doc = await identityOidcAuthDAL.create(
        {
          identityId: identityMembershipOrg.identityId,
          oidcDiscoveryUrl,
          encryptedCaCert,
          caCertIV,
          caCertTag,
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
      await identityDAL.updateById(
        identityMembershipOrg.identityId,
        {
          authMethod: IdentityAuthMethod.OIDC_AUTH
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
    if (!identityMembershipOrg) {
      throw new BadRequestError({ message: "Failed to find identity" });
    }

    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.OIDC_AUTH) {
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

    const updateQuery: TIdentityOidcAuthsUpdate = {
      oidcDiscoveryUrl,
      boundIssuer,
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

    const orgBot = await orgBotDAL.findOne({ orgId: identityMembershipOrg.orgId });
    if (!orgBot) {
      throw new BadRequestError({ message: "Org bot not found", name: "OrgBotNotFound" });
    }

    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    if (caCert !== undefined) {
      const { ciphertext: encryptedCACert, iv: caCertIV, tag: caCertTag } = encryptSymmetric(caCert, key);
      updateQuery.encryptedCaCert = encryptedCACert;
      updateQuery.caCertIV = caCertIV;
      updateQuery.caCertTag = caCertTag;
    }

    const updatedOidcAuth = await identityOidcAuthDAL.updateById(identityOidcAuth.id, updateQuery);
    const updatedCACert =
      updatedOidcAuth.encryptedCaCert && updatedOidcAuth.caCertIV && updatedOidcAuth.caCertTag
        ? decryptSymmetric({
            ciphertext: updatedOidcAuth.encryptedCaCert,
            iv: updatedOidcAuth.caCertIV,
            tag: updatedOidcAuth.caCertTag,
            key
          })
        : "";

    return {
      ...updatedOidcAuth,
      orgId: identityMembershipOrg.orgId,
      caCert: updatedCACert
    };
  };

  const getOidcAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetOidcAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) {
      throw new BadRequestError({ message: "Failed to find identity" });
    }

    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.OIDC_AUTH) {
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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Identity);

    const identityOidcAuth = await identityOidcAuthDAL.findOne({ identityId });

    const orgBot = await orgBotDAL.findOne({ orgId: identityMembershipOrg.orgId });
    if (!orgBot) {
      throw new BadRequestError({ message: "Org bot not found", name: "OrgBotNotFound" });
    }

    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    const caCert = decryptSymmetric({
      ciphertext: identityOidcAuth.encryptedCaCert,
      iv: identityOidcAuth.caCertIV,
      tag: identityOidcAuth.caCertTag,
      key
    });

    return { ...identityOidcAuth, orgId: identityMembershipOrg.orgId, caCert };
  };

  const revokeOidcAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TRevokeOidcAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) {
      throw new BadRequestError({ message: "Failed to find identity" });
    }

    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.OIDC_AUTH) {
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

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Identity);

    const { permission: rolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      identityMembershipOrg.identityId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );

    const hasPriviledge = isAtLeastAsPrivileged(permission, rolePermission);
    if (!hasPriviledge) {
      throw new ForbiddenRequestError({
        message: "Failed to revoke OIDC auth of identity with more privileged role"
      });
    }

    const revokedIdentityOidcAuth = await identityOidcAuthDAL.transaction(async (tx) => {
      const deletedOidcAuth = await identityOidcAuthDAL.delete({ identityId }, tx);
      await identityDAL.updateById(identityId, { authMethod: null }, tx);
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
