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

export const verifyGcpTokenAndExtractCaller = async ({
  type,
  jwt,
  audience,
  errorContext
}: TVerifyGcpTokenInput): Promise<TGcpIdentityDetails> => {
  try {
    if (type === GcpAuthType.Gce) {
      return await validateIdTokenIdentity({ audience, jwt });
    }
    return await validateIamIdentity({ audience, jwt });
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
