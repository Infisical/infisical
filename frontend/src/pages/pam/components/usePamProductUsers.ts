import { useMemo } from "react";

import { useProject } from "@app/context";
import { useGetWorkspaceUsers } from "@app/hooks/api";

export type TPamProductUser = {
  id: string;
  name: string;
  email: string;
  isPendingInvitation: boolean;
};

// A PAM member can reach the org only through a linked group, so the org member list (direct org rows)
// can't name them. Product membership is a project membership, so the project's user list covers everyone.
export const usePamProductUsers = () => {
  const { currentProject } = useProject();
  const { data: members } = useGetWorkspaceUsers(currentProject.id);

  const users = useMemo<TPamProductUser[]>(
    () =>
      (members ?? []).map((m) => ({
        id: m.user.id,
        name: [m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || m.user.username,
        email: m.user.email ?? m.inviteEmail ?? m.user.username,
        isPendingInvitation: m.user.isOrgMembershipPending
      })),
    [members]
  );
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u] as const)), [users]);

  return { users, userMap };
};
