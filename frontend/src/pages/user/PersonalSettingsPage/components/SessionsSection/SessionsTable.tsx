import { faServer } from "@fortawesome/free-solid-svg-icons";

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
import { useGetMySessions } from "@app/hooks/api";

export const SessionsTable = () => {
  const { data, isPending } = useGetMySessions();

  const formatDate = (dateToFormat: string) => {
    const date = new Date(dateToFormat);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    const formattedDate = `${day}/${month}/${year}`;

    return formattedDate;
  };

  return (
    <TableContainer className="mt-4">
      <Table>
        <THead>
          <Tr>
            <Th>Created</Th>
            <Th>Last active</Th>
            <Th>IP address</Th>
            <Th>Device</Th>
          </Tr>
        </THead>
        <TBody>
          {isPending && <TableSkeleton columns={4} innerKey="sesssions" />}
          {!isPending &&
            data &&
            data.length > 0 &&
            data.map(({ id, createdAt, lastUsed, ip, userAgent }) => {
              return (
                <Tr className="h-10" key={`session-${id}`}>
                  <Td>{formatDate(createdAt)}</Td>
                  <Td>{formatDate(lastUsed)}</Td>
                  <Td>{ip}</Td>
                  <Td>{userAgent}</Td>
                </Tr>
              );
            })}
          {!isPending && data && data?.length === 0 && (
            <Tr>
              <Td colSpan={4}>
                <EmptyState title="No sessions on file" icon={faServer} />
              </Td>
            </Tr>
          )}
        </TBody>
      </Table>
    </TableContainer>
  );
};
