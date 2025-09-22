import { TGroupMembership, TGroupType } from "@app/hooks/api/groups/types";

import { GroupIdentitiesTable } from "./GroupIdentitiesTable";
import { GroupMembersTable } from "./GroupMembersTable";

type Props = {
  groupMembership: TGroupMembership;
};

export const GroupMembersSection = ({ groupMembership }: Props) => {
  const isUsersGroup = groupMembership.group.type === TGroupType.USERS;
  return (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">
          {isUsersGroup ? "Group Members" : "Group Identities"}
        </h3>
      </div>
      <div className="py-4">
        {isUsersGroup ? (
          <GroupMembersTable groupMembership={groupMembership} />
        ) : (
          <GroupIdentitiesTable groupMembership={groupMembership} />
        )}
      </div>
    </div>
  );
};
