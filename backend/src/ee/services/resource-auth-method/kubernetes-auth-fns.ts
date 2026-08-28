import { AxiosError } from "axios";
import picomatch from "picomatch";

import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { safeRequest } from "@app/lib/validator/safe-request";
import {
  handleAxiosError,
  KubernetesAuthErrorContext
} from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-error-handlers";
import {
  extractK8sUsername,
  getKubernetesServerName,
  withKubernetesHostScheme
} from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-fns";
import { TCreateTokenReviewResponse } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-types";

import { ResourceAuthLoginFailureReason } from "./resource-auth-method-fns";

const TOKEN_REVIEW_TIMEOUT_MS = 10_000;
const TOKEN_REVIEW_API_VERSION = "authentication.k8s.io/v1";
const TOKEN_REVIEW_KIND = "TokenReview";
const TOKEN_REVIEW_PATH = "/apis/authentication.k8s.io/v1/tokenreviews";
const TOKEN_REVIEW_PROBE_TOKEN = "test-token-for-permission-validation";
// A TokenReview response is a few KB; the largest part is the echoed token, itself capped at 8KB
// by the route schema. Bounded so an operator-supplied host cannot make us buffer an arbitrary body.
const TOKEN_REVIEW_MAX_RESPONSE_BYTES = 64 * 1024;

// The host is operator-supplied and the backend POSTs to it on every login, so without this an
// org admin could use the auth config to reach hosts inside our own network. Does a DNS lookup,
// so call it outside a transaction.
// One shape for both routes to the API server: straight out from Infisical, or tunnelled through a
// gateway. Callers below only deal in paths, so nothing downstream has to know which is in play.
export type TKubernetesRequestExecutor = <T = unknown>(
  method: "get" | "post",
  path: string,
  body?: object,
  headers?: Record<string, string>
) => Promise<{ status: number; data: T }>;

export const buildDirectKubernetesExecutor = ({
  kubernetesHost,
  caCertificate,
  verifyTlsCertificate
}: {
  kubernetesHost: string;
  caCertificate?: string;
  verifyTlsCertificate: boolean;
}): TKubernetesRequestExecutor => {
  const baseUrl = withKubernetesHostScheme(kubernetesHost);

  return async <T>(method: "get" | "post", path: string, body?: object, headers?: Record<string, string>) => {
    // Fresh per call: an abort signal must not be shared between requests.
    const config = {
      headers,
      ca: caCertificate || undefined,
      rejectUnauthorized: verifyTlsCertificate,
      servername: getKubernetesServerName(kubernetesHost),
      timeout: TOKEN_REVIEW_TIMEOUT_MS,
      signal: AbortSignal.timeout(TOKEN_REVIEW_TIMEOUT_MS),
      maxContentLength: TOKEN_REVIEW_MAX_RESPONSE_BYTES,
      validateStatus: () => true
    };

    // safeRequest pins the connection to the addresses it validated, so a hostname that
    // re-resolves to a private address between config time and login cannot be reached.
    const res =
      method === "get"
        ? await safeRequest.get<T>(`${baseUrl}${path}`, config)
        : await safeRequest.post<T>(`${baseUrl}${path}`, body, config);

    return { status: res.status, data: res.data };
  };
};

export const assertKubernetesHostAllowed = async (kubernetesHost: string) => {
  const url = kubernetesHost.startsWith("https://") ? kubernetesHost : `https://${kubernetesHost}`;
  try {
    await blockLocalAndPrivateIpAddresses(url);
  } catch (err) {
    if (err instanceof BadRequestError) {
      throw new BadRequestError({
        message: `Kubernetes host '${kubernetesHost}' is not an allowed address: ${err.message}. Use an address Infisical can reach over the public internet, or use Token or AWS auth for a private cluster.`
      });
    }
    throw err;
  }
};

