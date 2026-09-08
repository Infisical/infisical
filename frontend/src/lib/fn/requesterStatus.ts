import { OrgUser } from "@app/hooks/api/users/types";

export type TRequesterStatus = {
  isProjectUser: boolean;
  userLabel: string;
  orgUser?: OrgUser;
};

// Resolves the ?requesterEmail= deep link into a display label and pre-fill target.
export const getRequesterStatus = (
  requesterEmail: string | undefined,
  orgUsers: OrgUser[] | undefined,
  memberUsernames: { has: (username: string) => boolean }
): TRequesterStatus => {
  if (!requesterEmail) return { isProjectUser: false, userLabel: "" };

  // The link carries users.email verbatim while username is a lowercased copy of it, and only
  // username is guaranteed to be set, so match either one case-insensitively.
  const requested = requesterEmail.toLowerCase();
  const matches = (value: string | undefined) => value?.toLowerCase() === requested;

  // Username first, so a username hit always wins: email is not guaranteed unique against other
  // users' usernames, and matching the wrong person here would preselect them for an access grant.
  const orgUser =
    orgUsers?.find(({ user }) => matches(user.username)) ??
    orgUsers?.find(({ user }) => matches(user.email));

  // Derived from the resolved row, not the raw link: where usernames aren't copies of emails (LDAP,
  // SAML with a non-email nameID) a raw lookup misses an existing member and we'd offer to grant
  // access they already have.
  const isProjectUser = orgUser
    ? memberUsernames.has(orgUser.user.username)
    : memberUsernames.has(requesterEmail) || memberUsernames.has(requested);

  let userLabel = "";
  if (orgUser) {
    const { firstName, lastName, email } = orgUser.user;
    userLabel =
      firstName && lastName
        ? `${firstName} ${lastName}`
        : firstName || lastName || email || orgUser.inviteEmail;
  }

  return { isProjectUser, userLabel, orgUser };
};
