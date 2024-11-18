import { faFolder } from "@fortawesome/free-solid-svg-icons";

import {
  EmptyState,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useGetOrgMembershipProjectMemberships } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { UserProjectRow } from "./UserProjectRow";

type Props = {
  membershipId: string;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["removeUserFromProject"]>, data?: {}) => void;
};

export const UserProjectsTable = ({ membershipId, handlePopUpOpen }: Props) => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id || "";

  const { data: projectMemberships, isLoading } = useGetOrgMembershipProjectMemberships(
    orgId,
    membershipId
  );

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
            <Th>Role</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={3} innerKey="user-project-memberships" />}
          {!isLoading &&
            projectMemberships?.map((membership) => {
              return (
                <UserProjectRow
                  key={`user-project-membership-${membership.id}`}
                  membership={membership}
                  handlePopUpOpen={handlePopUpOpen}
                />
              );
            })}
        </TBody>
      </Table>
      {!isLoading && !projectMemberships?.length && (
        <EmptyState title="This user has not been assigned to any projects" icon={faFolder} />
      )}
    </TableContainer>
  );
};
