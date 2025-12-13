import { ForbiddenError, subject } from "@casl/ability";
import { requestContext } from "@fastify/request-context";
import axios, { AxiosError } from "axios";
import https from "https";
import RE2 from "re2";

import {
  AccessScope,
  ActionProjectType,
  IdentityAuthMethod,
  OrganizationActionScope,
  TIdentityKubernetesAuthsUpdate
} from "@app/db/schemas";
import { TGatewayDALFactory } from "@app/ee/services/gateway/gateway-dal";
import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayV2DALFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
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
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import {
  BadRequestError,
  ForbiddenRequestError,
  NotFoundError,
  PermissionBoundaryError,
  UnauthorizedError
} from "@app/lib/errors";
import { GatewayHttpProxyActions, GatewayProxyProtocol, withGatewayProxy } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";
import { logger } from "@app/lib/logger";
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
import { TIdentityKubernetesAuthDALFactory } from "./identity-kubernetes-auth-dal";
import { handleAxiosError, isKnownError, KubernetesAuthErrorContext } from "./identity-kubernetes-auth-error-handlers";
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
import {
  validateKubernetesHostConnectivity,
  validateTokenReviewerJwtPermissions
} from "./identity-kubernetes-auth-validators";

type TIdentityKubernetesAuthServiceFactoryDep = {
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  identityKubernetesAuthDAL: Pick<
    TIdentityKubernetesAuthDALFactory,
    "create" | "findOne" | "transaction" | "updateById" | "delete"
  >;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create" | "delete">;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "findOne" | "update" | "getIdentityById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  gatewayService: TGatewayServiceFactory;
  gatewayV2Service: TGatewayV2ServiceFactory;
  gatewayDAL: Pick<TGatewayDALFactory, "find">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "find">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findOne">;
};

export type TIdentityKubernetesAuthServiceFactory = ReturnType<typeof identityKubernetesAuthServiceFactory>;

const GATEWAY_AUTH_DEFAULT_HOST = "https://kubernetes.default.svc.cluster.local";

