import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import axios from "axios";
import { format } from "date-fns";
import { ChevronDownIcon, FolderIcon, InfoIcon, KeyIcon } from "lucide-react";

import { GoToSecretButton } from "@app/components/secrets/GoToSecretButton";
import {
  EXPOSURE_BAND_LABEL,
  EXPOSURE_BAND_TEXT,
  EXPOSURE_BANDS,
  SecretExposureBadge
} from "@app/components/secrets/SecretExposureScore";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Pagination,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type TableSortDirection,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useProject, useSubscription } from "@app/context";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  SecretExposureOrderBy,
  TExposedSecret,
  useGetSecretExposure
} from "@app/hooks/api/secretInsights";
import { SecretAccessInsights } from "@app/pages/secret-manager/OverviewPage/components/SecretTableRow/SecretAccessInsights";

const formatRemainingTtl = (seconds: number) => {
  if (seconds < 60) {
    const remainingSeconds = Math.max(1, seconds);
    return `${remainingSeconds} ${remainingSeconds === 1 ? "second" : "seconds"}`;
  }
  if (seconds < 60 * 60) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }
  const hours = Math.ceil(seconds / (60 * 60));
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
};

// The period the counts are judged on: the full window once tracking is that old, else since it began.
const describeReadPeriod = (trackingStartedAt: string, isPreliminary: boolean) =>
  isPreliminary ? `since ${format(new Date(trackingStartedAt), "PP")}` : "in the last 30 days";

