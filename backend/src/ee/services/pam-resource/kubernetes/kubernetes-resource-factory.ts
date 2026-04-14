import axios, { AxiosError } from "axios";
import https from "https";

import { BadRequestError } from "@app/lib/errors";
import { GatewayHttpProxyActions, GatewayProxyProtocol } from "@app/lib/gateway/types";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";

import { verifyHostInputValidity } from "../../dynamic-secret/dynamic-secret-fns";
import { TGatewayV2ServiceFactory } from "../../gateway-v2/gateway-v2-service";
import { PamResource } from "../pam-resource-enums";
import {
  TPamResourceFactory,
  TPamResourceFactoryRotateAccountCredentials,
  TPamResourceFactoryValidateAccountCredentials,
  TPamResourceInternalMetadata
} from "../pam-resource-types";
import { KubernetesAuthMethod } from "./kubernetes-resource-enums";
import { TKubernetesAccountCredentials, TKubernetesResourceConnectionDetails } from "./kubernetes-resource-types";

const EXTERNAL_REQUEST_TIMEOUT = 10 * 1000;

export const executeWithGateway = async <T>(
  config: {
    connectionDetails: TKubernetesResourceConnectionDetails;
    resourceType: PamResource;
    gatewayId: string;
  },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  operation: (baseUrl: string, httpsAgent: https.Agent) => Promise<T>
): Promise<T> => {
  const { connectionDetails, gatewayId } = config;
  const url = new URL(connectionDetails.url);
  const [targetHost] = await verifyHostInputValidity({ host: url.hostname, isGateway: true, isDynamicSecret: false });

  let targetPort: number;
  if (url.port) {
    targetPort = Number(url.port);
  } else if (url.protocol === "https:") {
    targetPort = 443;
  } else {
    targetPort = 80;
  }

  const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost,
    targetPort
  });
  if (!platformConnectionDetails) {
    throw new BadRequestError({ message: "Unable to connect to gateway, no platform connection details found" });
  }
  const httpsAgent = new https.Agent({
    ca: connectionDetails.sslCertificate,
    rejectUnauthorized: connectionDetails.sslRejectUnauthorized,
    servername: targetHost
  });
  return withGatewayV2Proxy(
    async (proxyPort) => {
      const protocol = url.protocol === "https:" ? "https" : "http";
      const baseUrl = `${protocol}://localhost:${proxyPort}`;
      return operation(baseUrl, httpsAgent);
    },
    {
      protocol: GatewayProxyProtocol.Tcp,
      relayHost: platformConnectionDetails.relayHost,
      gateway: platformConnectionDetails.gateway,
      relay: platformConnectionDetails.relay,
      httpsAgent
    }
  );
};

const validateWithGatewayHttp = async <T>(
  config: {
    gatewayId: string;
  },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  operation: (baseUrl: string) => Promise<T>
): Promise<T> => {
  // For gateway-auth validation, the gateway auto-discovers the K8s API from env vars,
  // so we use a placeholder host/port. The actual target is resolved by the gateway's
  // use-k8s-sa handler via KUBERNETES_SERVICE_HOST env var.
  const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId: config.gatewayId,
    targetHost: "kubernetes.default.svc.cluster.local",
    targetPort: 443
  });
  if (!platformConnectionDetails) {
    throw new BadRequestError({ message: "Unable to connect to gateway, no platform connection details found" });
  }
  return withGatewayV2Proxy(
    async (proxyPort) => {
      const baseUrl = `http://localhost:${proxyPort}`;
      return operation(baseUrl);
    },
    {
      protocol: GatewayProxyProtocol.Http,
      relayHost: platformConnectionDetails.relayHost,
      gateway: platformConnectionDetails.gateway,
      relay: platformConnectionDetails.relay
    }
  );
};

export const kubernetesResourceFactory: TPamResourceFactory<
  TKubernetesResourceConnectionDetails,
  TKubernetesAccountCredentials,
  TPamResourceInternalMetadata
