import { faKey, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { createNotification } from "@app/components/notifications";
import {
  EmptyState,
  IconButton,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useDeleteAPIKey, useGetMyAPIKeys } from "@app/hooks/api";

export const APIKeyTable = () => {
  const { data, isPending } = useGetMyAPIKeys();
  const { mutateAsync } = useDeleteAPIKey();

  const handleDeleteAPIKeyDataClick = async (apiKeyDataId: string) => {
    await mutateAsync(apiKeyDataId);
    createNotification({
      text: "Successfully deleted API key",
      type: "success"
    });
  };

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th className="flex-1">Name</Th>
            <Th className="flex-1">Last active</Th>
            <Th className="flex-1">Created</Th>
            <Th className="flex-1">Expiration</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isPending && <TableSkeleton columns={4} innerKey="api-keys" />}
          {!isPending &&
            data &&
            data.length > 0 &&
            data.map(({ id, name, createdAt, expiresAt, lastUsed }) => {
              return (
                <Tr className="h-10" key={`api-key-${id}`}>
                  <Td>{name}</Td>
                  <Td>{format(new Date(lastUsed), "yyyy-MM-dd")}</Td>
                  <Td>{format(new Date(createdAt), "yyyy-MM-dd")}</Td>
                  <Td>{format(new Date(expiresAt), "yyyy-MM-dd")}</Td>
                  <Td>
                    <IconButton
                      onClick={async () => {
                        await handleDeleteAPIKeyDataClick(id);
                      }}
                      size="lg"
                      colorSchema="danger"
                      variant="plain"
                      ariaLabel="update"
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </IconButton>
                  </Td>
                </Tr>
              );
            })}
          {!isPending && data && data?.length === 0 && (
            <Tr>
              <Td colSpan={5}>
                <EmptyState title="No API Keys on file" icon={faKey} />
              </Td>
            </Tr>
          )}
        </TBody>
      </Table>
    </TableContainer>
  );
};
