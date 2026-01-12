import { AxiosError, AxiosResponse } from "axios";
import https from "https";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

import { handleAxiosError, KubernetesAuthErrorContext } from "./identity-kubernetes-auth-error-handlers";

export type GatewayRequestExecutor = <T>(
  method: "get" | "post",
  url: string,
  body?: object,
  headers?: Record<string, string>
) => Promise<AxiosResponse<T>>;

/**
 * Validates that the Kubernetes host is reachable by making a simple HTTPS request.
 * This does not validate credentials, just network connectivity.
 *
 * Supports two modes:
 * - API mode: Direct call to Kubernetes API (default)
 * - Gateway mode: Call through gateway using gatewayExecutor
 */
export const validateKubernetesHostConnectivity = async ({
  kubernetesHost,
  caCert,
  gatewayExecutor
}: {
  kubernetesHost?: string;
  caCert?: string;
  gatewayExecutor?: GatewayRequestExecutor;
}): Promise<void> => {
  const isGatewayMode = Boolean(gatewayExecutor);
  const logContext = isGatewayMode ? { context: "gateway" } : { kubernetesHost };
  const errorContext = isGatewayMode
    ? KubernetesAuthErrorContext.GatewayProxy
    : KubernetesAuthErrorContext.KubernetesHost;

  try {
    let response: AxiosResponse;

    if (gatewayExecutor) {
      response = await gatewayExecutor("get", "/version");
    } else {
      if (!kubernetesHost) {
        throw new BadRequestError({
          name: "KubernetesHostConnectionError",
          message: "Kubernetes host is required for API mode validation"
        });
      }

      const httpsAgent = new https.Agent({
        ca: caCert || undefined,
        rejectUnauthorized: Boolean(caCert)
      });

      await blockLocalAndPrivateIpAddresses(kubernetesHost);

      response = await request.get(`${kubernetesHost}/version`, {
        httpsAgent,
        timeout: 10000,
        signal: AbortSignal.timeout(10000),
        validateStatus: () => true
      });
    }

    if (response.status >= 500) {
      throw new BadRequestError({
        name: isGatewayMode ? "GatewayConnectionError" : "KubernetesHostConnectionError",
        message: `Kubernetes API returned server error: ${response.status} - ${response.statusText}`
      });
    }

    logger.info(logContext, "Kubernetes host connectivity validated successfully");
  } catch (err) {
    if (err instanceof BadRequestError) {
      throw err;
    }

    const error = err as Error;
    logger.error({ error, ...logContext }, "Failed to connect to Kubernetes host");

    if (err instanceof AxiosError) {
      throw handleAxiosError(err, { kubernetesHost }, errorContext);
    }

    throw new BadRequestError({
      name: isGatewayMode ? "GatewayConnectionError" : "KubernetesHostConnectionError",
      message: isGatewayMode
        ? `Failed to connect to Kubernetes through gateway: ${error.message}`
        : `Failed to connect to Kubernetes host at ${kubernetesHost}: ${error.message}`,
      error
    });
  }
};

/**
 * Validates that the token reviewer has the necessary permissions to perform token reviews.
 * This is done by making a TokenReview request with a fake token to verify RBAC permissions
 * without authenticating a real workload.
 *
 * Supports three modes:
 * - API mode: Direct call to Kubernetes API using tokenReviewerJwt
 * - Gateway mode (gateway reviewer): Gateway uses its own service account
 * - Gateway mode (API reviewer): Gateway proxies request with user-provided tokenReviewerJwt
 */
