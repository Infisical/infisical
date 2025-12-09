import { AxiosError } from "axios";
import https from "https";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";

import { handleAxiosError, KubernetesAuthErrorContext } from "./identity-kubernetes-auth-error-handlers";

/**
 * Validates that the Kubernetes host is reachable by making a simple HTTPS request.
 * This does not validate credentials, just network connectivity.
 */
export const validateKubernetesHostConnectivity = async ({
  kubernetesHost,
  caCert
}: {
  kubernetesHost: string;
  caCert?: string;
}): Promise<void> => {
  try {
    const httpsAgent = new https.Agent({
      ca: caCert || undefined,
      rejectUnauthorized: Boolean(caCert)
    });

    await blockLocalAndPrivateIpAddresses(kubernetesHost);

    await request.get(`${kubernetesHost}/version`, {
      httpsAgent,
      timeout: 10000,
      signal: AbortSignal.timeout(10000),
      // Don't fail on 401/403 - we just want to check connectivity
      validateStatus: (status) => status < 500
    });

    logger.info({ kubernetesHost }, "Kubernetes host connectivity validated successfully");
  } catch (err) {
    const error = err as Error;
    logger.error({ error, kubernetesHost }, "Failed to connect to Kubernetes host");

    if (err instanceof AxiosError) {
      throw handleAxiosError(err, { kubernetesHost }, KubernetesAuthErrorContext.KubernetesHost);
    }

    throw new BadRequestError({
      name: "KubernetesHostConnectionError",
      message: `Failed to connect to Kubernetes host at ${kubernetesHost}: ${error.message}`,
      error
    });
  }
};

/**
 * Validates that the token reviewer JWT has the necessary permissions to perform token reviews.
 * This is done by making a TokenReview request with a fake token to verify RBAC permissions
 * without authenticating a real workload.
 */
export const validateTokenReviewerJwtPermissions = async ({
  kubernetesHost,
  tokenReviewerJwt,
  caCert
}: {
  kubernetesHost: string;
  tokenReviewerJwt: string;
  caCert?: string;
}): Promise<void> => {
  try {
    const httpsAgent = new https.Agent({
      ca: caCert || undefined,
      rejectUnauthorized: Boolean(caCert)
    });

    const testToken = "test-token-for-permission-validation";

    await blockLocalAndPrivateIpAddresses(kubernetesHost);

    const response = await request.post(
      `${kubernetesHost}/apis/authentication.k8s.io/v1/tokenreviews`,
      {
        apiVersion: "authentication.k8s.io/v1",
        kind: "TokenReview",
        spec: {
          token: testToken
        }
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenReviewerJwt}`
        },
        httpsAgent,
        timeout: 10000,
        signal: AbortSignal.timeout(10000),
        // We expect the token to be invalid, but the request should succeed (200 with authenticated: false)
        // If we get 401/403, the reviewer doesn't have permission
        validateStatus: () => true
      }
    );

    if (response.status === 401) {
      throw new BadRequestError({
        name: "TokenReviewerPermissionError",
        message:
          "The token reviewer JWT is invalid or expired. Please provide a valid service account token with TokenReview permissions."
      });
    }

    if (response.status === 403) {
      const errorMessage =
        (response.data as { message?: string })?.message ||
        "The token reviewer JWT does not have permission to perform TokenReviews.";
      throw new BadRequestError({
        name: "TokenReviewerPermissionError",
        message: `Token reviewer lacks required permissions: ${errorMessage}. Ensure the service account has the 'system:auth-delegator' ClusterRole binding.`
      });
    }

    if (response.status >= 200 && response.status < 300) {
      const data = response.data as { status?: { authenticated?: boolean; error?: string } };

      logger.info(
        { kubernetesHost, authenticated: data?.status?.authenticated },
        "Token reviewer JWT permission validation successful"
      );
      return;
    }

    // Handle other status codes
    const errorMessage = (response.data as { message?: string })?.message || response.statusText;
    throw new BadRequestError({
      name: "TokenReviewerPermissionError",
      message: `Unexpected response from Kubernetes API: ${response.status} - ${errorMessage}`
    });
  } catch (err) {
    if (err instanceof BadRequestError) {
      throw err;
    }

    const error = err as Error;
    logger.error({ error, kubernetesHost }, "Failed to validate token reviewer JWT permissions");

    if (err instanceof AxiosError) {
      if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND" || err.code === "ETIMEDOUT") {
        throw new BadRequestError({
          name: "TokenReviewerPermissionError",
          message: `Unable to reach Kubernetes API server to validate token permissions: ${err.message}`
        });
      }
    }

    throw new BadRequestError({
      name: "TokenReviewerPermissionError",
      message: `Failed to validate token reviewer permissions: ${error.message}`
    });
  }
};
