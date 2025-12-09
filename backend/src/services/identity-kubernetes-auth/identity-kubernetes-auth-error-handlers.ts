import { AxiosError } from "axios";

import { BadRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";

type ErrorContext = {
  host?: string;
  port?: number;
  kubernetesHost?: string;
};

export enum KubernetesAuthErrorContext {
  KubernetesHost = "kubernetes-host",
  KubernetesApiServer = "kubernetes-api-server",
  GatewayProxy = "gateway-proxy"
}

type ErrorContextConfig = {
  serviceName: string;
  errorNamePrefix: string;
  defaultErrorName: string;
  default401Message: string;
  default403Message: string;
};

const COMMON_KUBERNETES_MESSAGES = {
  default401Message:
    "Token reviewer JWT is invalid or expired. Please verify the token reviewer JWT is correct and has not expired.",
  default403Message:
    "Token reviewer JWT does not have permission to perform TokenReviews. Ensure the service account has the 'system:auth-delegator' ClusterRole binding."
} as const;

const ERROR_CONTEXT_CONFIGS: Record<KubernetesAuthErrorContext, ErrorContextConfig> = {
  [KubernetesAuthErrorContext.KubernetesHost]: {
    serviceName: "Kubernetes host",
    errorNamePrefix: "KubernetesHost",
    defaultErrorName: "KubernetesHostConnectionError",
    ...COMMON_KUBERNETES_MESSAGES
  },
  [KubernetesAuthErrorContext.KubernetesApiServer]: {
    serviceName: "Kubernetes API server",
    errorNamePrefix: "Kubernetes",
    defaultErrorName: "KubernetesConnectionError",
    ...COMMON_KUBERNETES_MESSAGES
  },
  [KubernetesAuthErrorContext.GatewayProxy]: {
    serviceName: "gateway proxy",
    errorNamePrefix: "Gateway",
    defaultErrorName: "GatewayConnectionError",
    default401Message:
      "Gateway service account is not authorized to perform TokenReviews. Verify the gateway has the 'system:auth-delegator' ClusterRole binding.",
    default403Message:
      "Gateway service account does not have permission to perform TokenReviews. Ensure it has the 'system:auth-delegator' ClusterRole binding."
  }
};

/**
 * Handles Axios network-level errors (connection refused, DNS failures, timeouts, etc.)
 * Returns a BadRequestError with a descriptive message, or null if the error is not a network error.
 */
export const handleAxiosNetworkError = (
  err: AxiosError,
  context: ErrorContext,
  contextType: KubernetesAuthErrorContext
): BadRequestError | null => {
  const { host, kubernetesHost } = context;
  const target = host || kubernetesHost || "server";
  const { errorNamePrefix: prefix, serviceName } = ERROR_CONTEXT_CONFIGS[contextType];

  if (err.code === "ECONNREFUSED") {
    return new BadRequestError({
      name: `${prefix}ConnectionRefused`,
      message: `Failed to connect to ${serviceName} at ${target}: Connection refused. Verify the host URL and ensure the ${serviceName.toLowerCase()} is accessible.`
    });
  }

  if (err.code === "ENOTFOUND") {
    return new BadRequestError({
      name: `${prefix}HostNotFound`,
      message: `Failed to resolve ${serviceName} hostname: ${target}. Verify the hostname is correct.`
    });
  }

  if (err.code === "ETIMEDOUT" || err.code === "ECONNABORTED") {
    return new BadRequestError({
      name: `${prefix}ConnectionTimeout`,
      message: `Connection to ${serviceName} at ${target} timed out. Verify network connectivity and firewall rules.`
    });
  }

  if (err.code === "DEPTH_ZERO_SELF_SIGNED_CERT" || err.code === "SELF_SIGNED_CERT_IN_CHAIN") {
    return new BadRequestError({
      name: `${prefix}CertificateError`,
      message: `SSL certificate verification failed for ${serviceName} at ${target}. The server uses a self-signed certificate. Please provide the CA certificate in the configuration.`
    });
  }

  if (err.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || err.code === "CERT_HAS_EXPIRED") {
    return new BadRequestError({
      name: `${prefix}CertificateError`,
      message: `SSL certificate verification failed for ${serviceName} at ${target}. Verify the CA certificate is correct and the server certificate is valid.`
    });
  }

  return null;
};

/**
 * Handles Axios HTTP response errors (401, 403, etc.)
 * Returns an appropriate error, or null if not an HTTP error.
 */
export const handleAxiosHttpError = (
  err: AxiosError,
  contextType: KubernetesAuthErrorContext
): UnauthorizedError | BadRequestError | null => {
  if (!err.response) {
    return null;
  }

  let message = (err.response.data as { message?: string })?.message;
  const statusCode = err.response.status;
  const { errorNamePrefix: prefix, default401Message, default403Message } = ERROR_CONTEXT_CONFIGS[contextType];

  if (!message && typeof err.response.data === "string") {
    message = err.response.data;
  }

  if (statusCode === 401) {
    return new UnauthorizedError({
      message: message || default401Message,
      name: `${prefix}TokenReviewerUnauthorized`
    });
  }

  if (statusCode === 403) {
    return new UnauthorizedError({
      message: message || default403Message,
      name: `${prefix}TokenReviewerForbidden`
    });
  }

  if (message) {
    return new UnauthorizedError({
      message,
      name: `${prefix}TokenReviewRequestError`
    });
  }

  // Generic HTTP error
  return new BadRequestError({
    name: `${prefix}TokenReviewRequestError`,
    message: `${prefix} returned HTTP ${statusCode}: ${err.response.statusText || "Unknown error"}`
  });
};

/**
 * Handles generic Axios errors (fallback when network/HTTP handlers don't match)
 */
export const handleAxiosGenericError = (
  err: AxiosError,
  context: ErrorContext,
  contextType: KubernetesAuthErrorContext
): BadRequestError => {
  const { host, kubernetesHost } = context;
  const target = host || kubernetesHost || "server";
  const { defaultErrorName, serviceName } = ERROR_CONTEXT_CONFIGS[contextType];

  return new BadRequestError({
    name: defaultErrorName,
    message: `Failed to communicate with ${serviceName} at ${target}: ${err.message}`
  });
};

/**
 * Checks if an error is a known error type that should be re-thrown as-is.
 */
export const isKnownError = (err: unknown): boolean => {
  return err instanceof UnauthorizedError || err instanceof BadRequestError || err instanceof NotFoundError;
};

/**
 * Comprehensive Axios error handler that processes network, HTTP, and generic errors.
 * Returns an error to throw.
 */
export const handleAxiosError = (
  err: AxiosError,
  context: ErrorContext,
  contextType: KubernetesAuthErrorContext
): BadRequestError | UnauthorizedError => {
  const networkError = handleAxiosNetworkError(err, context, contextType);
  if (networkError) {
    return networkError;
  }

  const httpError = handleAxiosHttpError(err, contextType);
  if (httpError) {
    return httpError;
  }

  return handleAxiosGenericError(err, context, contextType);
};
