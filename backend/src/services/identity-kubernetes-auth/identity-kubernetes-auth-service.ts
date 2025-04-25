import { ForbiddenError } from "@casl/ability";
import axios, { AxiosError } from "axios";
import https from "https";
import jwt from "jsonwebtoken";

import { IdentityAuthMethod, TIdentityKubernetesAuthsUpdate } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError, PermissionBoundaryError, UnauthorizedError } from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { validateIdentityUpdateForSuperAdminPrivileges } from "../super-admin/super-admin-fns";
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
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create" | "delete">;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne" | "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TIdentityKubernetesAuthServiceFactory = ReturnType<typeof identityKubernetesAuthServiceFactory>;

export const identityKubernetesAuthServiceFactory = ({
  identityKubernetesAuthDAL,
  identityOrgMembershipDAL,
  identityAccessTokenDAL,
  permissionService,
  licenseService,
  kmsService
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
    if (!identityMembershipOrg) {
      throw new NotFoundError({
        message: `Identity organization membership for identity with ID '${identityKubernetesAuth.identityId}' not found`
      });
    }

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.orgId
    });

    let caCert = "";
    if (identityKubernetesAuth.encryptedKubernetesCaCertificate) {
      caCert = decryptor({ cipherTextBlob: identityKubernetesAuth.encryptedKubernetesCaCertificate }).toString();
    }

    let tokenReviewerJwt = "";
    if (identityKubernetesAuth.encryptedKubernetesTokenReviewerJwt) {
      tokenReviewerJwt = decryptor({
        cipherTextBlob: identityKubernetesAuth.encryptedKubernetesTokenReviewerJwt
      }).toString();
    } else {
      // if no token reviewer is provided means the incoming token has to act as reviewer
      tokenReviewerJwt = serviceAccountJwt;
    }

    const { data } = await axios
      .post<TCreateTokenReviewResponse>(
        `${identityKubernetesAuth.kubernetesHost}/apis/authentication.k8s.io/v1/tokenreviews`,
        {
          apiVersion: "authentication.k8s.io/v1",
          kind: "TokenReview",
          spec: {
            token: serviceAccountJwt,
            ...(identityKubernetesAuth.allowedAudience ? { audiences: [identityKubernetesAuth.allowedAudience] } : {})
          }
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokenReviewerJwt}`
          },
          signal: AbortSignal.timeout(10000),
          timeout: 10000,
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
          accessTokenNumUsesLimit: identityKubernetesAuth.accessTokenNumUsesLimit,
          authMethod: IdentityAuthMethod.KUBERNETES_AUTH
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
      // akhilmhdh: for non-expiry tokens you should not even set the value, including undefined. Even for undefined jsonwebtoken throws error
      Number(identityAccessToken.accessTokenTTL) === 0
        ? undefined
        : {
            expiresIn: Number(identityAccessToken.accessTokenTTL)
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
    actorOrgId,
    isActorSuperAdmin
  }: TAttachKubernetesAuthDTO) => {
    await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.KUBERNETES_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add Kubernetes Auth to already configured identity"
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

    const identityKubernetesAuth = await identityKubernetesAuthDAL.transaction(async (tx) => {
      const doc = await identityKubernetesAuthDAL.create(
        {
          identityId: identityMembershipOrg.identityId,
          kubernetesHost,
          allowedNamespaces,
          allowedNames,
          allowedAudience,
          accessTokenMaxTTL,
          accessTokenTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps: JSON.stringify(reformattedAccessTokenTrustedIps),
          encryptedKubernetesTokenReviewerJwt: tokenReviewerJwt
            ? encryptor({ plainText: Buffer.from(tokenReviewerJwt) }).cipherTextBlob
            : null,
          encryptedKubernetesCaCertificate: encryptor({ plainText: Buffer.from(caCert) }).cipherTextBlob
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
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.KUBERNETES_AUTH)) {
      throw new BadRequestError({
        message: "Failed to update Kubernetes Auth"
      });
    }

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

    const { encryptor, decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.orgId
    });

    if (caCert !== undefined) {
      updateQuery.encryptedKubernetesCaCertificate = encryptor({ plainText: Buffer.from(caCert) }).cipherTextBlob;
    }

    if (tokenReviewerJwt) {
      updateQuery.encryptedKubernetesTokenReviewerJwt = encryptor({
        plainText: Buffer.from(tokenReviewerJwt)
      }).cipherTextBlob;
    } else if (tokenReviewerJwt === null) {
      updateQuery.encryptedKubernetesTokenReviewerJwt = null;
    }

    const updatedKubernetesAuth = await identityKubernetesAuthDAL.updateById(identityKubernetesAuth.id, updateQuery);

    const updatedCACert = updatedKubernetesAuth.encryptedKubernetesCaCertificate
      ? decryptor({
          cipherTextBlob: updatedKubernetesAuth.encryptedKubernetesCaCertificate
        }).toString()
      : "";

    const updatedTokenReviewerJwt = updatedKubernetesAuth.encryptedKubernetesTokenReviewerJwt
      ? decryptor({
          cipherTextBlob: updatedKubernetesAuth.encryptedKubernetesTokenReviewerJwt
        }).toString()
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
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    const identityKubernetesAuth = await identityKubernetesAuthDAL.findOne({ identityId });
    if (!identityKubernetesAuth) {
      throw new NotFoundError({ message: `Failed to find Kubernetes Auth for identity with ID ${identityId}` });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.KUBERNETES_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Kubernetes Auth attached"
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

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.orgId
    });

    let caCert = "";
    if (identityKubernetesAuth.encryptedKubernetesCaCertificate) {
      caCert = decryptor({ cipherTextBlob: identityKubernetesAuth.encryptedKubernetesCaCertificate }).toString();
    }

    let tokenReviewerJwt = "";
    if (identityKubernetesAuth.encryptedKubernetesTokenReviewerJwt) {
      tokenReviewerJwt = decryptor({
        cipherTextBlob: identityKubernetesAuth.encryptedKubernetesTokenReviewerJwt
      }).toString();
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
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.KUBERNETES_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have kubernetes auth"
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
          "Failed to revoke kubernetes auth of identity with more privileged role",
          membership.shouldUseNewPrivilegeSystem,
          OrgPermissionIdentityActions.RevokeAuth,
          OrgPermissionSubjects.Identity
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });

    const revokedIdentityKubernetesAuth = await identityKubernetesAuthDAL.transaction(async (tx) => {
      const deletedKubernetesAuth = await identityKubernetesAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({ identityId, authMethod: IdentityAuthMethod.KUBERNETES_AUTH }, tx);
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
