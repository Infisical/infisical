import axios from "axios";
import { format } from "date-fns";
import { ChevronDownIcon, FolderIcon, HardDriveIcon, KeyIcon, UserIcon } from "lucide-react";

import { SecretReadStatusBadge } from "@app/components/secrets/SecretReadStatusBadge";
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

export const UnusedSecretAccessCard = () => {
  const { currentProject, projectId } = useProject();
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

  const { data, isLoading, error } = useGetUnusedSecretAccess(
    { projectId, offset, limit, orderBy: orderBy || undefined, orderDirection },
    { enabled: Boolean(subscription?.secretAccessInsights) }
  );
  const totalCount = data?.totalCount ?? 0;
  useResetPageHelper({ totalCount, offset, setPage });

  const remainingMinutes =
    data?.remainingTtl != null && data.remainingTtl >= 0
      ? Math.max(1, Math.ceil(data.remainingTtl / 60))
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
    { column: UnusedSecretAccessOrderBy.Principal, label: "Principal" },
    { column: UnusedSecretAccessOrderBy.Status, label: "Status" },
    { column: UnusedSecretAccessOrderBy.TrackedSince, label: "Tracked Since" }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Unused Secret Access
          {remainingMinutes != null && (
            <Badge variant="neutral" className="ml-2 font-normal">
              Updates in {remainingMinutes} {remainingMinutes === 1 ? "minute" : "minutes"}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Users and machine identities that can read a secret&apos;s value but have not read it, or
          an import or reference of it, in the last 30 days
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-[200px] w-full" />}
        {Boolean(error) && (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>Unused access could not be loaded</EmptyTitle>
              <EmptyDescription>
                {(axios.isAxiosError(error) &&
                  (error.response?.data as { message?: string })?.message) ||
                  "Try again in a moment."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {data && totalCount === 0 && (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No unused access</EmptyTitle>
              <EmptyDescription>
                Everyone who can read this project&apos;s secrets has read them in the last 30 days.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {data && totalCount > 0 && (
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.unusedAccess.map((row) => {
                  const PrincipalIcon = row.principalType === "user" ? UserIcon : HardDriveIcon;
                  return (
                    <TableRow
                      key={`${row.environment}-${row.secretPath}-${row.secretKey}-${row.principalType}-${row.principalId}`}
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
                          <PrincipalIcon className="size-4 shrink-0 text-accent" />
                          <span className="truncate">{row.principalName}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <SecretReadStatusBadge
                          status={row.readStatus}
                          lastReadAt={row.lastReadAt}
                        />
                      </TableCell>
                      <TableCell>{format(new Date(row.trackedSince), "PP")}</TableCell>
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
          </>
        )}
      </CardContent>
    </Card>
  );
};
