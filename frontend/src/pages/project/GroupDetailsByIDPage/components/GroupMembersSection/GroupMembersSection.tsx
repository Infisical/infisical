import { TGroupMembership } from "@app/hooks/api/groups/types";

import { GroupMembersTable } from "./GroupMembersTable";

type Props = {
  groupMembership: TGroupMembership;
};

export const GroupMembersSection = ({ groupMembership }: Props) => {
  return (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-medium text-mineshaft-100">Group Members</h3>
      </div>
      <div className="py-4">
        <GroupMembersTable groupMembership={groupMembership} />
      </div>
    </div>
  );
};