> = (resourceType, connectionDetails, gatewayId, gatewayV2Service) => {
  const validateConnection = async () => {
    if (!gatewayId) {
      throw new BadRequestError({ message: "Gateway ID is required" });
    }
    try {
      await executeWithGateway(
        { connectionDetails, gatewayId, resourceType },
        gatewayV2Service,
        async (baseUrl, httpsAgent) => {
          // Validate connection by checking API server version
          try {
            await axios.get(`${baseUrl}/version`, {
              ...(httpsAgent ? { httpsAgent } : {}),
              signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT),
              timeout: EXTERNAL_REQUEST_TIMEOUT
            });
          } catch (error) {
            if (error instanceof AxiosError) {
              // If we get a 401/403, it means we reached the API server but need auth - that's fine for connection validation
              if (error.response?.status === 401 || error.response?.status === 403) {
                logger.info(
                  { status: error.response.status },
                  "[Kubernetes Resource Factory] Kubernetes connection validation succeeded (auth required)"
                );
                return connectionDetails;
              }
              throw new BadRequestError({
                message: `Unable to connect to Kubernetes API server: ${error.response?.statusText || error.message}`
              });
            }
            throw error;
          }

          logger.info("[Kubernetes Resource Factory] Kubernetes connection validation succeeded");
          return connectionDetails;
        }
      );
      return connectionDetails;
    } catch (error) {
      throw new BadRequestError({
        message: `Unable to validate connection to ${resourceType}: ${(error as Error).message || String(error)}`
      });
    }
  };

  const validateAccountCredentials: TPamResourceFactoryValidateAccountCredentials<
    TKubernetesAccountCredentials
  > = async (credentials) => {
    if (!gatewayId) {
      throw new BadRequestError({ message: "Gateway ID is required" });
    }

    const { authMethod } = credentials;

    if (authMethod === KubernetesAuthMethod.ServiceAccountToken) {
      try {
        await executeWithGateway(
          { connectionDetails, gatewayId, resourceType },
          gatewayV2Service,
          async (baseUrl, httpsAgent) => {
            // Validate service account token using SelfSubjectReview API (whoami)
            // This endpoint doesn't require any special permissions from the service account
            try {
              await axios.post(
                `${baseUrl}/apis/authentication.k8s.io/v1/selfsubjectreviews`,
                {
                  apiVersion: "authentication.k8s.io/v1",
                  kind: "SelfSubjectReview"
                },
                {
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${credentials.serviceAccountToken}`
                  },
                  ...(httpsAgent ? { httpsAgent } : {}),
                  signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT),
                  timeout: EXTERNAL_REQUEST_TIMEOUT
                }
              );

              logger.info("[Kubernetes Resource Factory] Kubernetes service account token authentication successful");
            } catch (error) {
              if (error instanceof AxiosError) {
                if (error.response?.status === 401 || error.response?.status === 403) {
                  throw new BadRequestError({
                    message:
                      "Account credentials invalid. Service account token is not valid or does not have required permissions."
                  });
                }
                throw new BadRequestError({
                  message: `Unable to validate account credentials: ${error.response?.statusText || error.message}`
                });
              }
              throw error;
            }
          }
        );
        return credentials;
      } catch (error) {
        if (error instanceof BadRequestError) {
          throw error;
        }
        throw new BadRequestError({
          message: `Unable to validate account credentials for ${resourceType}: ${(error as Error).message || String(error)}`
        });
      }
    }

    if (authMethod === KubernetesAuthMethod.GatewayKubernetesAuth) {
      // Validate gateway auth by performing an impersonated SelfSubjectReview through the gateway.
      // The gateway's use-k8s-sa handler injects its own pod token and discovers the K8s API.
      // We add Impersonate-User header which passes through untouched.
      // This validates that the gateway has RBAC permission to impersonate the specified SA.
      // NOTE: It does NOT verify the SA exists — K8s impersonation is a pure permission check.
      // A non-existent SA passes validation here but fails at session time with 403.
      try {
        await validateWithGatewayHttp({ gatewayId }, gatewayV2Service, async (baseUrl) => {
          const impersonateUser = `system:serviceaccount:${credentials.namespace}:${credentials.serviceAccountName}`;
          try {
            await axios.post(
              `${baseUrl}/apis/authentication.k8s.io/v1/selfsubjectreviews`,
              {
                apiVersion: "authentication.k8s.io/v1",
                kind: "SelfSubjectReview"
              },
              {
                headers: {
                  "Content-Type": "application/json",
                  "x-infisical-action": GatewayHttpProxyActions.UseGatewayK8sServiceAccount,
                  "Impersonate-User": impersonateUser
                },
                signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT),
                timeout: EXTERNAL_REQUEST_TIMEOUT
              }
            );

            logger.info(
              `[Kubernetes Resource Factory] Gateway K8s auth validation successful [namespace=${credentials.namespace}] [sa=${credentials.serviceAccountName}]`
            );
          } catch (error) {
            if (error instanceof AxiosError) {
              const errorMessage =
                (error.response?.data as { message?: string })?.message || error.response?.statusText || error.message;

              if (errorMessage?.includes("failed to read k8s sa auth token")) {
                throw new BadRequestError({
                  message:
                    "Gateway is not running inside a Kubernetes cluster. Gateway auth requires the gateway to be deployed as a pod."
                });
              }
              if (error.response?.status === 403) {
                if (errorMessage?.includes("impersonate")) {
                  throw new BadRequestError({
                    message: `Gateway service account lacks impersonation permissions for service account "${credentials.serviceAccountName}" in namespace "${credentials.namespace}". Ensure the gateway's ClusterRole includes the impersonate verb for this service account.`
                  });
                }
                throw new BadRequestError({
                  message: `Unable to impersonate service account "${credentials.serviceAccountName}" in namespace "${credentials.namespace}": ${errorMessage}`
                });
              }
              if (error.code === "ECONNABORTED" || error.code === "ERR_CANCELED") {
                throw new BadRequestError({
                  message: "Unable to reach the Kubernetes API server through the gateway."
                });
              }
              throw new BadRequestError({
                message: `Unable to validate gateway auth credentials: ${errorMessage}`
              });
            }
            throw error;
          }
        });
        return credentials;
      } catch (error) {
        if (error instanceof BadRequestError) {
          throw error;
        }
        throw new BadRequestError({
          message: `Unable to validate account credentials for ${resourceType}: ${(error as Error).message || String(error)}`
        });
      }
    }

    throw new BadRequestError({
      message: `Unsupported Kubernetes auth method: ${authMethod as string}`
    });
  };

  const rotateAccountCredentials: TPamResourceFactoryRotateAccountCredentials<
    TKubernetesAccountCredentials
  > = async () => {
    throw new BadRequestError({
      message: `Unable to rotate account credentials for ${resourceType}: not implemented`
    });
  };

  const handleOverwritePreventionForCensoredValues = async (
    updatedAccountCredentials: TKubernetesAccountCredentials,
    currentCredentials: TKubernetesAccountCredentials
  ) => {
    if (updatedAccountCredentials.authMethod !== currentCredentials.authMethod) {
      return updatedAccountCredentials;
    }

    if (
      updatedAccountCredentials.authMethod === KubernetesAuthMethod.ServiceAccountToken &&
      currentCredentials.authMethod === KubernetesAuthMethod.ServiceAccountToken
    ) {
      if (updatedAccountCredentials.serviceAccountToken === "__INFISICAL_UNCHANGED__") {
        return {
          ...updatedAccountCredentials,
          serviceAccountToken: currentCredentials.serviceAccountToken
        };
      }
    }

    // Gateway auth has no sensitive fields (namespace and serviceAccountName are identifiers, not secrets),
    // so no sentinel handling is needed — fall through to return as-is.

    return updatedAccountCredentials;
  };

  return {
    validateConnection,
    validateAccountCredentials,
    rotateAccountCredentials,
    handleOverwritePreventionForCensoredValues
  };
};
