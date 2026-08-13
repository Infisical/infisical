import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { HistoryIcon } from "lucide-react";

import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
import { formatBytes, formatTransferWindow } from "@app/helpers/bytes";
import { useListEndpointTransfers } from "@app/hooks/api/endpoint";

const DESTINATION_LIMIT = 50;

const LOOKBACK_OPTIONS = [
  { value: "1", label: "Last hour" },
  { value: "24", label: "Last 24 hours" },
  { value: "168", label: "Last 7 days" },
  { value: "720", label: "Last 30 days" }
];

// Rounded to whole units: this is how long a device spent sending, and a transfer measured a minute
// at a time cannot honestly claim more precision than that.
const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
};

type Props = {
  deviceId: string;
};

export const TransferHistoryCard = ({ deviceId }: Props) => {
  const [lookbackHours, setLookbackHours] = useState("24");

  const { data, isPending } = useListEndpointTransfers({
    deviceId,
    lookbackHours: Number(lookbackHours),
    limit: DESTINATION_LIMIT
  });

  const transfers = data?.transfers ?? [];
  const totalBytesOut = transfers.reduce((sum, transfer) => sum + transfer.totalBytesOut, 0);
  // A full page means the tail was cut off, and a truncated list that does not say so reads as the
  // complete answer to "everywhere this device sent".
  const isTruncated = transfers.length === DESTINATION_LIMIT;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Traffic History</CardTitle>
        <CardDescription>
          Every destination this device has sent data to, kept after the live counter clears. Measured
          on the device itself; its own network and Infisical&apos;s API are not counted.
        </CardDescription>
        <CardAction>
          <Select value={lookbackHours} onValueChange={setLookbackHours}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" sideOffset={4}>
              {LOOKBACK_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>

      {isPending && (
        <CardContent>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        </CardContent>
      )}

      {!isPending && transfers.length === 0 && (
        <CardContent>
          <Empty className="border">
            <EmptyMedia variant="icon">
              <HistoryIcon />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Nothing sent in this period</EmptyTitle>
              <EmptyDescription>
                Run the agent on this device and every destination it sends to is recorded here. No
                rule is needed: this is a record of where the traffic went, not a policy.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      )}

      {!isPending && transfers.length > 0 && (
        <>
          <CardContent className="py-0">
            <p className="text-xs text-muted">
              {transfers.length} {transfers.length === 1 ? "destination" : "destinations"},{" "}
              {formatBytes(totalBytesOut)} sent
              {isTruncated && ` — the ${DESTINATION_LIMIT} most recently active are shown`}
            </p>
          </CardContent>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Destination</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Peak</TableHead>
                <TableHead>Sending for</TableHead>
                <TableHead>Last sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((transfer) => (
                <TableRow key={transfer.destination}>
                  <TableCell className="font-mono text-xs text-foreground">
                    <span className="flex items-center gap-2">
                      {transfer.destination}
                      {transfer.blocked && <Badge variant="danger">Blocked</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="text-foreground">
                    {formatBytes(transfer.totalBytesOut)}
                  </TableCell>
                  <TableCell className="text-muted">
                    {formatBytes(transfer.peakBytesOut)}
                    <span className="ml-1 text-[10px] text-muted/70">
                      /{formatTransferWindow(transfer.bucketSeconds)}
                    </span>
                  </TableCell>
                  {/* Time spent sending rather than the span between first and last, which would read
                      as six hours for a device that sent twice for a minute. */}
                  <TableCell className="text-muted">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-default">
                          {formatDuration(transfer.activeSeconds)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        First sent {format(new Date(transfer.firstSeenAt), "MMM d, HH:mm")}, last sent{" "}
                        {format(new Date(transfer.lastSeenAt), "MMM d, HH:mm")}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-muted">
                    {formatDistanceToNow(new Date(transfer.lastSeenAt), { addSuffix: true })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </Card>
  );
};
