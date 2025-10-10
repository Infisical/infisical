import { TGroupMembership } from "@app/hooks/api/groups/types";

import { GroupMembersTable } from "./GroupMembersTable";

type Props = {
  groupMembership: TGroupMembership;
};

export const GroupMembersSection = ({ groupMembership }: Props) => {
  return (
    <div className="border-mineshaft-600 bg-mineshaft-900 w-full rounded-lg border p-4">
      <div className="border-mineshaft-400 flex items-center justify-between border-b pb-4">
        <h3 className="text-mineshaft-100 text-lg font-medium">Group Members</h3>
      </div>
      <div className="py-4">
        <GroupMembersTable groupMembership={groupMembership} />
      </div>
    </div>
  );
};
