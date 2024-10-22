import { faKey } from "@fortawesome/free-solid-svg-icons";

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
import { useWorkspace } from "@app/context";
import { useGetUserSecrets } from "@app/hooks/api/userSecrets/queries";

import { UserSecretsRow } from "./UserSecretsRow";

export const UserSecretsTable = () => {
  const { currentWorkspace } = useWorkspace();
  const { isLoading, data } = useGetUserSecrets({
    workspaceId: currentWorkspace?.id ?? "",
    environment: "prod",
    options: {
      enabled: !!currentWorkspace?.id
    }
  });
  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
            <Th>Type</Th>
            <Th>Created At</Th>
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={7} innerKey="shared-secrets" />}
          {!isLoading && data?.map((row) => <UserSecretsRow key={row.id} row={row} />)}
        </TBody>
      </Table>

      {!isLoading && !data?.length && <EmptyState title="No user secrets" icon={faKey} />}
    </TableContainer>
  );
};
