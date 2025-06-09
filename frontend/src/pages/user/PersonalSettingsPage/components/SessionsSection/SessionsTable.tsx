import { faServer } from "@fortawesome/free-solid-svg-icons";

import { createNotification } from "@app/components/notifications";
import {
  DeleteActionModal,
  EmptyState,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { Button } from "@app/components/v2/Button";
import { useGetMySessions, useRevokeMySessionById } from "@app/hooks/api";
import { usePopUp } from "@app/hooks/usePopUp";
import { timeAgo } from "@app/lib/fn/date";
import { formatSessionUserAgent } from "@app/lib/fn/string";

const formatLocalDateTime = (date: Date): string => {
  return date.toLocaleString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
};

export const SessionsTable = () => {
  const { data, isPending } = useGetMySessions();
  const { mutateAsync: revokeMySessionById } = useRevokeMySessionById();
  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteSession"
  ] as const);

  const handleSignOut = async (sessionId: string) => {
    try {
      await revokeMySessionById(sessionId);
      createNotification({
        text: "Session revoked successfully",
        type: "success"
      });
    } catch (error) {
      console.error(error);
      createNotification({
        text: "Failed to revoke session",
        type: "error"
      });
    }

    handlePopUpClose("deleteSession");
  };

  return (
    <>
      <DeleteActionModal
        isOpen={popUp.deleteSession.isOpen}
        title="Are you sure you want to sign out of this session?"
        onChange={(isOpen) => handlePopUpToggle("deleteSession", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          handleSignOut((popUp?.deleteSession?.data as { sessionId: string })?.sessionId)
        }
      />
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th>IP & Session ID</Th>
              <Th>OS & Browser</Th>
              <Th>Last accessed</Th>
              <Th>Manage</Th>
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={4} innerKey="sessions" />}
            {!isPending &&
              data &&
              data.length > 0 &&
              data.map(({ id, createdAt, lastUsed, ip, userAgent }) => {
                const { os, browser } = formatSessionUserAgent(userAgent);
                const lastUsedDate = new Date(lastUsed);
                const createdAtDate = new Date(createdAt);

                return (
                  <Tr className="h-20" key={`session-${id}`}>
                    <Td>
                      <div className="flex flex-col">
                        <span className="font-medium">{ip}</span>
                        <span className="text-sm text-gray-500">ID: {id}</span>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex flex-col">
                        <span className="font-medium">{os}</span>
                        <span className="text-sm text-gray-500">{browser}</span>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex flex-col">
                        <Tooltip content={formatLocalDateTime(lastUsedDate)}>
                          <span className="font-medium">{timeAgo(lastUsedDate, new Date())}</span>
                        </Tooltip>
                        <Tooltip content={formatLocalDateTime(createdAtDate)}>
                          <span className="text-sm text-gray-500">
                            Created {timeAgo(createdAtDate, new Date())}
                          </span>
                        </Tooltip>
                      </div>
                    </Td>
                    <Td>
                      <Button
                        variant="plain"
                        colorSchema="danger"
                        onClick={() => handlePopUpOpen("deleteSession", { sessionId: id })}
                      >
                        Sign out
                      </Button>
                    </Td>
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
    </>
  );
};
