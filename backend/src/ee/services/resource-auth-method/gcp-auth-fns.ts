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

// Google caps a signJwt expiry at 12 hours ahead, but accepts a payload with no `exp` at all, and
// jsonwebtoken only enforces an expiry that is present. Without this, anyone who briefly holds
// signJwt on an allowed service account can mint a proof that outlives the revocation of that
// permission.
const MAX_IAM_TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;

export const assertIamTokenLifetime = (payload: { exp?: number } | null, nowSeconds: number) => {
  if (!payload?.exp) return "missing_expiry" as const;
  if (payload.exp <= nowSeconds) return "expired" as const;
  if (payload.exp - nowSeconds > MAX_IAM_TOKEN_LIFETIME_SECONDS) return "lifetime_too_long" as const;
  return null;
};

const IAM_LIFETIME_MESSAGE = {
  missing_expiry: "carries no expiry",
  expired: "has already expired",
  lifetime_too_long: "expires more than 12 hours from now"
} as const;

export const verifyGcpTokenAndExtractCaller = async ({
  type,
  jwt,
  audience,
  errorContext
}: TVerifyGcpTokenInput): Promise<TGcpIdentityDetails> => {
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
    throw new UnauthorizedError({
      message:
        type === GcpAuthType.Gce
          ? "Could not verify the GCP identity token. Check that it was issued for this gateway's ID as the audience."
          : "Could not verify the signed GCP service account token. Check that it was signed for this gateway's ID as the audience.",
      detail: { reasonCode: ResourceAuthLoginFailureReason.GcpTokenVerificationFailed, ...errorContext }
    });
  }

  // Its own reason code, so an operator can tell a token their tooling signed without a bounded
  // expiry apart from a bad signature or a wrong audience.
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

  // A zone allowlist is not an allowlist on its own. Zone names are a global namespace, so any GCP
  // customer can place an instance in one; only a service account or project names something inside
  // this organization.
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

  // A GKE Workload Identity token carries no compute_engine claim, so there is nothing to match a
  // project or zone against. Skipping the check there would authenticate any service account that
  // cleared the (possibly empty) service account allowlist.
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
