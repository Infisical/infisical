import { ForbiddenError } from "@casl/ability";
import axios, { AxiosError } from "axios";
import https from "https";
import RE2 from "re2";

import { IdentityAuthMethod, TIdentityKubernetesAuthsUpdate } from "@app/db/schemas";
import { TGatewayDALFactory } from "@app/ee/services/gateway/gateway-dal";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2DALFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TOrgDALFactory } from "../org/org-dal";
import {
  OrgPermissionGatewayActions,
  OrgPermissionIdentityActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, NotFoundError, PermissionBoundaryError, UnauthorizedError } from "@app/lib/errors";
import { GatewayHttpProxyActions, GatewayProxyProtocol, withGatewayProxy } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";
import { logger } from "@app/lib/logger";

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
  IdentityKubernetesAuthTokenReviewMode,
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
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne" | "findById" | "updateById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  gatewayService: TGatewayServiceFactory;
  gatewayV2Service: TGatewayV2ServiceFactory;
  gatewayDAL: Pick<TGatewayDALFactory, "find">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "find">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
};

export type TIdentityKubernetesAuthServiceFactory = ReturnType<typeof identityKubernetesAuthServiceFactory>;

const GATEWAY_AUTH_DEFAULT_HOST = "https://kubernetes.default.svc.cluster.local";

