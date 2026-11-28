import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { joinPolicyViolations } from "@app/services/certificate-policy/certificate-policy-fns";

import { ENROLLMENT_TYPE_NAME_MAP, EnrollmentType } from "./certificate-profile-types";

export const certificateProfileNotFoundError = (profileId: string) =>
  new NotFoundError({
    message: `Certificate profile with ID '${profileId}' not found. List your organization's certificate profiles with GET /api/v1/cert-manager/certificate-profiles to find the right ID.`
  });

export const enrollmentTypeMismatchError = (profileEnrollmentType: string, requiredEnrollmentType: string) => {
  const actual =
    ENROLLMENT_TYPE_NAME_MAP[profileEnrollmentType as EnrollmentType] ?? profileEnrollmentType.toUpperCase();
  const required =
    ENROLLMENT_TYPE_NAME_MAP[requiredEnrollmentType as EnrollmentType] ?? requiredEnrollmentType.toUpperCase();
  return new ForbiddenRequestError({
    message: `This certificate profile's enrollment method is ${actual}, not ${required}. Use a profile whose enrollment method is ${required}, or request the certificate through ${actual}.`
  });
};

export const profileHasNoCaError = (profileSlug: string) =>
  new NotFoundError({
    message: `Certificate profile '${profileSlug}' has no certificate authority, and one can't be added to an existing profile. Issue through a profile that has a certificate authority.`
  });

export const selfSignedProfileCannotSignCsrError = (profileSlug: string) =>
  new BadRequestError({
    message: `Certificate profile '${profileSlug}' issues self-signed certificates, which cannot sign a CSR. Use a profile with a certificate authority.`
  });

export const profilePolicyMissingError = () =>
  new NotFoundError({
    message:
      "The certificate policy attached to this certificate profile no longer exists. Issue through a profile whose certificate policy exists."
  });

export const profileDefaultsViolationError = (violations: string[], ttlExceedsMax = false) => {
  const ttlAdvice = ttlExceedsMax
    ? " For a TTL, set defaults.ttlDays to a whole number of days within the policy's maximum. If that maximum is under one day, no default fits: leave ttlDays out and send a ttl with each API request, if the certificate authority can issue certificates valid for less than a day. Otherwise, and for EST, SCEP and ACME, raise the policy's maximum."
    : "";
  return new BadRequestError({
    message: `The profile defaults do not meet the certificate policy: ${joinPolicyViolations(violations)} Infisical checked the defaults as a certificate request, so where a problem says to change the request, change the matching default instead.${ttlAdvice}`
  });
};
