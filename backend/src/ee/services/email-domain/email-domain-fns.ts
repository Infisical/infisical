import { getHostname } from "tldts";

import { AccessScope, TableName } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { TEmailDomainDALFactory } from "./email-domain-dal";
import { EmailDomainStatus } from "./email-domain-types";

/**
 * Given an email and orgId, verifies the org is allowed to manage a user with this email.
 *
 * Two-tier check:
 * 1. If the email domain has a verified record → it must belong to this org, else throw.
 * 2. If no verified domain → if a userId is provided, check if that user exists in another org.
 *    If so, throw — the org must verify the domain first to manage cross-org users.
 */
export const verifyEmailDomainOwnership = async ({
  email,
  orgId,
  emailDomainDAL,
  orgDAL,
  userId
}: {
  email: string;
  orgId: string;
  emailDomainDAL: Pick<TEmailDomainDALFactory, "findOne">;
  orgDAL: Pick<TOrgDALFactory, "findMembership">;
  userId?: string;
}) => {
  const emailDomain = getHostname(email);
  if (!emailDomain) throw new BadRequestError({ message: "Invalid email address" });

  // Tier 1: Check verified domain ownership
  const verifiedDomain = await emailDomainDAL.findOne({
    domain: emailDomain,
    status: EmailDomainStatus.Verified
  });

  if (verifiedDomain) {
    if (verifiedDomain.orgId !== orgId) {
      throw new BadRequestError({
        message: `The email domain "${emailDomain}" is verified by another organization. This operation is not allowed.`
      });
    }
    return;
  }

  // Tier 2: No verified domain — check if user exists in other orgs
  if (!userId) return;

  const existingMemberships = await orgDAL.findMembership({
    [`${TableName.Membership}.actorUserId` as "actorUserId"]: userId,
    [`${TableName.Membership}.scope` as "scope"]: AccessScope.Organization
  });

  const belongsToOtherOrg = existingMemberships.some((m) => m.scopeOrgId !== orgId);
  if (belongsToOtherOrg) {
    throw new BadRequestError({
      message: `This user belongs to another organization. To manage users with this email domain, please verify "${emailDomain}" in your organization's email domain settings first.`
    });
  }
};

/**
 * Given a domain string, finds the verified email domain record
 * and returns its orgId. Returns undefined if no verified record exists.
 */
export const findOrgIdByVerifiedDomain = async ({
  domain,
  emailDomainDAL
}: {
  domain: string;
  emailDomainDAL: Pick<TEmailDomainDALFactory, "findOne">;
}) => {
  const normalizedDomain = domain.toLowerCase().trim();

  const verifiedDomain = await emailDomainDAL.findOne({
    domain: normalizedDomain,
    status: EmailDomainStatus.Verified
  });

  return verifiedDomain ?? undefined;
};
