import { crypto } from "@app/lib/crypto";
import { UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { validateIamIdentity, validateIdTokenIdentity } from "@app/services/identity-gcp-auth/identity-gcp-auth-fns";
import { TGcpIdentityDetails } from "@app/services/identity-gcp-auth/identity-gcp-auth-types";

import { GcpAuthType, ResourceAuthLoginFailureReason, TGcpAuthType } from "./resource-auth-method-fns";

type TVerifyGcpTokenInput = {
  type: TGcpAuthType;
  jwt: string;
  audience: string;
  errorContext: Record<string, unknown>;
};

// signJwt accepts a payload with no `exp`, which would make the proof replayable forever.
const MAX_IAM_TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;

export const IamTokenLifetimeProblem = {
  MissingExpiry: "missing_expiry",
  Expired: "expired",
  LifetimeTooLong: "lifetime_too_long"
} as const;

export type TIamTokenLifetimeProblem = (typeof IamTokenLifetimeProblem)[keyof typeof IamTokenLifetimeProblem];

export const assertIamTokenLifetime = (
  payload: { exp?: number } | null,
  nowSeconds: number
): TIamTokenLifetimeProblem | null => {
  if (!payload?.exp) return IamTokenLifetimeProblem.MissingExpiry;
  if (payload.exp <= nowSeconds) return IamTokenLifetimeProblem.Expired;
  if (payload.exp - nowSeconds > MAX_IAM_TOKEN_LIFETIME_SECONDS) return IamTokenLifetimeProblem.LifetimeTooLong;
  return null;
};

const IAM_LIFETIME_MESSAGE: Record<TIamTokenLifetimeProblem, string> = {
  [IamTokenLifetimeProblem.MissingExpiry]: "carries no expiry",
  [IamTokenLifetimeProblem.Expired]: "has already expired",
  [IamTokenLifetimeProblem.LifetimeTooLong]: "expires more than 12 hours from now"
};

export const verifyGcpTokenAndExtractCaller = async ({
  type,
  jwt,
  audience,
  errorContext
}: TVerifyGcpTokenInput): Promise<TGcpIdentityDetails> => {
  // A token that does not even parse is the caller's mistake, not a verification outcome.
  const unverifiedPayload = crypto.jwt().decode(jwt) as { email?: string } | null;
  if (!unverifiedPayload) {
    throw new UnauthorizedError({
      message: "Access denied: the GCP token could not be parsed as a JWT.",
      detail: { reasonCode: ResourceAuthLoginFailureReason.GcpMalformedToken, ...errorContext }
    });
  }

  // A metadata token requested with format=standard carries no email, so there is no service
  // account to match. Reading an unverified claim is safe here because it only decides which
  // refusal to report; the signature is still checked below.
  if (type === GcpAuthType.Gce && !unverifiedPayload.email) {
    throw new UnauthorizedError({
      message:
        "Access denied: the GCP identity token carries no service account email. Request it with format=full rather than format=standard.",
      detail: { reasonCode: ResourceAuthLoginFailureReason.GcpMissingEmailClaim, ...errorContext }
    });
  }

  let identityDetails: TGcpIdentityDetails;
  try {
    identityDetails =
      type === GcpAuthType.Gce
        ? await validateIdTokenIdentity({ audience, jwt })
        : await validateIamIdentity({ audience, jwt });
  } catch (err) {
    logger.error(
      err,
      `Resource GCP Auth Login: token verification failed [resourceId=${String(errorContext.resourceId)}]`
    );

    // The validators raise UnauthorizedError when a claim is wrong and anything else when the
    // signature check or the call to Google fails, so the two are worth telling apart.
    const claimRejected = err instanceof UnauthorizedError;
    throw new UnauthorizedError({
      message: claimRejected
        ? "Access denied: the GCP token's claims were rejected. Check that it was issued for this gateway's ID as the audience, and that it carries a service account identity."
        : "Access denied: the GCP token could not be verified against Google's signing keys. This is a bad signature, an expired token, or Google being unreachable.",
      detail: {
        reasonCode: claimRejected
          ? ResourceAuthLoginFailureReason.GcpTokenRejected
          : ResourceAuthLoginFailureReason.GcpTokenVerificationFailed,
        ...errorContext
      }
    });
  }

  if (type === GcpAuthType.Iam) {
    const payload = crypto.jwt().decode(jwt) as { exp?: number } | null;
    const lifetimeProblem = assertIamTokenLifetime(payload, Math.floor(Date.now() / 1000));
    if (lifetimeProblem) {
      throw new UnauthorizedError({
        message: `Access denied: the signed GCP service account token ${IAM_LIFETIME_MESSAGE[lifetimeProblem]}. It must carry an expiry no more than 12 hours ahead.`,
        detail: { reasonCode: ResourceAuthLoginFailureReason.GcpTokenLifetimeRejected, ...errorContext }
      });
    }
  }

  return identityDetails;
};

const splitAllowlist = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

type TValidateGcpAllowlistsInput = {
  type: TGcpAuthType;
  identityDetails: TGcpIdentityDetails;
  allowedServiceAccounts: string;
  allowedProjects: string;
  allowedZones: string;
  errorContext: Record<string, unknown>;
};

export const validateGcpAllowlists = ({
  type,
  identityDetails,
  allowedServiceAccounts,
  allowedProjects,
  allowedZones,
  errorContext
}: TValidateGcpAllowlistsInput) => {
  const serviceAccounts = splitAllowlist(allowedServiceAccounts);
  const projects = splitAllowlist(allowedProjects);
  const zones = splitAllowlist(allowedZones);

  // Zone names are a global namespace, so a zone-only config restricts nobody.
  if (!serviceAccounts.length && !projects.length) {
    throw new UnauthorizedError({
      message: zones.length
        ? "Access denied: GCP auth method restricts only by zone, which any GCP customer can match. Add an allowed service account or project."
        : "Access denied: GCP auth method has no allowlist configured.",
      detail: { reasonCode: ResourceAuthLoginFailureReason.NoAllowlistConfigured, ...errorContext }
    });
  }

  if (serviceAccounts.length && !serviceAccounts.includes(identityDetails.email)) {
    throw new UnauthorizedError({
      message: `Access denied: GCP service account not allowed. [service-account=${identityDetails.email}]`,
      detail: {
        reasonCode: ResourceAuthLoginFailureReason.ServiceAccountNotAllowed,
        serviceAccountEmail: identityDetails.email,
        ...errorContext
      }
    });
  }

  if (!projects.length && !zones.length) return;

  // A GKE workload identity token has no compute_engine claim; skipping would authenticate anything.
  const { computeEngineDetails } = identityDetails;
  if (type !== GcpAuthType.Gce || !computeEngineDetails) {
    throw new UnauthorizedError({
      message:
        "Access denied: this GCP token carries no Compute Engine instance details, so the allowed projects and zones cannot be verified. Remove those allowlists and restrict by service account instead, or authenticate from a Compute Engine instance.",
      detail: {
        reasonCode: ResourceAuthLoginFailureReason.ComputeEngineDetailsMissing,
        serviceAccountEmail: identityDetails.email,
        ...errorContext
      }
    });
  }

  if (projects.length && !projects.includes(computeEngineDetails.project_id)) {
    throw new UnauthorizedError({
      message: `Access denied: GCP project not allowed. [project=${computeEngineDetails.project_id}]`,
      detail: {
        reasonCode: ResourceAuthLoginFailureReason.ProjectNotAllowed,
        serviceAccountEmail: identityDetails.email,
        projectId: computeEngineDetails.project_id,
        ...errorContext
      }
    });
  }

  if (zones.length && !zones.includes(computeEngineDetails.zone)) {
    throw new UnauthorizedError({
      message: `Access denied: GCP zone not allowed. [zone=${computeEngineDetails.zone}]`,
      detail: {
        reasonCode: ResourceAuthLoginFailureReason.ZoneNotAllowed,
        serviceAccountEmail: identityDetails.email,
        projectId: computeEngineDetails.project_id,
        zone: computeEngineDetails.zone,
        ...errorContext
      }
    });
  }
};
