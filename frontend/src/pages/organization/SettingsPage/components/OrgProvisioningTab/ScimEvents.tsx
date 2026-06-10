import { Fragment } from "react/jsx-runtime";
import { Info, ScrollText } from "lucide-react";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
    since: "30d",
    disabled: !currentOrg?.scimEnabled
  });

  if (!currentOrg?.scimEnabled) return null;

  const isEmpty = !isPending && !scimEvents?.pages?.[0].length;

  const getEntityDetails = (event: ScimEventData) => {
    if (event.eventType.includes("user")) {
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
    <Card>
      <CardHeader>
        <CardTitle>
          <ScrollText className="size-4 text-accent" />
          SCIM Events
        </CardTitle>
        <CardDescription>
          List of all SCIM events that were successfully provisioned from the SCIM server.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No SCIM events</EmptyTitle>
              <EmptyDescription>
                SCIM events provisioned from your SCIM server will appear here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-64">Timestamp</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Entity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending &&
                  Array.from({ length: 5 }).map((_, idx) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableRow key={`scim-event-skeleton-${idx}`}>
                      <TableCell colSpan={3}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!isPending &&
                  scimEvents?.pages?.map((group, i) => (
                    <Fragment key={`scim-events-fragment-${i + 1}`}>
                      {group.map((scimEvent) => (
                        <TableRow key={`scim-events-${scimEvent.id}`} className="group">
                          <TableCell>
                            {formatDateTime({ timestamp: scimEvent.createdAt })}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-4 text-sm">
                              {scimEvent.eventType}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              {getEntityDetails(scimEvent)}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Info className="size-3.5 text-muted opacity-0 transition-all group-hover:opacity-100" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xl">
                                  <div className="my-1 max-h-96 thin-scrollbar overflow-auto rounded-sm border border-border bg-bunker-800 p-2 font-mono leading-6 whitespace-pre-wrap">
                                    {JSON.stringify(scimEvent, null, 4)}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  ))}
              </TableBody>
            </Table>
            <Button
              className="mt-4"
              isFullWidth
              variant="outline"
              isPending={isFetchingNextPage}
              isDisabled={isFetchingNextPage || !hasNextPage}
              onClick={() => fetchNextPage()}
            >
              {hasNextPage ? "Load More" : "End of Logs"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
