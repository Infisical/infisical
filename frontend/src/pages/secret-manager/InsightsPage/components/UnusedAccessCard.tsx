import { useState } from "react";
import axios from "axios";
import { format } from "date-fns";
import { ChevronRightIcon, SearchIcon } from "lucide-react";

import { formatReadDay } from "@app/components/secrets/SecretReadStatusBadge";
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useProject, useSubscription } from "@app/context";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { TUnusedAccessPrincipal, useGetUnusedAccess } from "@app/hooks/api/secretInsights";

import { formatRemainingTtl, PRINCIPAL_TYPE_CONFIG } from "./unusedAccessHelpers";
import { UnusedAccessPrincipalSheet } from "./UnusedAccessPrincipalSheet";

export const UnusedAccessCard = () => {
  const { currentProject, projectId } = useProject();
  const { subscription } = useSubscription();
  const { page, setPage, perPage, setPerPage, offset, limit, search, setSearch, debouncedSearch } =
    usePagination("", { initPerPage: 10 });
  const [selected, setSelected] = useState<TUnusedAccessPrincipal | null>(null);

  const { data, isPending, error } = useGetUnusedAccess(
    { projectId, offset, limit, search: debouncedSearch || undefined },
    { enabled: Boolean(subscription?.secretAccessInsights) }
  );
  const totalCount = data?.totalCount ?? 0;
  useResetPageHelper({ totalCount, offset, setPage });

  const updatesIn =
    data?.remainingTtl != null && data.remainingTtl >= 0
      ? formatRemainingTtl(data.remainingTtl)
      : null;
  const environmentNames = new Map(currentProject.environments.map((env) => [env.slug, env.name]));
  // Nothing is judged until the project has 30 days of reads.
  const isJudging = !data || new Date(data.unusedAccessFrom) <= new Date();

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

    if (totalCount === 0) {
      // Recent access and new secrets are not judged yet, so this cannot claim everything was read.
      let description = "No identity has gone 30 days without reading a secret it can access.";
      if (debouncedSearch) {
        description = "No user, group or machine identity with unused access matches your search.";
      } else if (!isJudging) {
        description = `Unused access is judged on 30 days of reads, from ${format(new Date(data.unusedAccessFrom), "PP")}.`;
      }
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {debouncedSearch ? "No matching identity" : "No unused access found"}
            </EmptyTitle>
            <EmptyDescription>{description}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Identity</TableHead>
              <TableHead className="whitespace-nowrap">Unused</TableHead>
              <TableHead className="whitespace-nowrap">Unused In</TableHead>
              <TableHead className="whitespace-nowrap">Last Read</TableHead>
              <TableHead className="whitespace-nowrap">Access Via</TableHead>
              <TableHead variant="action" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.principals.map((row) => {
              const { icon: TypeIcon, label } = PRINCIPAL_TYPE_CONFIG[row.principalType];
              const typeLine =
                row.memberCount != null
                  ? `${label} · ${row.memberCount} ${row.memberCount === 1 ? "member" : "members"}`
                  : label;
              return (
                <TableRow
                  key={`${row.principalType}-${row.principalId}`}
                  className="group/row cursor-pointer"
                  onClick={() => setSelected(row)}
                >
                  <TableCell isTruncatable className="max-w-64">
                    <div className="flex items-center gap-2">
                      <TypeIcon className="size-4 shrink-0 text-accent" />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{row.name}</div>
                        <div className="truncate text-xs text-muted">{typeLine}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="font-medium">{row.unreadCount}</span>
                    <span className="text-muted">
                      {" "}
                      of {row.entitledCount} {row.entitledCount === 1 ? "secret" : "secrets"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {row.environments.map((environment) => (
                        <Badge key={environment} variant="neutral">
                          {environmentNames.get(environment) ?? environment}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {row.lastReadAt ? (
                      formatReadDay(row.lastReadAt)
                    ) : (
                      <span className="text-muted">None in 30 days</span>
                    )}
                  </TableCell>
                  <TableCell isTruncatable className="max-w-56">
                    <span className="truncate">{row.accessVia.join(" · ")}</span>
                  </TableCell>
                  <TableCell variant="action">
                    <ChevronRightIcon className="size-4 text-muted" />
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
      </>
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Unused Access
            {updatesIn && (
              <Badge variant="neutral" className="ml-2">
                Updates in {updatesIn}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Users, groups, and machine identities that can read secrets they have not read in the
            last 30 days. Select one to see which secrets.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <InputGroup className="max-w-sm">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              id="unused-access-search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search by name..."
            />
          </InputGroup>
          {renderBody()}
        </CardContent>
      </Card>
      <UnusedAccessPrincipalSheet principal={selected} onClose={() => setSelected(null)} />
    </>
  );
};
