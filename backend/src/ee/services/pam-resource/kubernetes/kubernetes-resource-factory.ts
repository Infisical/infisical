import axios, { AxiosError } from "axios";
import https from "https";

import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway/types";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";

import { verifyHostInputValidity } from "../../dynamic-secret/dynamic-secret-fns";
import { TGatewayV2ServiceFactory } from "../../gateway-v2/gateway-v2-service";
import { PamResource } from "../pam-resource-enums";
import {
  TPamResourceFactory,
  TPamResourceFactoryRotateAccountCredentials,
  TPamResourceFactoryValidateAccountCredentials
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
  const [targetHost] = await verifyHostInputValidity(url.hostname, true);

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

export const kubernetesResourceFactory: TPamResourceFactory<
  TKubernetesResourceConnectionDetails,
  TKubernetesAccountCredentials
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
    try {
      await executeWithGateway(
        { connectionDetails, gatewayId, resourceType },
        gatewayV2Service,
        async (baseUrl, httpsAgent) => {
          const { authMethod } = credentials;
          if (authMethod === KubernetesAuthMethod.ServiceAccountToken) {
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
          } else {
            throw new BadRequestError({
              message: `Unsupported Kubernetes auth method: ${authMethod as string}`
            });
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

    return updatedAccountCredentials;
  };

  return {
    validateConnection,
    validateAccountCredentials,
    rotateAccountCredentials,
    handleOverwritePreventionForCensoredValues
  };
};
