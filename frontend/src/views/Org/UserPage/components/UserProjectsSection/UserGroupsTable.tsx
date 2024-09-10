import { faFolder } from "@fortawesome/free-solid-svg-icons";

import { EmptyState, Table, TableContainer, TBody, Th, THead, Tr } from "@app/components/v2";
import { OrgUser } from "@app/hooks/api/types";
import { useListUserGroupMemberships } from "@app/hooks/api/users/queries";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { UserGroupsRow } from "./UserGroupsRow";

type Props = {
  orgMembership: OrgUser;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["removeUserFromGroup"]>, data?: {}) => void;
};

export const UserGroupsTable = ({ handlePopUpOpen, orgMembership }: Props) => {
  const { data: groups, isLoading } = useListUserGroupMemberships(orgMembership.user.username);

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {groups?.map((group) => (
            <UserGroupsRow
              key={`user-group-${group.id}`}
              group={group}
              handlePopUpOpen={handlePopUpOpen}
            />
          ))}
        </TBody>
      </Table>
      {!isLoading && !groups?.length && (
        <EmptyState title="This user has not been assigned to any groups" icon={faFolder} />
      )}
    </TableContainer>
  );
};
