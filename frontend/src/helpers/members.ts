import { TWorkspaceUser } from "@app/hooks/api/users/types";

export const getMemberLabel = (member: TWorkspaceUser) => {
  const {
    inviteEmail,
    user: { firstName, lastName, username, email }
  } = member;

  return firstName || lastName
    ? `${firstName ?? ""} ${lastName ?? ""}`.trim()
    : username || email || inviteEmail;
};