// Surfaces a bad host or reviewer when the config is saved rather than when a gateway later
// fails to start. Makes network calls, so call it outside a transaction.
export const validateKubernetesConfigReachable = async ({
  executor,
  target,
  tokenReviewerJwt,
  isGatewayReviewer = false
}: {
  executor: TKubernetesRequestExecutor;
  // Where the request went, for error messages: a host, or a gateway's name.
  target: string;
  tokenReviewerJwt?: string;
  isGatewayReviewer?: boolean;
}) => {
  const classify = (err: unknown, context: KubernetesAuthErrorContext) => {
    // Checked before the BadRequestError passthrough: the proxy layer wraps an aborted tunnel as a
    // BadRequestError whose message is just "canceled". A gateway that is not a pod in the cluster
    // has no service account to review with, so the request never completes.
    if (isGatewayReviewer) {
      return new BadRequestError({
        message:
          "The selected gateway could not review the token with its own service account. Gateway as Reviewer requires that gateway to run as a pod inside the cluster with the system:auth-delegator ClusterRole. Use the token reviewer JWT mode for a gateway outside the cluster."
      });
    }
    if (err instanceof AxiosError) return handleAxiosError(err, { kubernetesHost: target }, context);
    return new BadRequestError({
      message: `Failed to reach the Kubernetes API server at ${target}: ${(err as Error).message}`
    });
  };

  let versionStatus: number;
  try {
    const res = await executor("get", "/version");
    versionStatus = res.status;
  } catch (err) {
    throw classify(err, KubernetesAuthErrorContext.KubernetesHost);
  }
  // 401/403 are fine: /version can require authentication. A 404 means the address does not serve
  // the Kubernetes API at all, which is the common typo and used to save happily.
  if (versionStatus === 404) {
    throw new BadRequestError({
      message: `${target} does not look like a Kubernetes API server: /version returned 404. Verify the host and port.`
    });
  }
  if (versionStatus >= 500) {
    throw new BadRequestError({
      message: `Kubernetes API server at ${target} returned ${versionStatus}. Verify the host is correct and healthy.`
    });
  }

  // Nothing to probe when Infisical will fall back to letting the incoming token review itself:
  // that token does not exist until a gateway actually logs in.
  if (!tokenReviewerJwt && !isGatewayReviewer) return;

  let review: { status: number; data: unknown };
  try {
    review = await executor(
      "post",
      TOKEN_REVIEW_PATH,
      {
        apiVersion: TOKEN_REVIEW_API_VERSION,
        kind: TOKEN_REVIEW_KIND,
        spec: { token: TOKEN_REVIEW_PROBE_TOKEN }
      },
      {
        "Content-Type": "application/json",
        // The gateway reviews with its own service account, so ours would be both ignored at the
        // far end and exposed to whichever gateway was chosen. The login path omits it for the
        // same reason, and the preservation guard exempts this mode on the strength of it.
        ...(!isGatewayReviewer && tokenReviewerJwt ? { Authorization: `Bearer ${tokenReviewerJwt}` } : {})
      }
    );
  } catch (err) {
    throw classify(err, KubernetesAuthErrorContext.KubernetesApiServer);
  }

  const reviewer = isGatewayReviewer ? "The gateway's own service account" : "The token reviewer JWT";

  if (review.status === 401) {
    throw new BadRequestError({
      message: isGatewayReviewer
        ? `${reviewer} is not authorized against the Kubernetes API server. Verify the gateway is deployed correctly.`
        : `${reviewer} is invalid or expired. Provide a valid service account token.`
    });
  }
  if (review.status === 403) {
    throw new BadRequestError({
      message: `${reviewer} cannot perform TokenReviews. Ensure its service account has the 'system:auth-delegator' ClusterRole binding.`
    });
  }
  if (review.status >= 400) {
    const message = (review.data as { message?: string })?.message ?? `HTTP ${review.status}`;
    throw new BadRequestError({ message: `Kubernetes API server rejected the token review check: ${message}` });
  }
};

type TReviewServiceAccountTokenInput = {
  jwt: string;
  executor: TKubernetesRequestExecutor;
  // Where the request went, for error messages and logs: a host, or a gateway's name.
  target: string;
  tokenReviewerJwt: string;
  isGatewayReviewer?: boolean;
  allowedAudience: string;
  errorContext: Record<string, unknown>;
};

