import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";
import { TGroupMembership } from "@app/hooks/api/groups/types";

import { GroupMembersTable } from "./GroupMembersTable";

type Props = {
  groupMembership: TGroupMembership;
};

export const GroupMembersSection = ({ groupMembership }: Props) => {
  return (
    <Card className="flex-1">
      <CardHeader>
        <CardTitle>Group Members</CardTitle>
        <CardDescription>View members of this group</CardDescription>
      </CardHeader>
      <CardContent>
        <GroupMembersTable groupMembership={groupMembership} />
      </CardContent>
    </Card>
  );
};
