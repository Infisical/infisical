import { useMemo } from "react";

import { useProject } from "@app/context";
import { useGetWorkspaceUsers } from "@app/hooks/api";

export type TPamProductUser = {
  id: string;
  name: string;
  email: string;
  isPendingInvitation: boolean;
  isGroupMember: boolean;
};

// A PAM member can reach the org only through a linked group, so the org member list (direct org rows)
// can't name them. Product membership is a project membership, so the project's user list, group-derived
// members included, covers everyone who can hold a folder or account membership or an approver slot.
// `isGroupMember` marks users without a direct product row, which the add-member routes still require.
export const usePamProductUsers = () => {
  const { currentProject } = useProject();
  const { data: members } = useGetWorkspaceUsers(currentProject.id, true);

  const users = useMemo<TPamProductUser[]>(
    () =>
      (members ?? []).map((m) => ({
        id: m.user.id,
        name: [m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || m.user.username,
        email: m.user.email ?? m.inviteEmail ?? m.user.username,
        isPendingInvitation: Boolean(m.user.isOrgMembershipPending),
        isGroupMember: m.isGroupMember
      })),
    [members]
  );
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u] as const)), [users]);

  return { users, userMap };
};