export const reviewServiceAccountToken = async ({
  jwt,
  executor,
  target,
  tokenReviewerJwt,
  isGatewayReviewer = false,
  allowedAudience,
  errorContext
}: TReviewServiceAccountTokenInput) => {
  const kubernetesHost = target;

  let review: TCreateTokenReviewResponse;
  try {
    const res = await executor<TCreateTokenReviewResponse>(
      "post",
      TOKEN_REVIEW_PATH,
      {
        apiVersion: TOKEN_REVIEW_API_VERSION,
        kind: TOKEN_REVIEW_KIND,
        spec: {
          token: jwt,
          ...(allowedAudience ? { audiences: [allowedAudience] } : {})
        }
      },
      {
        "Content-Type": "application/json",
        // The gateway reviewer supplies its own credential at the far end, so sending one here
        // would override it. Otherwise, with no reviewer configured the incoming token reviews
        // itself, which works because the Helm chart grants the gateway's service account
        // system:auth-delegator.
        ...(isGatewayReviewer ? {} : { Authorization: `Bearer ${tokenReviewerJwt || jwt}` })
      }
    );
    review = res.data;
  } catch (err) {
    const isAxiosError = err instanceof AxiosError;
    const status = isAxiosError ? err.response?.status : undefined;
    // Never log the error object itself: an AxiosError carries `config.data`, which is the
    // TokenReview body, which contains the service account token.
    logger.error(
      { kubernetesHost, status, code: isAxiosError ? err.code : undefined, reason: (err as Error).message },
      `Resource Kubernetes Auth Login: token review request failed [resourceId=${String(errorContext.resourceId)}] [kubernetesHost=${kubernetesHost}]`
    );

    // Borrow the identity Kubernetes auth wording, but keep our own error type and reason code
    // so the audit log still records why the login failed.
    const reasonCode =
      status === 401 || status === 403
        ? ResourceAuthLoginFailureReason.TokenReviewForbidden
        : ResourceAuthLoginFailureReason.TokenReviewRequestFailed;
    const message = isAxiosError
      ? handleAxiosError(err, { kubernetesHost }, KubernetesAuthErrorContext.KubernetesApiServer).message
      : `Could not reach the Kubernetes API server at ${kubernetesHost} to review the service account token.`;

    throw new UnauthorizedError({ message, detail: { reasonCode, ...errorContext } });
  }

  // A rejected review comes back as a Status object, where `status` is the string "Failure" rather
  // than the TokenReview result. Anything that is not an object fails the same way, and treating it
  // as one turns a denied login into a 500.
  if (!review?.status || typeof review.status !== "object") {
    const reason =
      (review as unknown as { message?: string })?.message ?? "the response did not contain a review result";
    throw new UnauthorizedError({
      message: `The Kubernetes API server did not return a token review: ${reason}`,
      detail: { reasonCode: ResourceAuthLoginFailureReason.TokenReviewMalformedResponse, ...errorContext }
    });
  }

  if ("error" in review.status) {
    throw new UnauthorizedError({
      message: `Kubernetes token review failed: ${review.status.error}`,
      detail: { reasonCode: ResourceAuthLoginFailureReason.TokenReviewError, ...errorContext }
    });
  }

  if (!review.status.authenticated) {
    throw new UnauthorizedError({
      message: "Access denied: the Kubernetes service account token is not authenticated.",
      detail: { reasonCode: "token_not_authenticated", ...errorContext }
    });
  }

  const { username } = review.status.user;
  let reviewed: { namespace: string; name: string };
  try {
    reviewed = extractK8sUsername(username);
  } catch {
    throw new UnauthorizedError({
      message: `Access denied: '${username}' is not a Kubernetes service account. The gateway must authenticate with a service account token.`,
      detail: { reasonCode: ResourceAuthLoginFailureReason.NotAServiceAccount, ...errorContext }
    });
  }

  return {
    namespace: reviewed.namespace,
    serviceAccountName: reviewed.name,
    audiences: review.status.audiences ?? []
  };
};

const matchesAnyPattern = (value: string, csv: string) =>
  csv
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .some((entry) => entry === value || picomatch.isMatch(value, entry));

type TValidateAllowlistsInput = {
  namespace: string;
  serviceAccountName: string;
  audiences: string[];
  allowedNamespaces: string;
  allowedNames: string;
  allowedAudience: string;
  errorContext: Record<string, unknown>;
};

export const validateKubernetesAllowlists = ({
  namespace,
  serviceAccountName,
  audiences,
  allowedNamespaces,
  allowedNames,
  allowedAudience,
  errorContext
}: TValidateAllowlistsInput) => {
  // The route schema enforces this too, but reaching here with no allowlist would let any pod
  // in the cluster enroll.
  if (!allowedNamespaces.trim() && !allowedNames.trim()) {
    throw new UnauthorizedError({
      message: "Access denied: Kubernetes auth method has no allowlist configured.",
      detail: { reasonCode: ResourceAuthLoginFailureReason.NoAllowlistConfigured, ...errorContext }
    });
  }

  if (allowedNamespaces.trim() && !matchesAnyPattern(namespace, allowedNamespaces)) {
    throw new UnauthorizedError({
      message: `Access denied: Kubernetes namespace '${namespace}' is not allowed.`,
      detail: {
        reasonCode: ResourceAuthLoginFailureReason.NamespaceNotAllowed,
        namespace,
        serviceAccountName,
        ...errorContext
      }
    });
  }

  if (allowedNames.trim() && !matchesAnyPattern(serviceAccountName, allowedNames)) {
    throw new UnauthorizedError({
      message: `Access denied: Kubernetes service account '${serviceAccountName}' is not allowed.`,
      detail: {
        reasonCode: ResourceAuthLoginFailureReason.NameNotAllowed,
        namespace,
        serviceAccountName,
        ...errorContext
      }
    });
  }

  if (allowedAudience.trim() && !audiences.includes(allowedAudience)) {
    throw new UnauthorizedError({
      message: `Access denied: the service account token does not carry the required audience '${allowedAudience}'.`,
      detail: {
        reasonCode: ResourceAuthLoginFailureReason.AudienceNotAllowed,
        namespace,
        serviceAccountName,
        ...errorContext
      }
    });
  }
};