export const identityKubernetesAuthServiceFactory = ({
  identityDAL,
  identityKubernetesAuthDAL,
  membershipIdentityDAL,
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

  const login = async ({ identityId, jwt: serviceAccountJwt, subOrganizationName }: TLoginKubernetesAuthDTO) => {
    const appCfg = getConfig();
    const identityKubernetesAuth = await identityKubernetesAuthDAL.findOne({ identityId });
    if (!identityKubernetesAuth) {
      throw new NotFoundError({
        message: "Kubernetes auth method not found for identity, did you configure Kubernetes auth?"
      });
    }

    const identity = await identityDAL.findById(identityKubernetesAuth.identityId);
    if (!identity) throw new UnauthorizedError({ message: "Identity not found" });

    const org = await orgDAL.findById(identity.orgId);
    const isSubOrgIdentity = Boolean(org.rootOrgId);

    // If the identity is a sub-org identity, then the scope is always the org.id, and if it's a root org identity, then we need to resolve the scope if a subOrganizationName is specified
    let subOrganizationId = isSubOrgIdentity ? org.id : null;

    try {
      const { decryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.Organization,
        orgId: identity.orgId
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
                ...(identityKubernetesAuth.allowedAudience
                  ? { audiences: [identityKubernetesAuth.allowedAudience] }
                  : {})
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
            const tokenReviewerJwtSnippet = `${tokenReviewerJwt?.substring?.(0, 10) || ""}...${tokenReviewerJwt?.substring?.(tokenReviewerJwt.length - 10) || ""}`;
            const serviceAccountJwtSnippet = `${serviceAccountJwt?.substring?.(0, 10) || ""}...${serviceAccountJwt?.substring?.(serviceAccountJwt.length - 10) || ""}`;

            if (err instanceof AxiosError) {
              logger.error(
                {
                  response: err.response,
                  host,
                  port,
                  tokenReviewerJwtSnippet,
                  serviceAccountJwtSnippet,
                  code: err.code
                },
                "tokenReviewCallbackRaw: Kubernetes token review request error (request error)"
              );

              throw handleAxiosError(err, { host, port }, KubernetesAuthErrorContext.KubernetesApiServer);
            }

            logger.error(
              { error: err as Error, host, port, tokenReviewerJwtSnippet, serviceAccountJwtSnippet },
              "tokenReviewCallbackRaw: Kubernetes token review request error (non-request error)"
            );

            if (isKnownError(err)) {
              throw err;
            }

            throw new BadRequestError({
              name: "KubernetesTokenReviewError",
              message: (err as Error).message || "Unexpected error during token review",
              error: err
            });
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
                ...(identityKubernetesAuth.allowedAudience
                  ? { audiences: [identityKubernetesAuth.allowedAudience] }
                  : {})
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
            logger.error(
              { error: err as Error, host, port },
              "tokenReviewCallbackThroughGateway: Kubernetes token review request error"
            );

            if (err instanceof AxiosError) {
              throw handleAxiosError(err, { host, port }, KubernetesAuthErrorContext.GatewayProxy);
            }

            if (isKnownError(err)) {
              throw err;
            }

            throw new BadRequestError({
              name: "GatewayTokenReviewError",
              message: (err as Error).message || "Unexpected error during gateway token review",
              error: err
            });
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

      if (subOrganizationName) {
        if (!isSubOrgIdentity) {
          const subOrg = await orgDAL.findOne({ rootOrgId: org.id, slug: subOrganizationName });

          if (!subOrg) {
            throw new NotFoundError({ message: `Sub organization with name ${subOrganizationName} not found` });
          }

          const subOrgMembership = await membershipIdentityDAL.findOne({
            scope: AccessScope.Organization,
            actorIdentityId: identity.id,
            scopeOrgId: subOrg.id
          });

          if (!subOrgMembership) {
            throw new UnauthorizedError({
              message: `Identity not authorized to access sub organization ${subOrganizationName}`
            });
          }

          subOrganizationId = subOrg.id;
        }
      }

      const identityAccessToken = await identityKubernetesAuthDAL.transaction(async (tx) => {
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
            authMethod: IdentityAuthMethod.KUBERNETES_AUTH,
            subOrganizationId
          },
          tx
        );
        return newToken;
      });

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

      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        authAttemptCounter.add(1, {
          "infisical.identity.id": identityKubernetesAuth.identityId,
          "infisical.identity.name": identity.name,
          "infisical.organization.id": org.id,
          "infisical.organization.name": org.name,
          "infisical.identity.auth_method": AuthAttemptAuthMethod.KUBERNETES_AUTH,
          "infisical.identity.auth_result": AuthAttemptAuthResult.SUCCESS,
          "client.address": requestContext.get("ip"),
          "user_agent.original": requestContext.get("userAgent")
        });
      }

      return { accessToken, identityKubernetesAuth, identityAccessToken, identity };
    } catch (error) {
      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        authAttemptCounter.add(1, {
          "infisical.identity.id": identityKubernetesAuth.identityId,
          "infisical.identity.name": identity.name,
          "infisical.organization.id": org.id,
          "infisical.organization.name": org.name,
          "infisical.identity.auth_method": AuthAttemptAuthMethod.KUBERNETES_AUTH,
          "infisical.identity.auth_result": AuthAttemptAuthResult.FAILURE,
          "client.address": requestContext.get("ip"),
          "user_agent.original": requestContext.get("userAgent")
        });
      }

      if (isKnownError(error)) {
        throw error;
      }

      logger.error({ error, identityId }, "Unexpected error during Kubernetes auth login");

      throw new BadRequestError({
        name: "KubernetesAuthLoginError",
        message: (error as Error).message || "An unexpected error occurred during Kubernetes authentication",
        error
      });
    }
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

    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.KUBERNETES_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add Kubernetes Auth to already configured identity"
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

    let isGatewayV1 = true;
    if (gatewayId) {
      const [gateway] = await gatewayDAL.find({ id: gatewayId, orgId: identityMembershipOrg.scopeOrgId });
      const [gatewayV2] = await gatewayV2DAL.find({ id: gatewayId, orgId: identityMembershipOrg.scopeOrgId });
      if (!gateway && !gatewayV2) {
        throw new NotFoundError({
          message: `Gateway with ID ${gatewayId} not found`
        });
      }

      if (!gateway) {
        isGatewayV1 = false;
      }

      const { permission: orgPermission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionGatewayActions.AttachGateways,
        OrgPermissionSubjects.Gateway
      );
    }

    if (tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api && kubernetesHost && !gatewayId) {
      logger.info({ kubernetesHost }, "Validating Kubernetes host connectivity for new auth method");
      await validateKubernetesHostConnectivity({
        kubernetesHost,
        caCert: caCert || undefined
      });
    }

    if (
      tokenReviewerJwt &&
      kubernetesHost &&
      tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api &&
      !gatewayId
    ) {
      logger.info({ kubernetesHost }, "Validating token reviewer JWT permissions for new auth method");
      await validateTokenReviewerJwtPermissions({
        kubernetesHost,
        tokenReviewerJwt,
        caCert: caCert || undefined
      });
    }

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.scopeOrgId
    });

    const identityKubernetesAuth = await identityKubernetesAuthDAL.transaction(async (tx) => {
      const doc = await identityKubernetesAuthDAL.create(
        {
          identityId: identityMembershipOrg.identity.id,
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

    return { ...identityKubernetesAuth, caCert, tokenReviewerJwt, orgId: identityMembershipOrg.scopeOrgId };
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

    let isGatewayV1 = true;
    if (gatewayId) {
      const [gateway] = await gatewayDAL.find({ id: gatewayId, orgId: identityMembershipOrg.scopeOrgId });
      const [gatewayV2] = await gatewayV2DAL.find({ id: gatewayId, orgId: identityMembershipOrg.scopeOrgId });

      if (!gateway && !gatewayV2) {
        throw new NotFoundError({
          message: `Gateway with ID ${gatewayId} not found`
        });
      }

      if (!gateway) {
        isGatewayV1 = false;
      }

      const { permission: orgPermission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(orgPermission).throwUnlessCan(
        OrgPermissionGatewayActions.AttachGateways,
        OrgPermissionSubjects.Gateway
      );
    }

    // Strict check to see if gateway ID is undefined. It should update the gateway ID to null if its strictly set to null.
    const shouldUpdateGatewayId = Boolean(gatewayId !== undefined);
    const gatewayIdValue = isGatewayV1 ? gatewayId : null;
    const gatewayV2IdValue = isGatewayV1 ? null : gatewayId;

    const effectiveTokenReviewMode = tokenReviewMode ?? identityKubernetesAuth.tokenReviewMode;
    const effectiveKubernetesHost =
      kubernetesHost !== undefined ? kubernetesHost : identityKubernetesAuth.kubernetesHost;
    const effectiveGatewayId =
      gatewayId !== undefined ? gatewayId : (identityKubernetesAuth.gatewayId ?? identityKubernetesAuth.gatewayV2Id);

    const { encryptor, decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: identityMembershipOrg.scopeOrgId
    });

    let effectiveCaCert: string | undefined;
    if (caCert !== undefined) {
      effectiveCaCert = caCert;
    } else if (identityKubernetesAuth.encryptedKubernetesCaCertificate) {
      effectiveCaCert = decryptor({
        cipherTextBlob: identityKubernetesAuth.encryptedKubernetesCaCertificate
      }).toString();
    } else {
      effectiveCaCert = undefined;
    }

    if (
      kubernetesHost &&
      effectiveTokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api &&
      !effectiveGatewayId
    ) {
      logger.info({ kubernetesHost }, "Validating Kubernetes host connectivity for auth method update");
      await validateKubernetesHostConnectivity({
        kubernetesHost,
        caCert: effectiveCaCert
      });
    }

    if (
      tokenReviewerJwt &&
      effectiveKubernetesHost &&
      effectiveTokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api &&
      !effectiveGatewayId
    ) {
      logger.info(
        { kubernetesHost: effectiveKubernetesHost },
        "Validating token reviewer JWT permissions for auth method update"
      );
      await validateTokenReviewerJwtPermissions({
        kubernetesHost: effectiveKubernetesHost,
        tokenReviewerJwt,
        caCert: effectiveCaCert
      });
    }

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
      orgId: identityMembershipOrg.scopeOrgId,
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

    const identityKubernetesAuth = await identityKubernetesAuthDAL.findOne({ identityId });
    if (!identityKubernetesAuth) {
      throw new NotFoundError({ message: `Failed to find Kubernetes Auth for identity with ID ${identityId}` });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.KUBERNETES_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Kubernetes Auth attached"
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
      orgId: identityMembershipOrg.scopeOrgId,
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

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.KUBERNETES_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have kubernetes auth"
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

      const { permission: rolePermission } = await permissionService.getOrgPermission({
        actor: ActorType.IDENTITY,
        actorId: identityMembershipOrg.identity.id,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId,
        scope: OrganizationActionScope.Any
      });
      const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(identityMembershipOrg.scopeOrgId);
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
    }
    const revokedIdentityKubernetesAuth = await identityKubernetesAuthDAL.transaction(async (tx) => {
      const deletedKubernetesAuth = await identityKubernetesAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({ identityId, authMethod: IdentityAuthMethod.KUBERNETES_AUTH }, tx);
      return { ...deletedKubernetesAuth?.[0], orgId: identityMembershipOrg.scopeOrgId };
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