export const validateTokenReviewerPermissions = async ({
  kubernetesHost,
  tokenReviewerJwt,
  caCert,
  gatewayExecutor
}: {
  kubernetesHost?: string;
  tokenReviewerJwt?: string;
  caCert?: string;
  gatewayExecutor?: GatewayRequestExecutor;
}): Promise<void> => {
  const isGatewayMode = Boolean(gatewayExecutor);
  const isGatewayWithUserJwt = isGatewayMode && Boolean(tokenReviewerJwt);
  const logContext = isGatewayMode ? { context: "gateway" } : { kubernetesHost };
  const errorContext = isGatewayMode
    ? KubernetesAuthErrorContext.GatewayProxy
    : KubernetesAuthErrorContext.KubernetesApiServer;

  let errorNamePrefix = "TokenReviewer";
  if (isGatewayMode && !isGatewayWithUserJwt) {
    errorNamePrefix = "GatewayTokenReview";
  }

  try {
    const testToken = "test-token-for-permission-validation";
    const tokenReviewBody = {
      apiVersion: "authentication.k8s.io/v1",
      kind: "TokenReview",
      spec: {
        token: testToken
      }
    };

    let response: AxiosResponse;

    if (gatewayExecutor) {
      // Gateway mode: optionally pass user JWT if provided (API mode through gateway)
      const headers = tokenReviewerJwt ? { Authorization: `Bearer ${tokenReviewerJwt}` } : undefined;
      response = await gatewayExecutor("post", "/apis/authentication.k8s.io/v1/tokenreviews", tokenReviewBody, headers);
    } else {
      // Direct API mode: call Kubernetes API directly
      if (!kubernetesHost || !tokenReviewerJwt) {
        throw new BadRequestError({
          name: `${errorNamePrefix}PermissionError`,
          message: "Kubernetes host and token reviewer JWT are required for API mode validation"
        });
      }

      const httpsAgent = new https.Agent({
        ca: caCert || undefined,
        rejectUnauthorized: Boolean(caCert)
      });

      await blockLocalAndPrivateIpAddresses(kubernetesHost);

      response = await request.post(`${kubernetesHost}/apis/authentication.k8s.io/v1/tokenreviews`, tokenReviewBody, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenReviewerJwt}`
        },
        httpsAgent,
        timeout: 10000,
        signal: AbortSignal.timeout(10000),
        validateStatus: () => true
      });
    }

    if (response.status === 401) {
      throw new BadRequestError({
        name: `${errorNamePrefix}PermissionError`,
        message:
          isGatewayMode && !isGatewayWithUserJwt
            ? "Gateway service account is not authorized. Verify the gateway is deployed correctly and has a valid service account."
            : "The token reviewer JWT is invalid or expired. Please provide a valid service account token with TokenReview permissions."
      });
    }

    if (response.status === 403) {
      const errorMessage =
        (response.data as { message?: string })?.message ||
        (isGatewayMode && !isGatewayWithUserJwt
          ? "Gateway service account does not have permission to perform TokenReviews."
          : "The token reviewer JWT does not have permission to perform TokenReviews.");
      throw new BadRequestError({
        name: `${errorNamePrefix}PermissionError`,
        message: `${errorMessage}. Ensure the service account has the 'system:auth-delegator' ClusterRole binding.`
      });
    }

    if (response.status >= 200 && response.status < 300) {
      const data = response.data as { status?: { authenticated?: boolean; error?: string } };
      logger.info(
        { ...logContext, authenticated: data?.status?.authenticated },
        "Token reviewer permission validation successful"
      );
      return;
    }

    const errorMessage = (response.data as { message?: string })?.message || response.statusText;
    throw new BadRequestError({
      name: `${errorNamePrefix}PermissionError`,
      message: `Unexpected response from Kubernetes API: ${response.status} - ${errorMessage}`
    });
  } catch (err) {
    if (err instanceof BadRequestError) {
      throw err;
    }

    const error = err as Error;
    logger.error({ error, ...logContext }, "Failed to validate token reviewer permissions");

    if (err instanceof AxiosError) {
      throw handleAxiosError(err, { kubernetesHost }, errorContext);
    }

    throw new BadRequestError({
      name: `${errorNamePrefix}PermissionError`,
      message: `Failed to validate token reviewer permissions: ${error.message}`
    });
  }
};
