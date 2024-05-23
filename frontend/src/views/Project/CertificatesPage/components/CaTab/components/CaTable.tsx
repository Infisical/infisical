import { faCertificate } from "@fortawesome/free-solid-svg-icons";

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
import { useWorkspace } from "@app/context";
import { useListWorkspaceCas } from "@app/hooks/api";
import { caTypeToNameMap } from "@app/hooks/api/ca/constants";

export const CaTable = () => {
  const { currentWorkspace } = useWorkspace();
  const { data, isLoading } = useListWorkspaceCas(currentWorkspace?.slug ?? "");
  return (
    <div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Subject</Th>
              <Th>Status</Th>
              <Th>Type</Th>
            </Tr>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={3} innerKey="project-cas" />}
            {!isLoading &&
              data &&
              data.length > 0 &&
              data.map((ca) => {
                return (
                  <Tr className="h-10" key={`ca-${ca.id}`}>
                    <Td>{ca.dn}</Td>
                    <Td>Pending</Td>
                    <Td>{caTypeToNameMap[ca.type]}</Td>
                  </Tr>
                );
              })}
          </TBody>
        </Table>
        {!isLoading && data?.length === 0 && (
          <EmptyState title="No groups have been added to this project" icon={faCertificate} />
        )}
      </TableContainer>
    </div>
  );
};