export const SecretExposureCard = () => {
  const { currentProject, projectId } = useProject();
  const { orgId } = useParams({ strict: false });
  const { subscription } = useSubscription();
  // An empty orderBy keeps the default ranking: the most exposed secrets first.
  const {
    page,
    setPage,
    perPage,
    setPerPage,
    offset,
    limit,
    orderBy,
    setOrderBy,
    orderDirection,
    setOrderDirection
  } = usePagination<SecretExposureOrderBy | "">("", { initPerPage: 10 });
  const [selectedSecret, setSelectedSecret] = useState<TExposedSecret | null>(null);

  const { data, isPending, error } = useGetSecretExposure(
    { projectId, offset, limit, orderBy: orderBy || undefined, orderDirection },
    { enabled: Boolean(subscription?.secretAccessInsights) }
  );
  const totalCount = data?.totalCount ?? 0;
  useResetPageHelper({ totalCount, offset, setPage });

  const updatesIn =
    data?.remainingTtl != null && data.remainingTtl >= 0
      ? formatRemainingTtl(data.remainingTtl)
      : null;
  const environmentNames = new Map(currentProject.environments.map((env) => [env.slug, env.name]));

  const getSortDirection = (column: SecretExposureOrderBy): TableSortDirection => {
    if (orderBy !== column) return "none";
    return orderDirection === OrderByDirection.DESC ? "descending" : "ascending";
  };

  const handleSort = (column: SecretExposureOrderBy, direction: TableSortDirection) => {
    setPage(1);
    setOrderBy(direction === "none" ? "" : column);
    setOrderDirection(direction === "descending" ? OrderByDirection.DESC : OrderByDirection.ASC);
  };

  const sortableColumns = [
    { column: SecretExposureOrderBy.SecretKey, label: "Secret Key" },
    { column: SecretExposureOrderBy.Environment, label: "Environment" },
    { column: SecretExposureOrderBy.SecretPath, label: "Path" }
  ];

  const renderBody = () => {
    if (isPending) return <Skeleton className="h-[200px] w-full" />;

    if (!data) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Could not load secret exposure</EmptyTitle>
            <EmptyDescription>
              {(axios.isAxiosError(error) &&
                (error.response?.data as { message?: string })?.message) ||
                "Try again in a moment."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    const isPreliminary = new Date(data.preliminaryUntil) > new Date();
    const readPeriod = describeReadPeriod(data.trackingStartedAt, isPreliminary);
    // Descending, so the band that needs attention first reads first.
    const bandSummary = [...EXPOSURE_BANDS].reverse();

    return (
      <>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {bandSummary.map(({ band, range }) => (
            <div key={band} className="rounded-md border border-border bg-container px-3 py-2">
              <div className={cn("text-2xl leading-none font-semibold", EXPOSURE_BAND_TEXT[band])}>
                {data.bands[band].toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-muted">
                {EXPOSURE_BAND_LABEL[band]} · {range}
              </div>
            </div>
          ))}
        </div>
        {isPreliminary && (
          <Alert variant="info" className="mb-4">
            <InfoIcon />
            <AlertTitle>Preliminary Results</AlertTitle>
            <AlertDescription>
              Unused access is judged over 30 days of reads. Tracking for this project began on{" "}
              {format(new Date(data.trackingStartedAt), "PP")}, so for now it covers only the reads
              since then and weighs less in the score. Results are complete on{" "}
              {format(new Date(data.preliminaryUntil), "PP")}.
            </AlertDescription>
          </Alert>
        )}
        {totalCount === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No exposed secrets</EmptyTitle>
              <EmptyDescription>A secret scores once someone can read its value.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  {sortableColumns.map(({ column, label }) => (
                    <TableHead
                      key={column}
                      sortDirection={getSortDirection(column)}
                      onSortChange={(direction) => handleSort(column, direction)}
                    >
                      {label}
                      <ChevronDownIcon
                        className={cn(
                          "transition-transform",
                          getSortDirection(column) === "descending" && "rotate-180",
                          getSortDirection(column) === "none" && "opacity-30"
                        )}
                      />
                    </TableHead>
                  ))}
                  <TableHead className="whitespace-nowrap">Exposure</TableHead>
                  <TableHead className="whitespace-nowrap">Readers</TableHead>
                  <TableHead className="whitespace-nowrap">No Reads</TableHead>
                  <TableHead className="whitespace-nowrap">Ghost Readers</TableHead>
                  <TableHead variant="action" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.secrets.map((row) => (
                  <TableRow
                    key={`${row.environment}-${row.secretPath}-${row.secretKey}`}
                    className="group/row cursor-pointer"
                    onClick={() => setSelectedSecret(row)}
                  >
                    <TableCell isTruncatable className="max-w-60">
                      <div className="flex items-center gap-2">
                        <KeyIcon className="size-4 shrink-0 text-muted" />
                        <span className="truncate font-mono">{row.secretKey}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="info" isTruncatable className="max-w-full">
                        <span>{environmentNames.get(row.environment) ?? row.environment}</span>
                      </Badge>
                    </TableCell>
                    <TableCell isTruncatable className="max-w-48">
                      <div className="flex items-center gap-2">
                        <FolderIcon className="size-3.5 shrink-0 text-folder" />
                        <span className="truncate">{row.secretPath}</span>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <SecretExposureBadge exposure={row.exposure} />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-72">
                          <ul className="flex flex-col gap-1">
                            {row.exposure.drivers.map((driver) => (
                              <li key={driver.kind} className="flex gap-2">
                                <span className="w-7 shrink-0 font-mono">+{driver.points}</span>
                                <span>{driver.label}</span>
                              </li>
                            ))}
                          </ul>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>{row.entitledCount}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {row.entitledCount} users and machine identities, admins included, can
                          read this secret&apos;s value
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            {row.unreadCount} of {row.entitledCount}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {row.unreadCount} of the {row.entitledCount} who can read this secret,
                          project admins aside, have not read it {readPeriod}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {row.ghostReaderCount > 0 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="warning">{row.ghostReaderCount}</Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            {row.ghostReaderCount} read this secret {readPeriod} but can no longer
                            access it. They still know the value.
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </TableCell>
                    <TableCell variant="action" onClick={(event) => event.stopPropagation()}>
                      <GoToSecretButton
                        orgId={orgId as string}
                        projectId={projectId}
                        secretKey={row.secretKey}
                        secretPath={row.secretPath}
                        environmentSlug={row.environment}
                        isProjectMember
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Pagination
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={setPerPage}
            />
            {data.unlistedCount > 0 && (
              <p className="mt-2 text-xs text-muted">
                Showing the {totalCount.toLocaleString()} most exposed secrets.{" "}
                {data.unlistedCount.toLocaleString()} more are not listed.
              </p>
            )}
          </>
        )}
      </>
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Secret Exposure
            {updatesIn && (
              <Badge variant="neutral" className="ml-2 font-normal">
                Updates in {updatesIn}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Which secrets are most exposed, from how many can read the value, who can no longer read
            it but still knows it, and who can read it but never does. Select a secret to see why it
            scores what it does and who is behind each count.
          </CardDescription>
        </CardHeader>
        <CardContent>{renderBody()}</CardContent>
      </Card>
      <Sheet
        open={selectedSecret !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSelectedSecret(null);
        }}
      >
        <SheetContent
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="gap-y-0 sm:max-w-6xl"
          side="right"
        >
          <SheetHeader>
            <SheetTitle>Secret Exposure</SheetTitle>
            <SheetDescription>
              Why this secret scores what it does, who can read it, and who still knows its value
            </SheetDescription>
          </SheetHeader>
          {selectedSecret && (
            <>
              <div className="bg-container p-4 text-foreground">
                <p className="truncate font-mono">{selectedSecret.secretKey}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="neutral">
                    {environmentNames.get(selectedSecret.environment) ?? selectedSecret.environment}
                  </Badge>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <FolderIcon className="size-3.5 text-folder" />
                    {selectedSecret.secretPath}
                  </span>
                </div>
              </div>
              <Separator />
              <SecretAccessInsights
                key={`${selectedSecret.environment}-${selectedSecret.secretPath}-${selectedSecret.secretKey}`}
                secretKey={selectedSecret.secretKey}
                environment={selectedSecret.environment}
                secretPath={selectedSecret.secretPath}
                defaultView="graph"
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
};
