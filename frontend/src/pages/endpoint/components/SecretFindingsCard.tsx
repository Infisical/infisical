import { Link, useParams } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, KeyRound, RefreshCw } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
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
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import {
  EndpointSecretFindingStatus,
  useEndpointScanPolicy,
  useListEndpointDeviceScans,
  useListEndpointSecretFindings,
  useRequestEndpointScan
} from "@app/hooks/api/endpoint";

// Everything here is scoped to one device, because a credential on disk is a fact about a machine.
export const SecretFindingsCard = ({ deviceId }: { deviceId: string }) => {
  const { orgId } = useParams({ strict: false }) as { orgId: string };

  const { data: policy } = useEndpointScanPolicy();
  const { data: deviceScans } = useListEndpointDeviceScans();
  const { data: findings, isPending } = useListEndpointSecretFindings({ deviceId });
  const requestScan = useRequestEndpointScan();

  const scan = deviceScans?.find((candidate) => candidate.deviceId === deviceId);
  const blockedRoots = scan?.inaccessibleRoots ?? [];
  const openFindings = (findings ?? []).filter(
    (finding) => finding.status === EndpointSecretFindingStatus.Open
  );

  // A requested scan that has not reported back yet. Without this the button looks like it did nothing
  // for the few seconds the device takes to poll, scan and report.
  const isScanning =
    Boolean(scan?.requestedAt) &&
    (!scan?.lastScanFinishedAt ||
      new Date(scan.lastScanFinishedAt) < new Date(scan.requestedAt as string));

  const onRequestScan = () => {
    requestScan.mutate(
      { deviceId },
      {
        onSuccess: () =>
          createNotification({ type: "success", text: "This device will scan within a few seconds" }),
        onError: (error) =>
          createNotification({
            type: "error",
            text: error instanceof Error ? error.message : "Could not request a scan"
          })
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Secret Findings
          {openFindings.length > 0 && (
            <Badge variant="danger" className="ml-2">
              {openFindings.length} open
            </Badge>
          )}
        </CardTitle>
        <CardAction>
          <ProjectPermissionCan I={ProjectPermissionActions.Edit} a={ProjectPermissionSub.Endpoint}>
            {(isAllowed) =>
              policy?.isEnabled ? (
                <Button
                  variant="outline"
                  size="xs"
                  isDisabled={!isAllowed || requestScan.isPending || isScanning}
                  onClick={onRequestScan}
                >
                  <RefreshCw />
                  {isScanning ? "Scanning…" : "Scan now"}
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button variant="outline" size="xs" isDisabled>
                        <RefreshCw />
                        Scan now
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Secret scanning is turned off for this organization.
                  </TooltipContent>
                </Tooltip>
              )
            }
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {!policy?.isEnabled && (
          <p className="text-sm text-muted">
            Secret scanning is off.{" "}
            <Link
              to="/organizations/$orgId/endpoint/settings"
              params={{ orgId }}
              className="text-primary hover:underline"
            >
              Turn it on in Settings
            </Link>{" "}
            to have this device check its files for credentials.
          </p>
        )}

        {policy?.isEnabled && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted">
            <span>
              Last scan:{" "}
              {scan?.lastScanFinishedAt
                ? formatDistanceToNow(new Date(scan.lastScanFinishedAt), { addSuffix: true })
                : "never"}
            </span>
            {typeof scan?.filesScanned === "number" && (
              <span>{scan.filesScanned.toLocaleString()} files examined</span>
            )}
            {scan?.truncated && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="warning" className="cursor-default">
                    Results capped
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  This device hit the per-scan finding limit, so the list below is partial. Narrow the
                  folders being scanned.
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {/* A scan that could not read its folders looks exactly like a clean device, so it is called
            out rather than left to be inferred from an empty table. */}
        {blockedRoots.length > 0 && (
          <div className="flex items-start gap-2 rounded-md border border-yellow/30 bg-yellow/5 p-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow" />
            <div className="flex flex-col gap-1 text-xs">
              <span className="text-foreground">
                This device could not read {blockedRoots.length} of its folders
              </span>
              <span className="text-muted">
                macOS blocked {blockedRoots.join(", ")}. Findings from those folders are missing, not
                absent. Grant the agent Full Disk Access in System Settings under Privacy &amp;
                Security.
              </span>
            </div>
          </div>
        )}

        {isPending && <Skeleton className="h-10 w-full rounded-md" />}

        {!isPending && !findings?.length && (
          <Empty className="border">
            <EmptyMedia variant="icon">
              <KeyRound />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No credentials found</EmptyTitle>
              <EmptyDescription>
                {policy?.isEnabled
                  ? "Nothing turned up in the folders this device scanned."
                  : "This device has not scanned its files yet."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>

      {!isPending && Boolean(findings?.length) && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Match</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>First seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {findings?.map((finding) => (
              <TableRow key={finding.id}>
                <TableCell className="font-medium text-foreground">
                  {finding.description ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-default">{finding.ruleId}</span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">{finding.description}</TooltipContent>
                    </Tooltip>
                  ) : (
                    finding.ruleId
                  )}
                </TableCell>
                <TableCell className="max-w-md truncate font-mono text-xs text-muted">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-default">
                        {finding.file}:{finding.startLine}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-lg break-all">
                      {finding.file}:{finding.startLine}
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="max-w-xs truncate font-mono text-xs text-muted">
                  {finding.redactedMatch}
                </TableCell>
                <TableCell>
                  {finding.status === EndpointSecretFindingStatus.Open ? (
                    <Badge variant="danger">Open</Badge>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="success" className="cursor-default">
                          Resolved
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        The most recent scan of this folder no longer finds it, so the file was
                        changed or removed.
                      </TooltipContent>
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell className="text-muted">
                  {formatDistanceToNow(new Date(finding.firstSeenAt), { addSuffix: true })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
};
