import { TEmailDomains } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";

import { TEmailDomainDALFactory } from "./email-domain-dal";
import { EmailDomainStatus } from "./email-domain-types";

/**
 * Given an email and orgId, verifies the org is allowed to manage a user with this email and
 * returns the verified domain record.
 */
export const verifyEmailDomainOwnership = async ({
  email,
  orgId,
  emailDomainDAL
}: {
  email: string;
  orgId: string;
  emailDomainDAL: Pick<TEmailDomainDALFactory, "findOne">;
}): Promise<TEmailDomains> => {
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

  return verifiedDomain;
};

/**
 * Whether an org may treat its IdP's assertion as proof of the user's mailbox. Only the org that
 * verified the domain may: SSO enforcement on its own is the org vouching for an address it does
 * not necessarily own, so it never counts without the domain.
 */
export const isIdpAuthoritativeForDomain = ({
  isAuthEnforced,
  ownedDomain
}: {
  isAuthEnforced?: boolean | null;
  ownedDomain?: Pick<TEmailDomains, "id"> | null;
}) => Boolean(isAuthEnforced) && Boolean(ownedDomain);

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
