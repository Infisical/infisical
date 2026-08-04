import { isIP } from "node:net";

import { AxiosError } from "axios";
import https from "https";
import picomatch from "picomatch";
import RE2 from "re2";

import { request } from "@app/lib/config/request";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator";
import {
  handleAxiosError,
  KubernetesAuthErrorContext
} from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-error-handlers";
import { extractK8sUsername } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-fns";
import { TCreateTokenReviewResponse } from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-types";
import {
  validateKubernetesHostConnectivity,
  validateTokenReviewerPermissions
} from "@app/services/identity-kubernetes-auth/identity-kubernetes-auth-validators";

const TOKEN_REVIEW_TIMEOUT_MS = 10_000;

// The host is operator-supplied and the backend POSTs to it on every login, so without this an
// org admin could use the auth config to reach hosts inside our own network. Does a DNS lookup,
// so call it outside a transaction.
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

// Verification is impossible without a CA, since cluster CAs are in no public trust store.
export const resolveEffectiveVerifyTlsCertificate = (caCertificate: string, storedVerify: boolean) => {
  if (!caCertificate.length) return false;
  return storedVerify;
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
  const effectiveVerify = resolveEffectiveVerifyTlsCertificate(caCertificate ?? "", verifyTlsCertificate);

  await validateKubernetesHostConnectivity({
    kubernetesHost: host,
    caCert: caCertificate,
    verifyTlsCertificate: effectiveVerify
  });

  if (tokenReviewerJwt) {
    await validateTokenReviewerPermissions({
      kubernetesHost: host,
      tokenReviewerJwt,
      caCert: caCertificate,
      verifyTlsCertificate: effectiveVerify
    });
  }
};

// Undefined for a bare IP: SNI carries host names only, so an IP host is matched on IP SANs.
const toServerName = (kubernetesHost: string) => {
  let servername = new RE2("^https?://").replace(kubernetesHost, "");
  const lastColonIndex = servername.lastIndexOf(":");
  if (lastColonIndex !== -1) {
    servername = servername.substring(0, lastColonIndex);
  }
  return isIP(servername) ? undefined : servername;
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
    const res = await request.post<TCreateTokenReviewResponse>(
      `${baseUrl}/apis/authentication.k8s.io/v1/tokenreviews`,
      {
        apiVersion: "authentication.k8s.io/v1",
        kind: "TokenReview",
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
        httpsAgent: new https.Agent({
          ca: caCertificate || undefined,
          rejectUnauthorized: resolveEffectiveVerifyTlsCertificate(caCertificate, verifyTlsCertificate),
          servername: toServerName(kubernetesHost)
        })
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
    const reasonCode = status === 401 || status === 403 ? "token_review_forbidden" : "token_review_request_failed";
    const message = isAxiosError
      ? handleAxiosError(err, { kubernetesHost }, KubernetesAuthErrorContext.KubernetesApiServer).message
      : `Could not reach the Kubernetes API server at ${kubernetesHost} to review the service account token.`;

    throw new UnauthorizedError({ message, detail: { reasonCode, ...errorContext } });
  }

  if (!review?.status) {
    throw new UnauthorizedError({
      message: "The Kubernetes API server returned an unexpected token review response.",
      detail: { reasonCode: "token_review_malformed_response", ...errorContext }
    });
  }

  if ("error" in review.status) {
    throw new UnauthorizedError({
      message: `Kubernetes token review failed: ${review.status.error}`,
      detail: { reasonCode: "token_review_error", ...errorContext }
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
      detail: { reasonCode: "not_a_service_account", ...errorContext }
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
      detail: { reasonCode: "no_allowlist_configured", ...errorContext }
    });
  }

  if (allowedNamespaces.trim() && !matchesAnyPattern(namespace, allowedNamespaces)) {
    throw new UnauthorizedError({
      message: `Access denied: Kubernetes namespace '${namespace}' is not allowed.`,
      detail: { reasonCode: "namespace_not_allowed", namespace, serviceAccountName, ...errorContext }
    });
  }

  if (allowedNames.trim() && !matchesAnyPattern(serviceAccountName, allowedNames)) {
    throw new UnauthorizedError({
      message: `Access denied: Kubernetes service account '${serviceAccountName}' is not allowed.`,
      detail: { reasonCode: "name_not_allowed", namespace, serviceAccountName, ...errorContext }
    });
  }

  if (allowedAudience.trim() && !audiences.includes(allowedAudience)) {
    throw new UnauthorizedError({
      message: `Access denied: the service account token does not carry the required audience '${allowedAudience}'.`,
      detail: { reasonCode: "audience_not_allowed", namespace, serviceAccountName, ...errorContext }
    });
  }
};