export const identityKubernetesAuthServiceFactory = ({
  identityKubernetesAuthDAL,
  identityOrgMembershipDAL,
  identityAccessTokenDAL,
  permissionService,
  licenseService,
  gatewayService,
  gatewayV2Service,
  gatewayDAL,
  gatewayV2DAL,
  kmsService,
  orgDAL
}: TIdentityKubernetesAuthServiceFactoryDep) => {
  const $gatewayProxyWrapper = async <T>(
    inputs: {
      gatewayId: string;
      targetHost?: string;
      targetPort?: number;
      caCert?: string;
      reviewTokenThroughGateway: boolean;
    },
    gatewayCallback: (host: string, port: number, httpsAgent?: https.Agent) => Promise<T>
  ): Promise<T> => {
    const gatewayV2ConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId: inputs.gatewayId,
      targetHost: inputs.targetHost ?? GATEWAY_AUTH_DEFAULT_HOST,
      targetPort: inputs.targetPort ?? 443
    });

    if (gatewayV2ConnectionDetails) {
      let httpsAgent: https.Agent | undefined;
      if (!inputs.reviewTokenThroughGateway) {
        httpsAgent = new https.Agent({
          ca: inputs.caCert,
          rejectUnauthorized: Boolean(inputs.caCert)
        });
      }

      const callbackResult = await withGatewayV2Proxy(
        async (port) => {
          const res = await gatewayCallback(
            inputs.reviewTokenThroughGateway ? "http://localhost" : "https://localhost",
            port,
            httpsAgent
          );
          return res;
        },
        {
          protocol: inputs.reviewTokenThroughGateway ? GatewayProxyProtocol.Http : GatewayProxyProtocol.Tcp,
          relayHost: gatewayV2ConnectionDetails.relayHost,
          gateway: gatewayV2ConnectionDetails.gateway,
          relay: gatewayV2ConnectionDetails.relay,
          httpsAgent
        }
      );

      return callbackResult;
    }

    const relayDetails = await gatewayService.fnGetGatewayClientTlsByGatewayId(inputs.gatewayId);
    const [relayHost, relayPort] = relayDetails.relayAddress.split(":");

    const callbackResult = await withGatewayProxy(
      async (port, httpsAgent) => {
        const res = await gatewayCallback(
          inputs.reviewTokenThroughGateway ? "http://localhost" : "https://localhost",
          port,
          httpsAgent
        );
        return res;
      },
      {
        protocol: inputs.reviewTokenThroughGateway ? GatewayProxyProtocol.Http : GatewayProxyProtocol.Tcp,
        targetHost: inputs.targetHost,
        targetPort: inputs.targetPort,
        relayHost,
        relayPort: Number(relayPort),
        identityId: relayDetails.identityId,
        orgId: relayDetails.orgId,
        tlsOptions: {
          ca: relayDetails.certChain,
          cert: relayDetails.certificate,
          key: relayDetails.privateKey.toString()
        },
        // only needed for TCP protocol, because the gateway as reviewer will use the pod's CA cert for auth directly
        ...(!inputs.reviewTokenThroughGateway
          ? {
              httpsAgent: new https.Agent({
                ca: inputs.caCert,
                rejectUnauthorized: Boolean(inputs.caCert)
              })
            }
          : {})
      }
    );

    return callbackResult;
  };

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

    const tokenReviewCallbackRaw = async (host = identityKubernetesAuth.kubernetesHost, port?: number) => {
      logger.info({ host, port }, "tokenReviewCallbackRaw: Processing kubernetes token review using raw API");

      if (!host || !identityKubernetesAuth.kubernetesHost) {
        throw new BadRequestError({
          message: "Kubernetes host is required when token review mode is set to API"
        });
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

      let servername = identityKubernetesAuth.kubernetesHost;
      if (servername.startsWith("https://") || servername.startsWith("http://")) {
        servername = new RE2("^https?:\\/\\/").replace(servername, "");
      }

      // get the last colon index, if it has a port, remove it, including the colon
      const lastColonIndex = servername.lastIndexOf(":");
      if (lastColonIndex !== -1) {
        servername = servername.substring(0, lastColonIndex);
      }

      const baseUrl = port ? `${host}:${port}` : host;

      const res = await axios
        .post<TCreateTokenReviewResponse>(
          `${baseUrl}/apis/authentication.k8s.io/v1/tokenreviews`,
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
            httpsAgent: new https.Agent({
              ca: caCert,
              rejectUnauthorized: Boolean(caCert),
              servername
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

      return res.data;
    };

    const tokenReviewCallbackThroughGateway = async (host: string, port?: number) => {
      logger.info(
        {
          host,
          port
        },
        "tokenReviewCallbackThroughGateway: Processing kubernetes token review using gateway"
      );

      const res = await axios
        .post<TCreateTokenReviewResponse>(
          `${host}:${port}/apis/authentication.k8s.io/v1/tokenreviews`,
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
              "x-infisical-action": GatewayHttpProxyActions.UseGatewayK8sServiceAccount
            },
            signal: AbortSignal.timeout(10000),
            timeout: 10000
          }
        )
        .catch((err) => {
          if (err instanceof AxiosError) {
            if (err.response) {
              let { message } = err?.response?.data as unknown as { message?: string };

              if (!message && typeof err.response.data === "string") {
                message = err.response.data;
              }

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

      return res.data;
    };

    let data: TCreateTokenReviewResponse | undefined;

    if (identityKubernetesAuth.tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Gateway) {
      if (!identityKubernetesAuth.gatewayId && !identityKubernetesAuth.gatewayV2Id) {
        throw new BadRequestError({
          message: "Gateway ID is required when token review mode is set to Gateway"
        });
      }

      data = await $gatewayProxyWrapper(
        {
          gatewayId: (identityKubernetesAuth.gatewayV2Id ?? identityKubernetesAuth.gatewayId) as string,
          reviewTokenThroughGateway: true
        },
        tokenReviewCallbackThroughGateway
      );
    } else if (identityKubernetesAuth.tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api) {
      if (!identityKubernetesAuth.kubernetesHost) {
        throw new BadRequestError({
          message: "Kubernetes host is required when token review mode is set to API"
        });
      }

      let { kubernetesHost } = identityKubernetesAuth;
      if (kubernetesHost.startsWith("https://") || kubernetesHost.startsWith("http://")) {
        kubernetesHost = new RE2("^https?:\\/\\/").replace(kubernetesHost, "");
      }

      const [k8sHost, k8sPort] = kubernetesHost.split(":");

      data =
        identityKubernetesAuth.gatewayId || identityKubernetesAuth.gatewayV2Id
          ? await $gatewayProxyWrapper(
              {
                gatewayId: (identityKubernetesAuth.gatewayV2Id ?? identityKubernetesAuth.gatewayId) as string,
                targetHost: k8sHost,
                targetPort: k8sPort ? Number(k8sPort) : 443,
                reviewTokenThroughGateway: false
              },
              tokenReviewCallbackRaw
            )
          : await tokenReviewCallbackRaw();
    } else {
      throw new BadRequestError({
        message: `Invalid token review mode: ${identityKubernetesAuth.tokenReviewMode}`
      });
    }

    if (!data) {
      throw new BadRequestError({
        message: "Failed to review token"
      });
    }

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
      await identityOrgMembershipDAL.updateById(
        identityMembershipOrg.id,
        {
          lastLoginAuthMethod: IdentityAuthMethod.KUBERNETES_AUTH,
          lastLoginTime: new Date()
        },
        tx
      );
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
    const accessToken = crypto.jwt().sign(
      {
        identityId: identityKubernetesAuth.identityId,
        identityAccessTokenId: identityAccessToken.id,
        authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN,
        identityAuth: {
          kubernetes: {
            namespace: targetNamespace,
            name: targetName
          }
        }
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
    gatewayId,
    kubernetesHost,
    caCert,
    tokenReviewerJwt,
    tokenReviewMode,
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

    let isGatewayV1 = true;
    if (gatewayId) {
      const [gateway] = await gatewayDAL.find({ id: gatewayId, orgId: identityMembershipOrg.orgId });
      const [gatewayV2] = await gatewayV2DAL.find({ id: gatewayId, orgId: identityMembershipOrg.orgId });
      if (!gateway && !gatewayV2) {
        throw new NotFoundError({
          message: `Gateway with ID ${gatewayId} not found`
        });
      }

      if (!gateway) {
        isGatewayV1 = false;
      }

      const { permission: orgPermission } = await permissionService.getOrgPermission(
        actor,
        actorId,
        identityMembershipOrg.orgId,
        actorAuthMethod,
        actorOrgId
      );
      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionGatewayActions.AttachGateways,
        OrgPermissionSubjects.Gateway
      );
    }

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.orgId
    });

    const identityKubernetesAuth = await identityKubernetesAuthDAL.transaction(async (tx) => {
      const doc = await identityKubernetesAuthDAL.create(
        {
          identityId: identityMembershipOrg.identityId,
          kubernetesHost,
          tokenReviewMode,
          allowedNamespaces,
          allowedNames,
          allowedAudience,
          accessTokenMaxTTL,
          accessTokenTTL,
          accessTokenNumUsesLimit,
          gatewayId: isGatewayV1 ? gatewayId : null,
          gatewayV2Id: isGatewayV1 ? null : gatewayId,
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
    tokenReviewMode,
    allowedNamespaces,
    allowedNames,
    allowedAudience,
    gatewayId,
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

    let isGatewayV1 = true;
    if (gatewayId) {
      const [gateway] = await gatewayDAL.find({ id: gatewayId, orgId: identityMembershipOrg.orgId });
      const [gatewayV2] = await gatewayV2DAL.find({ id: gatewayId, orgId: identityMembershipOrg.orgId });

      if (!gateway && !gatewayV2) {
        throw new NotFoundError({
          message: `Gateway with ID ${gatewayId} not found`
        });
      }

      if (!gateway) {
        isGatewayV1 = false;
      }

      const { permission: orgPermission } = await permissionService.getOrgPermission(
        actor,
        actorId,
        identityMembershipOrg.orgId,
        actorAuthMethod,
        actorOrgId
      );
      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionGatewayActions.AttachGateways,
        OrgPermissionSubjects.Gateway
      );
    }

    const shouldUpdateGatewayId = Boolean(gatewayId);
    const gatewayIdValue = isGatewayV1 ? gatewayId : null;
    const gatewayV2IdValue = isGatewayV1 ? null : gatewayId;

    const updateQuery: TIdentityKubernetesAuthsUpdate = {
      kubernetesHost,
      tokenReviewMode,
      allowedNamespaces,
      allowedNames,
      allowedAudience,
      gatewayId: shouldUpdateGatewayId ? gatewayIdValue : undefined,
      gatewayV2Id: shouldUpdateGatewayId ? gatewayV2IdValue : undefined,
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

    return {
      ...identityKubernetesAuth,
      caCert,
      tokenReviewerJwt,
      orgId: identityMembershipOrg.orgId,
      gatewayId: identityKubernetesAuth.gatewayId ?? identityKubernetesAuth.gatewayV2Id
    };
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
          "Failed to revoke kubernetes auth of identity with more privileged role",
          shouldUseNewPrivilegeSystem,
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
