// import { AccessScope, TableName } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";

import { TEmailDomainDALFactory } from "./email-domain-dal";
import { EmailDomainStatus } from "./email-domain-types";

/**
 * Given an email and orgId, verifies the org is allowed to manage a user with this email.
 *
 */
export const verifyEmailDomainOwnership = async ({
  email,
  orgId,
  emailDomainDAL
}: {
  email: string;
  orgId: string;
  emailDomainDAL: Pick<TEmailDomainDALFactory, "findOne">;
}) => {
  const emailDomain = email.split("@")?.[1];
  if (!emailDomain) throw new BadRequestError({ message: "Invalid email address" });

  const verifiedDomain = await emailDomainDAL.findOne({
    domain: emailDomain.toLowerCase().trim(),
    status: EmailDomainStatus.Verified,
    orgId
  });

  if (!verifiedDomain) {
    throw new BadRequestError({
      message:
        "The email you attempted to login in with is not a part of the accepted domains of the selected organization. Please consult with your organization admin for further assistance."
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
