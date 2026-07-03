import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  FolderIcon,
  KeyIcon,
  LayersIcon,
  Loader2Icon,
  LockIcon
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useEnableSecretBlindIndex } from "@app/hooks/api/projects";
import {
  secretInsightsKeys,
  useGetSecretBlindIndexStatus,
  useGetSecretsDuplication
} from "@app/hooks/api/secretInsights";

const overviewRoute =
  "/organizations/$orgId/projects/secret-management/$projectId/overview" as const;

export const DuplicatedSecretsCard = () => {
  const { projectId } = useProject();
  const { orgId } = useParams({ strict: false });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [migrationTriggered, setMigrationTriggered] = useState(false);

  const enableBlindIndex = useEnableSecretBlindIndex();

  const { data, isPending } = useGetSecretsDuplication({ projectId }, { enabled: !!projectId });

  const groups = data?.groups ?? [];
  const secretBlindIndexEnabled = data?.secretBlindIndexEnabled ?? true;

  const shouldPollStatus = !!projectId && !isPending && !secretBlindIndexEnabled;

  const { data: statusData } = useGetSecretBlindIndexStatus(
    { projectId },
    {
      enabled: shouldPollStatus,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "completed" || status === "failed" || status === "not-found") return false;
        return 2000;
      }
    }
  );

  const migrationStatus = statusData?.status;

  useEffect(() => {
    if (migrationStatus === "pending") {
      setMigrationTriggered(true);
    }
  }, [migrationStatus]);

  useEffect(() => {
    if (statusData?.status === "completed" && migrationTriggered) {
      queryClient.invalidateQueries({
        queryKey: secretInsightsKeys.secretsDuplication({ projectId })
      });
    }
  }, [statusData?.status, migrationTriggered, projectId, queryClient]);

  useEffect(() => {
    if (migrationTriggered && secretBlindIndexEnabled) {
      setMigrationTriggered(false);
    }
  }, [migrationTriggered, secretBlindIndexEnabled]);

  const handleEnableClick = () => {
    setMigrationTriggered(true);
    enableBlindIndex.mutate(
      { projectId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: secretInsightsKeys.blindIndexStatus({ projectId })
          });
        }
      }
    );
  };

  const handleRetryClick = () => {
    setMigrationTriggered(true);
    enableBlindIndex.reset();
    enableBlindIndex.mutate(
      { projectId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: secretInsightsKeys.blindIndexStatus({ projectId })
          });
        }
      }
    );
  };

  const remainingMinutes =
    data?.remainingTtl != null && data.remainingTtl >= 0
      ? Math.max(1, Math.ceil(data.remainingTtl / 60))
      : null;

  const isMigrationRunning = migrationTriggered && migrationStatus !== "failed";
  const isMigrationFailed = migrationStatus === "failed" && !enableBlindIndex.isPending;
  const showEnableButton = !secretBlindIndexEnabled && !isMigrationRunning && !isMigrationFailed;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Duplicated Secrets
          {remainingMinutes != null && (
            <Badge variant="neutral" className="ml-2 font-normal">
              Updates in {remainingMinutes} {remainingMinutes === 1 ? "minute" : "minutes"}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          <span>Detect secrets that share the same value across environments and paths</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending && <Skeleton className="h-[280px] w-full" />}
        {!isPending && showEnableButton && (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>Secret duplication detection is not enabled</EmptyTitle>
              <EmptyDescription>Enable detection to get started.</EmptyDescription>
              <EmptyContent>
                <Button variant="project" size="xs" onClick={handleEnableClick}>
                  Enable Detection
                </Button>
              </EmptyContent>
            </EmptyHeader>
          </Empty>
        )}
        {!isPending && isMigrationRunning && (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3">
            <Loader2Icon className="size-6 animate-spin text-primary" />
            <p className="text-sm text-muted">
              Indexing secrets for duplicate detection. This may take a moment...
            </p>
          </div>
        )}
        {!isPending && isMigrationFailed && (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3">
            <AlertTriangleIcon className="size-6 text-red-500" />
            <p className="text-sm text-red-400">
              Failed to index secrets: {statusData?.message ?? "Unknown error"}
            </p>
            <Button variant="outline" onClick={handleRetryClick}>
              Retry
            </Button>
          </div>
        )}
        {!isPending && secretBlindIndexEnabled && groups.length === 0 && (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No duplicated secrets found</EmptyTitle>
              <EmptyDescription>
                All secrets across environments and paths have unique values.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {!isPending && secretBlindIndexEnabled && groups.length > 0 && (
          <Accordion type="multiple">
            {groups.map((group, groupIdx) => {
              const locationCount = new Set(
                group.secrets.map((s) => `${s.environment.slug}:${s.secretPath}`)
              ).size;

              return (
                <AccordionItem
                  key={`group-${String(groupIdx)}`}
                  value={`group-${String(groupIdx)}`}
                >
                  <AccordionTrigger>
                    <div className="flex flex-1 items-center justify-between">
                      <div className="flex items-center gap-2">
                        <LockIcon className="size-3.5 text-muted" />
                        <span className="text-sm text-foreground">
                          <span className="font-medium">{group.secrets.length} secrets</span> share
                          an identical value
                        </span>
                      </div>
                      <Badge variant="neutral" className="flex items-center gap-1.5 font-normal">
                        <LayersIcon className="size-3" />
                        {locationCount} {locationCount === 1 ? "location" : "locations"}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="group-data-[variant=default]/accordion:p-0">
                    {group.secrets.length > 0 && (
                      <Table
                        containerClassName="rounded-t-none overflow-x-hidden"
                        className="table-fixed"
                      >
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[35%]">Secret Key</TableHead>
                            <TableHead className="w-[25%]">Environment</TableHead>
                            <TableHead>Path</TableHead>
                            <TableHead className="w-12" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.secrets.map((entry, idx) => (
                            <TableRow
                              key={`${entry.key}-${entry.environment.slug}-${entry.secretPath}-${String(idx)}`}
                              className="group/row"
                            >
                              <TableCell isTruncatable className="max-w-60">
                                <div className="flex items-center gap-2">
                                  <KeyIcon className="size-4 shrink-0 text-muted" />
                                  <span className="truncate font-mono">{entry.key}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="info" isTruncatable className="max-w-full">
                                  <span>{entry.environment.name}</span>
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <FolderIcon className="size-3.5 shrink-0 text-folder" />
                                  <span className="truncate">{entry.secretPath}</span>
                                </div>
                              </TableCell>
                              <TableCell className="pr-5">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <IconButton
                                        variant="ghost"
                                        size="sm"
                                        aria-label="Go to secret"
                                        className="opacity-0 transition-opacity group-hover/row:opacity-100"
                                        onClick={() =>
                                          navigate({
                                            to: overviewRoute,
                                            params: {
                                              orgId: orgId as string,
                                              projectId
                                            },
                                            search: {
                                              secretPath: entry.secretPath,
                                              environments: [entry.environment.slug]
                                            }
                                          })
                                        }
                                      >
                                        <ArrowRightIcon className="size-3.5" />
                                      </IconButton>
                                    </TooltipTrigger>
                                    <TooltipContent>Go to secret folder</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </CardContent>
    </Card>
  );
};
