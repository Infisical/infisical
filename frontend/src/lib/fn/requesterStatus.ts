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

  const isProjectUser = memberUsernames.has(requesterEmail) || memberUsernames.has(requested);
  const orgUser = orgUsers?.find(
    ({ user }) => matches(user.username) || matches(user.email) || false
  );

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
