import { AxiosError, AxiosResponse } from "axios";
import { z } from "zod";

import { TEMPLATE_VALIDATION_MESSAGES } from "@app/ee/services/identity-auth-template/identity-auth-template-enums";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { safeRequest } from "@app/lib/validator/safe-request";
import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";

import { handleAxiosError, KubernetesAuthErrorContext } from "./identity-kubernetes-auth-error-handlers";
import { getKubernetesServerName, withKubernetesHostScheme } from "./identity-kubernetes-auth-fns";
import { IdentityKubernetesAuthTokenReviewMode } from "./identity-kubernetes-auth-types";

const VALIDATION_TIMEOUT_MS = 10_000;
// The /version and TokenReview responses are a few KB. Bounded so an operator-supplied host
// cannot make us buffer an arbitrary body.
const VALIDATION_MAX_RESPONSE_BYTES = 64 * 1024;

export const kubernetesHostSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine(
    (val) => {
      if (!val) return true;

      return characterValidator([
        CharacterType.Alphabets,
        CharacterType.Numbers,
        CharacterType.Colon,
        CharacterType.Period,
        CharacterType.ForwardSlash,
        CharacterType.Hyphen
      ])(val);
    },
    {
      message: "Kubernetes host must only contain alphabets, numbers, colons, periods, hyphen, and forward slashes."
    }
  );

export type TKubernetesConnectionFields = {
  tokenReviewMode?: IdentityKubernetesAuthTokenReviewMode | null;
  kubernetesHost?: string | null;
  caCert?: string | null;
  verifyTlsCertificate?: boolean;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
};

// single source for the cross-field connection rules shared by the identity k8s auth
// attach route, the auth template create/update paths, and the frontend mirrors
export const validateKubernetesConnectionFields = (
  fields: TKubernetesConnectionFields
): { path: string; message: string }[] => {
  const issues: { path: string; message: string }[] = [];
  const tokenReviewMode = fields.tokenReviewMode ?? IdentityKubernetesAuthTokenReviewMode.Api;

  if (tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api && !fields.kubernetesHost) {
    issues.push({ path: "kubernetesHost", message: TEMPLATE_VALIDATION_MESSAGES.KUBERNETES.HOST_REQUIRED });
  }
  if (tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Gateway && !fields.gatewayId && !fields.gatewayPoolId) {
    issues.push({ path: "gatewayId", message: TEMPLATE_VALIDATION_MESSAGES.KUBERNETES.GATEWAY_REQUIRED });
  }
  if (fields.gatewayId && fields.gatewayPoolId) {
    issues.push({ path: "gatewayPoolId", message: TEMPLATE_VALIDATION_MESSAGES.KUBERNETES.GATEWAY_CONFLICT });
  }
  if (tokenReviewMode === IdentityKubernetesAuthTokenReviewMode.Api) {
    if (fields.verifyTlsCertificate && !fields.caCert?.length) {
      issues.push({ path: "caCert", message: TEMPLATE_VALIDATION_MESSAGES.KUBERNETES.CA_CERT_REQUIRED });
    }
    if (fields.verifyTlsCertificate === false && fields.caCert?.length) {
      issues.push({
        path: "verifyTlsCertificate",
        message: TEMPLATE_VALIDATION_MESSAGES.KUBERNETES.TLS_VERIFICATION_CONFLICT
      });
    }
  }
  return issues;
};

export const superRefineKubernetesConnectionFields = (fields: TKubernetesConnectionFields, ctx: z.RefinementCtx) => {
  validateKubernetesConnectionFields(fields).forEach((issue) => {
    ctx.addIssue({ path: [issue.path], code: z.ZodIssueCode.custom, message: issue.message });
  });
};

// fields the linked auth template owns on an identity's kubernetes auth; both the attach
// and update routes reject them so the two endpoints cannot drift apart again
export const TEMPLATE_MANAGED_KUBERNETES_AUTH_FIELDS = [
  "kubernetesHost",
  "caCert",
  "verifyTlsCertificate",
  "tokenReviewerJwt",
  "tokenReviewMode",
  "allowedAudience",
  "gatewayId",
  "gatewayPoolId"
] as const;

export const rejectTemplateManagedKubernetesFields = (data: Record<string, unknown>, ctx: z.RefinementCtx) => {
  TEMPLATE_MANAGED_KUBERNETES_AUTH_FIELDS.forEach((field) => {
    if (data[field] !== undefined) {
      ctx.addIssue({
        path: [field],
        code: z.ZodIssueCode.custom,
        message: `${field} is managed by the auth template and cannot be provided`
      });
    }
  });
};

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
  verifyTlsCertificate,
  gatewayExecutor
}: {
  kubernetesHost?: string;
  caCert?: string;
  verifyTlsCertificate?: boolean;
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

      response = await safeRequest.get(`${withKubernetesHostScheme(kubernetesHost)}/version`, {
        ca: caCert || undefined,
        rejectUnauthorized: verifyTlsCertificate ?? true,
        servername: getKubernetesServerName(kubernetesHost),
        timeout: VALIDATION_TIMEOUT_MS,
        signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
        maxContentLength: VALIDATION_MAX_RESPONSE_BYTES,
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
  verifyTlsCertificate,
  gatewayExecutor
}: {
  kubernetesHost?: string;
  tokenReviewerJwt?: string;
  caCert?: string;
  verifyTlsCertificate?: boolean;
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

      response = await safeRequest.post(
        `${withKubernetesHostScheme(kubernetesHost)}/apis/authentication.k8s.io/v1/tokenreviews`,
        tokenReviewBody,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokenReviewerJwt}`
          },
          ca: caCert || undefined,
          rejectUnauthorized: verifyTlsCertificate ?? true,
          servername: getKubernetesServerName(kubernetesHost),
          timeout: VALIDATION_TIMEOUT_MS,
          signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
          maxContentLength: VALIDATION_MAX_RESPONSE_BYTES,
          validateStatus: () => true
        }
      );
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
