import { Fragment } from "react/jsx-runtime";
import { faFile, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
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
import { useOrganization } from "@app/context";
import { formatDateTime } from "@app/helpers/datetime";
import { useGetScimEvents } from "@app/hooks/api/scim/queries";
import { ScimEvent, ScimEventData } from "@app/hooks/api/scim/types";

export const ScimEvents = () => {
  const { currentOrg } = useOrganization();
  const {
    data: scimEvents,
    isPending,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage
  } = useGetScimEvents({
    fromDate: "30d",
    disabled: !currentOrg?.scimEnabled
  });

  if (!currentOrg?.scimEnabled) return null;

  const isEmpty = !isPending && !scimEvents?.pages?.[0].length;

  const getEntityDetails = (event: ScimEventData) => {
    if (event.eventType.includes("users")) {
      if (event.eventType === ScimEvent.LIST_USERS)
        return `Number of users: ${event.event?.numberOfUsers}`;

      return event.event?.email;
    }
    if (event.eventType.includes("group")) {
      if (event.eventType === ScimEvent.LIST_GROUPS)
        return `Number of groups: ${event.event?.numberOfGroups}`;

      return event.event?.groupName;
    }
    return "";
  };

  return (
    <div className="mt-4 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
      <div>
        <p className="text-xl font-medium text-gray-200">SCIM Events</p>
        <p className="mt-1 mb-4 text-sm text-gray-400">
          List of all SCIM events that were successfully provisioned from the SCIM server
        </p>
      </div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th className="w-64">Timestamp</Th>
              <Th>Event</Th>
              <Th>Entity</Th>
            </Tr>
          </THead>
          <TBody>
            {!isPending &&
              scimEvents?.pages?.map((group, i) => (
                <Fragment key={`audit-log-fragment-${i + 1}`}>
                  {group.map((scimEvent) => (
                    <Tr
                      key={`audit-log-${scimEvent.id}`}
                      className="group h-10 cursor-pointer border-x-0 border-t-0 border-b hover:bg-mineshaft-700"
                      role="button"
                      tabIndex={0}
                    >
                      <Td className="align-top">
                        {formatDateTime({ timestamp: scimEvent.createdAt })}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-4 text-sm">{scimEvent.eventType}</div>
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-4 text-sm">
                          {getEntityDetails(scimEvent)}
                          <div>
                            <Tooltip
                              content={
                                <div className="my-1 max-h-96 thin-scrollbar overflow-auto rounded-sm border border-mineshaft-600 bg-bunker-800 p-2 font-mono leading-6 whitespace-pre-wrap">
                                  {JSON.stringify(scimEvent, null, 4)}
                                </div>
                              }
                              className="max-w-xl"
                            >
                              <FontAwesomeIcon
                                icon={faInfoCircle}
                                className="opacity-0 transition-all group-hover:opacity-100"
                              />
                            </Tooltip>
                          </div>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </Fragment>
              ))}
            {isPending && <TableSkeleton innerKey="logs-table" columns={3} key="logs-loading" />}
            {isEmpty && (
              <Tr>
                <Td colSpan={3}>
                  <EmptyState title="No scim events on file" icon={faFile} />
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </TableContainer>
      {!isEmpty && (
        <Button
          className="mt-4 px-4 py-3 text-sm"
          isFullWidth
          variant="outline_bg"
          isLoading={isFetchingNextPage}
          isDisabled={isFetchingNextPage || !hasNextPage}
          onClick={() => fetchNextPage()}
        >
          {hasNextPage ? "Load More" : "End of logs"}
        </Button>
      )}
    </div>
  );
};
