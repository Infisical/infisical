import { useParams } from "@tanstack/react-router";
import axios from "axios";
import { format } from "date-fns";
import { ChevronDownIcon, FolderIcon, HardDriveIcon, KeyIcon, UserIcon } from "lucide-react";

import { GoToSecretButton } from "@app/components/secrets/GoToSecretButton";
import {
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
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type TableSortDirection
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { useProject, useSubscription } from "@app/context";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { UnusedSecretAccessOrderBy, useGetUnusedSecretAccess } from "@app/hooks/api/secretInsights";

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

export const UnusedSecretAccessCard = () => {
  const { currentProject, projectId } = useProject();
  const { orgId } = useParams({ strict: false });
  const { subscription } = useSubscription();
  // An empty orderBy keeps the default ranking: the secrets with the most unused access first.
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
  } = usePagination<UnusedSecretAccessOrderBy | "">("", { initPerPage: 20 });

  const { data, isPending, error } = useGetUnusedSecretAccess(
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

  const getSortDirection = (column: UnusedSecretAccessOrderBy): TableSortDirection => {
    if (orderBy !== column) return "none";
    return orderDirection === OrderByDirection.DESC ? "descending" : "ascending";
  };

  const handleSort = (column: UnusedSecretAccessOrderBy, direction: TableSortDirection) => {
    setPage(1);
    setOrderBy(direction === "none" ? "" : column);
    setOrderDirection(direction === "descending" ? OrderByDirection.DESC : OrderByDirection.ASC);
  };

  const sortableColumns = [
    { column: UnusedSecretAccessOrderBy.SecretKey, label: "Secret Key" },
    { column: UnusedSecretAccessOrderBy.Environment, label: "Environment" },
    { column: UnusedSecretAccessOrderBy.SecretPath, label: "Path" },
    { column: UnusedSecretAccessOrderBy.Actor, label: "Name" }
  ];

  const renderBody = () => {
    if (isPending) return <Skeleton className="h-[200px] w-full" />;

    if (!data) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Could not load unused access</EmptyTitle>
            <EmptyDescription>
              {(axios.isAxiosError(error) &&
                (error.response?.data as { message?: string })?.message) ||
                "Try again in a moment."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    if (new Date(data.unusedAccessFrom) > new Date()) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Tracking reads</EmptyTitle>
            <EmptyDescription>
              Reads have been tracked since {format(new Date(data.trackingStartedAt), "PP")}. Access
              that goes unread for 30 days shows here from{" "}
              {format(new Date(data.unusedAccessFrom), "PP")}.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    if (totalCount === 0) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No unused access</EmptyTitle>
            <EmptyDescription>
              Access shows here once someone has been able to read a secret for 30 days without
              reading it.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
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
              <TableHead variant="action" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.unusedAccess.map((row) => {
              const ActorIcon = row.actorType === "user" ? UserIcon : HardDriveIcon;
              return (
                <TableRow
                  key={`${row.environment}-${row.secretPath}-${row.secretKey}-${row.actorType}-${row.actorId}`}
                  className="group/row"
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
                  <TableCell isTruncatable className="max-w-60">
                    <div className="flex items-center gap-2">
                      <ActorIcon className="size-4 shrink-0 text-accent" />
                      <span className="truncate">{row.actorName}</span>
                    </div>
                  </TableCell>
                  <TableCell variant="action">
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
              );
            })}
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
            Showing the {totalCount.toLocaleString()} entries with the most unused access.{" "}
            {data.unlistedCount.toLocaleString()} more are not listed.
          </p>
        )}
      </>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Unused Secret Access
          {updatesIn && (
            <Badge variant="neutral" className="ml-2 font-normal">
              Updates in {updatesIn}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Users and machine identities that can read a secret but have not read it in the last 30
          days
        </CardDescription>
      </CardHeader>
      <CardContent>{renderBody()}</CardContent>
    </Card>
  );
};
