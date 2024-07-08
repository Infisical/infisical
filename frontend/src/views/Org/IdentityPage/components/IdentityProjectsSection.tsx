import { faKey } from "@fortawesome/free-solid-svg-icons";

import {
  EmptyState,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useGetIdentityProjectMemberships } from "@app/hooks/api";

type Props = {
  identityId: string;
};

export const IdentityProjectsSection = ({ identityId }: Props) => {
  const { data: projectMemberships, isLoading } = useGetIdentityProjectMemberships(identityId);
  return (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Projects</h3>
      </div>
      <div className="py-4">
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>Name</Th>
                <Th>Role</Th>
              </Tr>
            </THead>
            <TBody>
              {isLoading && <TableSkeleton columns={2} innerKey="identity-project-memberships" />}
              {!isLoading &&
                projectMemberships?.map((membership: any) => {
                  // TODO: fix any
                  return (
                    <Tr className="h-10" key={`identity-project-membership-${membership.id}`}>
                      <Td>{membership.project.name}</Td>
                      <Td>{membership.roles[0].role}</Td>
                    </Tr>
                  );
                })}
            </TBody>
          </Table>
          {!isLoading && !projectMemberships?.length && (
            <EmptyState title="This identity has not been assigned to any projects" icon={faKey} />
          )}
        </TableContainer>
      </div>
    </div>
  );
};
