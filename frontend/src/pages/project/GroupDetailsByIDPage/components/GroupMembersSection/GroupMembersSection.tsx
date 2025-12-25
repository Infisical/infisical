import {
  UnstableCard,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import { TGroupMembership } from "@app/hooks/api/groups/types";

import { GroupMembersTable } from "./GroupMembersTable";

type Props = {
  groupMembership: TGroupMembership;
};

export const GroupMembersSection = ({ groupMembership }: Props) => {
  return (
    <UnstableCard className="flex-1">
      <UnstableCardHeader>
        <UnstableCardTitle>Group Members</UnstableCardTitle>
        <UnstableCardDescription>View members of this group</UnstableCardDescription>
      </UnstableCardHeader>
      <UnstableCardContent>
        <GroupMembersTable groupMembership={groupMembership} />
      </UnstableCardContent>
    </UnstableCard>
  );
};
