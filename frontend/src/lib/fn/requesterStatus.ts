import { OrgUser } from "@app/hooks/api/users/types";

export type TRequesterStatus = {
  isProjectUser: boolean;
  userLabel: string;
  userId?: string;
};

// Shared by the "add member" modals (generic and PAM) to resolve the `?requesterEmail=` deep link
// from a project-access-request email into a display label and pre-fill target.
// `memberUsernames` accepts a Set or Map since call sites already build one or the other.
export const getRequesterStatus = (
  requesterEmail: string | undefined,
  orgUsers: OrgUser[] | undefined,
  memberUsernames: { has: (username: string) => boolean }
): TRequesterStatus => {
  if (!requesterEmail) return { isProjectUser: false, userLabel: "" };

  const isProjectUser = memberUsernames.has(requesterEmail);
  const userDetails = orgUsers?.find((el) => el.user.username === requesterEmail);

  let userLabel = "";
  if (userDetails) {
    const { firstName, lastName, email } = userDetails.user;
    userLabel =
      firstName && lastName
        ? `${firstName} ${lastName}`
        : firstName || lastName || (email as string);
  }

  return { isProjectUser, userLabel, userId: userDetails?.id };
};
