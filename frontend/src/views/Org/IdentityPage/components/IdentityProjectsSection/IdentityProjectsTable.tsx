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
import { useGetIdentityProjectMemberships } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IdentityProjectRow } from "./IdentityProjectRow";

type Props = {
  identityId: string;
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeIdentityFromProject"]>,
    data?: {}
  ) => void;
};

export const IdentityProjectsTable = ({ identityId, handlePopUpOpen }: Props) => {
  const { data: projectMemberships, isLoading } = useGetIdentityProjectMemberships(identityId);
  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
            <Th>Role</Th>
            <Th>Added On</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={4} innerKey="identity-project-memberships" />}
          {!isLoading &&
            projectMemberships?.map((membership) => {
              return (
                <IdentityProjectRow
                  key={`identity-project-membership-${membership.id}`}
                  membership={membership}
                  handlePopUpOpen={handlePopUpOpen}
                />
              );
            })}
        </TBody>
      </Table>
      {!isLoading && !projectMemberships?.length && (
        <EmptyState title="This identity has not been assigned to any projects" icon={faFolder} />
      )}
    </TableContainer>
  );
};
