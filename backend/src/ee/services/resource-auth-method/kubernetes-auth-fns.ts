import { isIP } from "node:net";

import { AxiosError } from "axios";
import picomatch from "picomatch";
import RE2 from "re2";

import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import { safeRequest } from "@app/lib/validator/safe-request";
import {
  handleAxiosError,
  KubernetesAuthErrorContext
} from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-error-handlers";
import { extractK8sUsername } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-fns";
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
// Undefined for a bare IP: SNI carries host names only, so an IP host is matched on IP SANs.
const toServerName = (kubernetesHost: string) => {
  let servername = new RE2("^https?://").replace(kubernetesHost, "");
  const lastColonIndex = servername.lastIndexOf(":");
  if (lastColonIndex !== -1) {
    servername = servername.substring(0, lastColonIndex);
  }
  return isIP(servername) ? undefined : servername;
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
  kubernetesHost,
  caCertificate,
  tokenReviewerJwt,
  verifyTlsCertificate
}: {
  kubernetesHost: string;
  caCertificate?: string;
  tokenReviewerJwt?: string;
  verifyTlsCertificate: boolean;
}) => {
  const host = kubernetesHost.startsWith("https://") ? kubernetesHost : `https://${kubernetesHost}`;

  // Fresh per call: the abort signal must not be shared between the two requests.
  const requestConfig = () => ({
    ca: caCertificate || undefined,
    rejectUnauthorized: verifyTlsCertificate,
    servername: toServerName(kubernetesHost),
    timeout: TOKEN_REVIEW_TIMEOUT_MS,
    signal: AbortSignal.timeout(TOKEN_REVIEW_TIMEOUT_MS),
    maxContentLength: TOKEN_REVIEW_MAX_RESPONSE_BYTES,
    validateStatus: () => true
  });

  const classify = (err: unknown, context: KubernetesAuthErrorContext) => {
    if (err instanceof BadRequestError) return err;
    if (err instanceof AxiosError) return handleAxiosError(err, { kubernetesHost: host }, context);
    return new BadRequestError({
      message: `Failed to reach the Kubernetes API server at ${host}: ${(err as Error).message}`
    });
  };

  let versionStatus: number;
  try {
    const res = await safeRequest.get(`${host}/version`, requestConfig());
    versionStatus = res.status;
  } catch (err) {
    throw classify(err, KubernetesAuthErrorContext.KubernetesHost);
  }
  // 401/403 are fine: /version can require authentication. A 404 means the address does not serve
  // the Kubernetes API at all, which is the common typo and used to save happily.
  if (versionStatus === 404) {
    throw new BadRequestError({
      message: `${host} does not look like a Kubernetes API server: /version returned 404. Verify the host and port.`
    });
  }
  if (versionStatus >= 500) {
    throw new BadRequestError({
      message: `Kubernetes API server at ${host} returned ${versionStatus}. Verify the host is correct and healthy.`
    });
  }

  if (!tokenReviewerJwt) return;

  let review: { status: number; data: unknown };
  try {
    review = await safeRequest.post(
      `${host}${TOKEN_REVIEW_PATH}`,
      {
        apiVersion: TOKEN_REVIEW_API_VERSION,
        kind: TOKEN_REVIEW_KIND,
        spec: { token: TOKEN_REVIEW_PROBE_TOKEN }
      },
      {
        ...requestConfig(),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenReviewerJwt}` }
      }
    );
  } catch (err) {
    throw classify(err, KubernetesAuthErrorContext.KubernetesApiServer);
  }

  if (review.status === 401) {
    throw new BadRequestError({
      message: "The token reviewer JWT is invalid or expired. Provide a valid service account token."
    });
  }
  if (review.status === 403) {
    throw new BadRequestError({
      message:
        "The token reviewer JWT cannot perform TokenReviews. Ensure its service account has the 'system:auth-delegator' ClusterRole binding."
    });
  }
  if (review.status >= 400) {
    const message = (review.data as { message?: string })?.message ?? `HTTP ${review.status}`;
    throw new BadRequestError({ message: `Kubernetes API server rejected the token review check: ${message}` });
  }
};

type TReviewServiceAccountTokenInput = {
  jwt: string;
  kubernetesHost: string;
  caCertificate: string;
  tokenReviewerJwt: string;
  verifyTlsCertificate: boolean;
  allowedAudience: string;
  errorContext: Record<string, unknown>;
};

export const reviewServiceAccountToken = async ({
  jwt,
  kubernetesHost,
  caCertificate,
  tokenReviewerJwt,
  verifyTlsCertificate,
  allowedAudience,
  errorContext
}: TReviewServiceAccountTokenInput) => {
  const baseUrl =
    kubernetesHost.startsWith("http://") || kubernetesHost.startsWith("https://")
      ? kubernetesHost
      : `https://${kubernetesHost}`;

  let review: TCreateTokenReviewResponse;
  try {
    const res = await safeRequest.post<TCreateTokenReviewResponse>(
      `${baseUrl}${TOKEN_REVIEW_PATH}`,
      {
        apiVersion: TOKEN_REVIEW_API_VERSION,
        kind: TOKEN_REVIEW_KIND,
        spec: {
          token: jwt,
          ...(allowedAudience ? { audiences: [allowedAudience] } : {})
        }
      },
      {
        headers: {
          "Content-Type": "application/json",
          // With no reviewer configured the incoming token reviews itself, which works because the
          // Helm chart grants the gateway's service account system:auth-delegator.
          Authorization: `Bearer ${tokenReviewerJwt || jwt}`
        },
        signal: AbortSignal.timeout(TOKEN_REVIEW_TIMEOUT_MS),
        timeout: TOKEN_REVIEW_TIMEOUT_MS,
        maxContentLength: TOKEN_REVIEW_MAX_RESPONSE_BYTES,
        // safeRequest pins the connection to the addresses it validated, so a hostname that
        // re-resolves to a private address between config time and login cannot be reached.
        ca: caCertificate || undefined,
        rejectUnauthorized: verifyTlsCertificate,
        servername: toServerName(kubernetesHost)
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

  if (!review?.status) {
    throw new UnauthorizedError({
      message: "The Kubernetes API server returned an unexpected token review response.",
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
