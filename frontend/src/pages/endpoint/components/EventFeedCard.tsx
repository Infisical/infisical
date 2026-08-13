import { ReactNode, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ActivityIcon } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
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
import { EndpointEventType, TEndpointEvent, useListEndpointEvents } from "@app/hooks/api/endpoint";

const EVENT_LABEL: Record<EndpointEventType, string> = {
  [EndpointEventType.AgentStarted]: "Agent Started",
  [EndpointEventType.AgentStopped]: "Agent Stopped",
  [EndpointEventType.NetworkPolicyApplied]: "Network Policy Applied",
  [EndpointEventType.NetworkDestinationBlocked]: "Destination Blocked",
  [EndpointEventType.NetworkTransferThresholdTripped]: "Volume Threshold Tripped",
  [EndpointEventType.PrivateAccessTunnelUp]: "Private Access Tunnel Up",
  [EndpointEventType.PrivateAccessTunnelDown]: "Private Access Tunnel Down",
  [EndpointEventType.ScanStarted]: "Scan Started",
  [EndpointEventType.ScanCompleted]: "Scan Completed"
};

const EVENT_BADGE_VARIANT: Record<
  EndpointEventType,
  "danger" | "warning" | "success" | "info" | "neutral"
> = {
  [EndpointEventType.AgentStarted]: "success",
  [EndpointEventType.AgentStopped]: "neutral",
  [EndpointEventType.NetworkPolicyApplied]: "info",
  [EndpointEventType.NetworkDestinationBlocked]: "danger",
  [EndpointEventType.NetworkTransferThresholdTripped]: "warning",
  [EndpointEventType.PrivateAccessTunnelUp]: "success",
  [EndpointEventType.PrivateAccessTunnelDown]: "neutral",
  [EndpointEventType.ScanStarted]: "info",
  [EndpointEventType.ScanCompleted]: "success"
};

// The maps above are exhaustive over the enum, so a new event type fails the build until it is
// labelled — but the backend's enum can be ahead of this one, and an unlabelled type used to render
// as an empty badge that looked like a broken checkbox. Showing the raw type is worse-looking and
// far more honest: the row still says what happened.
const describeEvent = (eventType: EndpointEventType) => ({
  label: EVENT_LABEL[eventType] ?? eventType,
  variant: EVENT_BADGE_VARIANT[eventType] ?? ("neutral" as const)
});

const PAGE_SIZE = 25;

const EventDetail = ({ event }: { event: TEndpointEvent }) => {
  const { detail } = event;
  if (!detail) return <span className="text-muted">-</span>;

  const badges: ReactNode[] = [];

  if (Array.isArray(detail.blockedAddresses) && detail.blockedAddresses.length > 0) {
    const addresses = detail.blockedAddresses as string[];
    badges.push(
      <Tooltip key="blockedAddresses">
        <TooltipTrigger asChild>
          <Badge variant="danger" className="cursor-default">
            {addresses.length} blocked
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <ul className="flex flex-col gap-0.5 font-mono">
            {addresses.map((address) => (
              <li key={address}>{address}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (typeof detail.configVersion === "number") {
    badges.push(
      <Badge key="configVersion" variant="neutral">
        Config v{detail.configVersion}
      </Badge>
    );
  }

  if (typeof detail.ruleCount === "number") {
    badges.push(
      <Badge key="ruleCount" variant="neutral">
        {detail.ruleCount} rule{detail.ruleCount === 1 ? "" : "s"}
      </Badge>
    );
  }

  if (typeof detail.filesScanned === "number") {
    badges.push(
      <Badge key="filesScanned" variant="neutral">
        {detail.filesScanned.toLocaleString()} files
      </Badge>
    );
  }

  if (typeof detail.findingCount === "number") {
    badges.push(
      <Badge key="findingCount" variant={detail.findingCount > 0 ? "danger" : "success"}>
        {detail.findingCount} finding{detail.findingCount === 1 ? "" : "s"}
      </Badge>
    );
  }

  // A scan that could not read a folder found nothing there, which is not the same as there being
  // nothing there. Saying so on the row is what keeps the finding count from reading as complete.
  if (Array.isArray(detail.inaccessibleRoots) && detail.inaccessibleRoots.length > 0) {
    const roots = detail.inaccessibleRoots as string[];
    badges.push(
      <Tooltip key="inaccessibleRoots">
        <TooltipTrigger asChild>
          <Badge variant="warning" className="cursor-default">
            {roots.length} folder{roots.length === 1 ? "" : "s"} unreadable
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <ul className="flex flex-col gap-0.5 font-mono">
            {roots.map((root) => (
              <li key={root}>{root}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (badges.length === 0) return <span className="text-muted">-</span>;

  return <div className="flex flex-wrap gap-1.5">{badges}</div>;
};

type Props = {
  // Omit to show the whole fleet's feed; pass a device to scope it to one.
  deviceId?: string;
  title?: string;
  description?: string;
};

export const EventFeedCard = ({ deviceId, title = "Event Feed", description }: Props) => {
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const [events, setEvents] = useState<TEndpointEvent[]>([]);
  const cursor = cursorStack[cursorStack.length - 1];

  const { data, isPending, isFetching } = useListEndpointEvents({
    limit: PAGE_SIZE,
    cursor,
    deviceId
  });

  useEffect(() => {
    if (!data) return;
    setEvents((previous) => (cursor === undefined ? data.events : [...previous, ...data.events]));
    // Only the cursor identifies which page just resolved; re-running on every `data` reference
    // change would double-append when the query object is recreated without new data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, data]);

  const handleLoadMore = () => {
    if (data?.nextCursor) setCursorStack((previous) => [...previous, data.nextCursor as string]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>

      {isPending && (
        <CardContent>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        </CardContent>
      )}

      {!isPending && events.length === 0 && (
        <CardContent>
          <Empty className="border">
            <EmptyMedia variant="icon">
              <ActivityIcon />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No activity yet</EmptyTitle>
              <EmptyDescription>
                {deviceId
                  ? "This device has not reported anything yet. Start the agent on it to see events here."
                  : "Events reported by registered devices will show up here."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      )}

      {!isPending && events.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {!deviceId && <TableHead>Device</TableHead>}
                <TableHead>Event</TableHead>
                <TableHead>Destination</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>Occurred</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => {
                const { label, variant } = describeEvent(event.eventType);

                return (
                  <TableRow key={event.id}>
                    {!deviceId && (
                      <TableCell className="font-medium text-foreground">
                        {event.deviceName}
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge variant={variant}>{label}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted">
                      {event.destination ?? "-"}
                    </TableCell>
                    <TableCell>
                      <EventDetail event={event} />
                    </TableCell>
                    <TableCell className="text-muted">
                      {formatDistanceToNow(new Date(event.occurredAt), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {data?.nextCursor && (
            <CardFooter className="justify-center border-t">
              <Button variant="outline" size="sm" isPending={isFetching} onClick={handleLoadMore}>
                Load More
              </Button>
            </CardFooter>
          )}
        </>
      )}
    </Card>
  );
};
