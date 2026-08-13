import { useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { AppWindowIcon, SearchIcon } from "lucide-react";

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
  Input,
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
import { EndpointDeviceAppSource, useListEndpointDeviceApps } from "@app/hooks/api/endpoint";

type Props = {
  deviceId: string;
};

export const InstalledAppsCard = ({ deviceId }: Props) => {
  const [search, setSearch] = useState("");

  const { data, isPending } = useListEndpointDeviceApps({ deviceId });

  const apps = useMemo(() => data?.apps ?? [], [data]);

  // Filtered here rather than on the server: the whole inventory arrives in one bounded request, so
  // a round trip per keystroke would buy nothing.
  const visibleApps = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return apps;

    return apps.filter(
      (app) =>
        app.name.toLowerCase().includes(term) || (app.bundleId ?? "").toLowerCase().includes(term)
    );
  }, [apps, search]);

  const runningCount = apps.filter((app) => app.isRunning).length;
  const hasReported = Boolean(data?.reportedAt);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Installed Applications</CardTitle>
        <CardDescription>
          What is installed on this machine, read off the device by the agent.
          {data?.reportedAt &&
            ` Last inventoried ${formatDistanceToNow(new Date(data.reportedAt), {
              addSuffix: true
            })}.`}
        </CardDescription>
        {hasReported && apps.length > 0 && (
          <CardAction>
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search applications"
                className="w-56 pl-8"
              />
            </div>
          </CardAction>
        )}
      </CardHeader>

      {isPending && (
        <CardContent>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        </CardContent>
      )}

      {/* An inventory that has never run and one that found nothing are different facts, and an
          empty table cannot tell them apart. */}
      {!isPending && !hasReported && (
        <CardContent>
          <Empty className="border">
            <EmptyMedia variant="icon">
              <AppWindowIcon />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No inventory yet</EmptyTitle>
              <EmptyDescription>
                The agent takes stock of what is installed shortly after it starts, and every half
                hour after that. Applications are read on macOS today.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      )}

      {!isPending && hasReported && apps.length === 0 && (
        <CardContent>
          <Empty className="border">
            <EmptyMedia variant="icon">
              <AppWindowIcon />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Nothing installed</EmptyTitle>
              <EmptyDescription>
                The agent reported an empty inventory for this device.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      )}

      {!isPending && hasReported && apps.length > 0 && (
        <>
          <CardContent className="py-0">
            <p className="text-xs text-muted">
              {apps.length} {apps.length === 1 ? "application" : "applications"}, {runningCount}{" "}
              running when the inventory was taken
              {search.trim() && ` — ${visibleApps.length} matching`}
            </p>
          </CardContent>

          {visibleApps.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">
                No application matches &ldquo;{search.trim()}&rdquo;.
              </p>
            </CardContent>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Application</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Installed For</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>First Seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleApps.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell className="text-foreground">
                      {/* The install path is what distinguishes two copies of the same app, but it
                          is far too long for a column, so it lives on the name. */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-default">{app.name}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <span className="font-mono text-xs">{app.path}</span>
                        </TooltipContent>
                      </Tooltip>
                      {app.bundleId && (
                        <span className="block font-mono text-[10px] text-muted">
                          {app.bundleId}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted">
                      {app.version ?? "-"}
                    </TableCell>
                    <TableCell>
                      {app.source === EndpointDeviceAppSource.User ? (
                        <Badge variant="warning">This user</Badge>
                      ) : (
                        <Badge variant="neutral">Everyone</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {app.isRunning ? (
                        <Badge variant="success">Running</Badge>
                      ) : (
                        <span className="text-sm text-muted">Idle</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-default">
                            {formatDistanceToNow(new Date(app.firstSeenAt), { addSuffix: true })}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          First inventoried {format(new Date(app.firstSeenAt), "MMM d, HH:mm")}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </Card>
  );
};
