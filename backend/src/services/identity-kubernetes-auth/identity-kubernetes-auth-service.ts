import { ForbiddenError } from "@casl/ability";
import axios, { AxiosError } from "axios";
import https from "https";
import jwt from "jsonwebtoken";

import { IdentityAuthMethod, SecretKeyEncoding, TIdentityKubernetesAuthsUpdate } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { getConfig } from "@app/lib/config/env";
import {
  decryptSymmetric,
  encryptSymmetric,
  generateAsymmetricKeyPair,
  generateSymmetricKey,
  infisicalSymmetricDecrypt,
  infisicalSymmetricEncypt
} from "@app/lib/crypto/encryption";
import { BadRequestError, ForbiddenRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";
import { TOrgBotDALFactory } from "@app/services/org/org-bot-dal";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { TIdentityKubernetesAuthDALFactory } from "./identity-kubernetes-auth-dal";
import { extractK8sUsername } from "./identity-kubernetes-auth-fns";
import {
  TAttachKubernetesAuthDTO,
  TCreateTokenReviewResponse,
  TGetKubernetesAuthDTO,
  TLoginKubernetesAuthDTO,
  TRevokeKubernetesAuthDTO,
  TUpdateKubernetesAuthDTO
} from "./identity-kubernetes-auth-types";

type TIdentityKubernetesAuthServiceFactoryDep = {
  identityKubernetesAuthDAL: Pick<
    TIdentityKubernetesAuthDALFactory,
    "create" | "findOne" | "transaction" | "updateById" | "delete"
  >;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create">;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne" | "findById">;
  identityDAL: Pick<TIdentityDALFactory, "updateById">;
  orgBotDAL: Pick<TOrgBotDALFactory, "findOne" | "transaction" | "create">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TIdentityKubernetesAuthServiceFactory = ReturnType<typeof identityKubernetesAuthServiceFactory>;

export const identityKubernetesAuthServiceFactory = ({
  identityKubernetesAuthDAL,
  identityOrgMembershipDAL,
  identityAccessTokenDAL,
  identityDAL,
  orgBotDAL,
  permissionService,
  licenseService
}: TIdentityKubernetesAuthServiceFactoryDep) => {
  const login = async ({ identityId, jwt: serviceAccountJwt }: TLoginKubernetesAuthDTO) => {
    const identityKubernetesAuth = await identityKubernetesAuthDAL.findOne({ identityId });
    if (!identityKubernetesAuth) {
      throw new NotFoundError({
        message: "Kubernetes auth method not found for identity, did you configure Kubernetes auth?"
      });
    }

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({
      identityId: identityKubernetesAuth.identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Identity organization membership not found" });

    const orgBot = await orgBotDAL.findOne({ orgId: identityMembershipOrg.orgId });
    if (!orgBot) throw new NotFoundError({ message: "Organization bot not found", name: "OrgBotNotFound" });

    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    const { encryptedCaCert, caCertIV, caCertTag, encryptedTokenReviewerJwt, tokenReviewerJwtIV, tokenReviewerJwtTag } =
      identityKubernetesAuth;

    let caCert = "";
    if (encryptedCaCert && caCertIV && caCertTag) {
      caCert = decryptSymmetric({
        ciphertext: encryptedCaCert,
        iv: caCertIV,
        tag: caCertTag,
        key
      });
    }

    let tokenReviewerJwt = "";
    if (encryptedTokenReviewerJwt && tokenReviewerJwtIV && tokenReviewerJwtTag) {
      tokenReviewerJwt = decryptSymmetric({
        ciphertext: encryptedTokenReviewerJwt,
        iv: tokenReviewerJwtIV,
        tag: tokenReviewerJwtTag,
        key
      });
    }

    const { data } = await axios
      .post<TCreateTokenReviewResponse>(
        `${identityKubernetesAuth.kubernetesHost}/apis/authentication.k8s.io/v1/tokenreviews`,
        {
          apiVersion: "authentication.k8s.io/v1",
          kind: "TokenReview",
          spec: {
            token: serviceAccountJwt
          }
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokenReviewerJwt}`
          },

          // if ca cert, rejectUnauthorized: true
          httpsAgent: new https.Agent({
            ca: caCert,
            rejectUnauthorized: !!caCert
          })
        }
      )
      .catch((err) => {
        if (err instanceof AxiosError) {
          if (err.response) {
            const { message } = err?.response?.data as unknown as { message?: string };

            if (message) {
              throw new UnauthorizedError({
                message,
                name: "KubernetesTokenReviewRequestError"
              });
            }
          }
        }
        throw err;
      });

    if ("error" in data.status)
      throw new UnauthorizedError({ message: data.status.error, name: "KubernetesTokenReviewError" });

    // check the response to determine if the token is valid
    if (!(data.status && data.status.authenticated))
      throw new UnauthorizedError({
        message: "Kubernetes token not authenticated",
        name: "KubernetesTokenReviewError"
      });

    const { namespace: targetNamespace, name: targetName } = extractK8sUsername(data.status.user.username);

    if (identityKubernetesAuth.allowedNamespaces) {
      // validate if [targetNamespace] is in the list of allowed namespaces

      const isNamespaceAllowed = identityKubernetesAuth.allowedNamespaces
        .split(",")
        .map((namespace) => namespace.trim())
        .some((namespace) => namespace === targetNamespace);

      if (!isNamespaceAllowed)
        throw new UnauthorizedError({
          message: "Access denied: K8s namespace not allowed."
        });
    }

    if (identityKubernetesAuth.allowedNames) {
      // validate if [targetName] is in the list of allowed names

      const isNameAllowed = identityKubernetesAuth.allowedNames
        .split(",")
        .map((name) => name.trim())
        .some((name) => name === targetName);

      if (!isNameAllowed)
        throw new UnauthorizedError({
          message: "Access denied: K8s name not allowed."
        });
    }

    if (identityKubernetesAuth.allowedAudience) {
      // validate if [audience] is in the list of allowed audiences
      const isAudienceAllowed = data.status.audiences.some(
        (audience) => audience === identityKubernetesAuth.allowedAudience
      );

      if (!isAudienceAllowed)
        throw new UnauthorizedError({
          message: "Access denied: K8s audience not allowed."
        });
    }

    const identityAccessToken = await identityKubernetesAuthDAL.transaction(async (tx) => {
      const newToken = await identityAccessTokenDAL.create(
        {
          identityId: identityKubernetesAuth.identityId,
          isAccessTokenRevoked: false,
          accessTokenTTL: identityKubernetesAuth.accessTokenTTL,
          accessTokenMaxTTL: identityKubernetesAuth.accessTokenMaxTTL,
          accessTokenNumUses: 0,
          accessTokenNumUsesLimit: identityKubernetesAuth.accessTokenNumUsesLimit
        },
        tx
      );
      return newToken;
    });

    const appCfg = getConfig();
    const accessToken = jwt.sign(
      {
        identityId: identityKubernetesAuth.identityId,
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

    return { accessToken, identityKubernetesAuth, identityAccessToken, identityMembershipOrg };
  };

  const attachKubernetesAuth = async ({
    identityId,
    kubernetesHost,
    caCert,
    tokenReviewerJwt,
    allowedNamespaces,
    allowedNames,
    allowedAudience,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TAttachKubernetesAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity.authMethod)
      throw new BadRequestError({
        message: "Failed to add Kubernetes Auth to already configured identity"
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
    const {
      ciphertext: encryptedTokenReviewerJwt,
      iv: tokenReviewerJwtIV,
      tag: tokenReviewerJwtTag
    } = encryptSymmetric(tokenReviewerJwt, key);

    const identityKubernetesAuth = await identityKubernetesAuthDAL.transaction(async (tx) => {
      const doc = await identityKubernetesAuthDAL.create(
        {
          identityId: identityMembershipOrg.identityId,
          kubernetesHost,
          encryptedCaCert,
          caCertIV,
          caCertTag,
          encryptedTokenReviewerJwt,
          tokenReviewerJwtIV,
          tokenReviewerJwtTag,
          allowedNamespaces,
          allowedNames,
          allowedAudience,
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
          authMethod: IdentityAuthMethod.KUBERNETES_AUTH
        },
        tx
      );
      return doc;
    });

    return { ...identityKubernetesAuth, caCert, tokenReviewerJwt, orgId: identityMembershipOrg.orgId };
  };

  const updateKubernetesAuth = async ({
    identityId,
    kubernetesHost,
    caCert,
    tokenReviewerJwt,
    allowedNamespaces,
    allowedNames,
    allowedAudience,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateKubernetesAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.KUBERNETES_AUTH)
      throw new BadRequestError({
        message: "Failed to update Kubernetes Auth"
      });

    const identityKubernetesAuth = await identityKubernetesAuthDAL.findOne({ identityId });

    if (
      (accessTokenMaxTTL || identityKubernetesAuth.accessTokenMaxTTL) > 0 &&
      (accessTokenTTL || identityKubernetesAuth.accessTokenMaxTTL) >
        (accessTokenMaxTTL || identityKubernetesAuth.accessTokenMaxTTL)
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

    const updateQuery: TIdentityKubernetesAuthsUpdate = {
      kubernetesHost,
      allowedNamespaces,
      allowedNames,
      allowedAudience,
      accessTokenMaxTTL,
      accessTokenTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps: reformattedAccessTokenTrustedIps
        ? JSON.stringify(reformattedAccessTokenTrustedIps)
        : undefined
    };

    const orgBot = await orgBotDAL.findOne({ orgId: identityMembershipOrg.orgId });
    if (!orgBot) throw new NotFoundError({ message: "Org bot not found", name: "OrgBotNotFound" });

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

    if (tokenReviewerJwt !== undefined) {
      const {
        ciphertext: encryptedTokenReviewerJwt,
        iv: tokenReviewerJwtIV,
        tag: tokenReviewerJwtTag
      } = encryptSymmetric(tokenReviewerJwt, key);
      updateQuery.encryptedTokenReviewerJwt = encryptedTokenReviewerJwt;
      updateQuery.tokenReviewerJwtIV = tokenReviewerJwtIV;
      updateQuery.tokenReviewerJwtTag = tokenReviewerJwtTag;
    }

    const updatedKubernetesAuth = await identityKubernetesAuthDAL.updateById(identityKubernetesAuth.id, updateQuery);

    const updatedCACert =
      updatedKubernetesAuth.encryptedCaCert && updatedKubernetesAuth.caCertIV && updatedKubernetesAuth.caCertTag
        ? decryptSymmetric({
            ciphertext: updatedKubernetesAuth.encryptedCaCert,
            iv: updatedKubernetesAuth.caCertIV,
            tag: updatedKubernetesAuth.caCertTag,
            key
          })
        : "";

    const updatedTokenReviewerJwt =
      updatedKubernetesAuth.encryptedTokenReviewerJwt &&
      updatedKubernetesAuth.tokenReviewerJwtIV &&
      updatedKubernetesAuth.tokenReviewerJwtTag
        ? decryptSymmetric({
            ciphertext: updatedKubernetesAuth.encryptedTokenReviewerJwt,
            iv: updatedKubernetesAuth.tokenReviewerJwtIV,
            tag: updatedKubernetesAuth.tokenReviewerJwtTag,
            key
          })
        : "";

    return {
      ...updatedKubernetesAuth,
      orgId: identityMembershipOrg.orgId,
      caCert: updatedCACert,
      tokenReviewerJwt: updatedTokenReviewerJwt
    };
  };

  const getKubernetesAuth = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TGetKubernetesAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.KUBERNETES_AUTH)
      throw new BadRequestError({
        message: "The identity does not have Kubernetes Auth attached"
      });

    const identityKubernetesAuth = await identityKubernetesAuthDAL.findOne({ identityId });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Identity);

    const orgBot = await orgBotDAL.findOne({ orgId: identityMembershipOrg.orgId });
    if (!orgBot) throw new NotFoundError({ message: "Organization bot not found", name: "OrgBotNotFound" });

    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    const { encryptedCaCert, caCertIV, caCertTag, encryptedTokenReviewerJwt, tokenReviewerJwtIV, tokenReviewerJwtTag } =
      identityKubernetesAuth;

    let caCert = "";
    if (encryptedCaCert && caCertIV && caCertTag) {
      caCert = decryptSymmetric({
        ciphertext: encryptedCaCert,
        iv: caCertIV,
        tag: caCertTag,
        key
      });
    }

    let tokenReviewerJwt = "";
    if (encryptedTokenReviewerJwt && tokenReviewerJwtIV && tokenReviewerJwtTag) {
      tokenReviewerJwt = decryptSymmetric({
        ciphertext: encryptedTokenReviewerJwt,
        iv: tokenReviewerJwtIV,
        tag: tokenReviewerJwtTag,
        key
      });
    }

    return { ...identityKubernetesAuth, caCert, tokenReviewerJwt, orgId: identityMembershipOrg.orgId };
  };

  const revokeIdentityKubernetesAuth = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TRevokeKubernetesAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.KUBERNETES_AUTH)
      throw new BadRequestError({
        message: "The identity does not have kubernetes auth"
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
        message: "Failed to revoke kubernetes auth of identity with more privileged role"
      });

    const revokedIdentityKubernetesAuth = await identityKubernetesAuthDAL.transaction(async (tx) => {
      const deletedKubernetesAuth = await identityKubernetesAuthDAL.delete({ identityId }, tx);
      await identityDAL.updateById(identityId, { authMethod: null }, tx);
      return { ...deletedKubernetesAuth?.[0], orgId: identityMembershipOrg.orgId };
    });
    return revokedIdentityKubernetesAuth;
  };

  return {
    login,
    attachKubernetesAuth,
    updateKubernetesAuth,
    getKubernetesAuth,
    revokeIdentityKubernetesAuth
  };
};
