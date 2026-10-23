import { useState } from "react";
import axios from "axios";
import { ChevronRightIcon, InfoIcon, SearchIcon } from "lucide-react";

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
  OverflowBadgeList,
  Pagination,
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
import { cn } from "@app/components/v3/utils";
import { useProject, useSubscription } from "@app/context";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { TUnusedAccessActor, useGetUnusedAccess } from "@app/hooks/api/secretInsights";

import { UnusedAccessActorSheet } from "./UnusedAccessActorSheet";
import {
  accessPathBadges,
  ACTOR_TYPE_CONFIG,
  describeReadPeriod,
  formatRemainingTtl,
  unusedSharePercent,
  unusedShareTone
} from "./unusedAccessHelpers";

export const UnusedAccessCard = () => {
  const { currentProject, projectId } = useProject();
  const { subscription } = useSubscription();
  const { page, setPage, perPage, setPerPage, offset, limit, search, setSearch, debouncedSearch } =
    usePagination("", { initPerPage: 10 });
  const [selected, setSelected] = useState<TUnusedAccessActor | null>(null);

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
  const readPeriod = data ? describeReadPeriod(data.periodStart) : "in the last 30 days";

  const renderBody = () => {
    if (isPending) return <Skeleton className="h-[200px] w-full" />;

    if (!data) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Could not load overprivileged access</EmptyTitle>
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
      const description = debouncedSearch
        ? "No overprivileged user or machine identity matches your search."
        : `No identity has left a secret it can access unread ${readPeriod}.`;
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {debouncedSearch ? "No matching identity" : "No overprivileged access found"}
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
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="whitespace-nowrap">
                <span className="inline-flex items-center gap-1">
                  Secrets Not Read
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="size-3.5 text-muted" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-64">
                      Of the secrets each identity can read, how many it has not read {readPeriod}.
                    </TooltipContent>
                  </Tooltip>
                </span>
              </TableHead>
              <TableHead>Environments</TableHead>
              <TableHead className="whitespace-nowrap">Access Paths</TableHead>
              <TableHead variant="action" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.actors.map((row) => {
              const { icon: TypeIcon, label } = ACTOR_TYPE_CONFIG[row.actorType];
              const percent = unusedSharePercent(row.unusedSecretCount, row.accessibleSecretCount);
              const tone = unusedShareTone(percent);
              return (
                <TableRow
                  key={`${row.actorType}-${row.actorId}`}
                  className="group/row cursor-pointer"
                  onClick={() => setSelected(row)}
                >
                  <TableCell isTruncatable className="max-w-56 font-medium">
                    <span className="truncate">{row.name}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="flex items-center gap-2">
                      <TypeIcon className="size-4 shrink-0 text-accent" />
                      {label}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-44 flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-3 whitespace-nowrap">
                        <span>
                          {row.unusedSecretCount}{" "}
                          <span className="text-muted">
                            of {row.accessibleSecretCount}{" "}
                            {row.accessibleSecretCount === 1 ? "secret unread" : "secrets unread"}
                          </span>
                        </span>
                        <span className={cn("tabular-nums", tone.text)}>{percent}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                        <div
                          className={cn("h-full rounded-full", tone.bar)}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
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
                  <TableCell className="max-w-64">
                    <OverflowBadgeList
                      items={accessPathBadges(
                        row.accessPaths,
                        (slug) => environmentNames.get(slug) ?? slug
                      )}
                      getKey={(item) => item.key}
                      getLabel={(item) => item.label}
                      getVariant={() => "neutral"}
                    />
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
            Overprivileged Access
            {updatesIn && (
              <Badge variant="neutral" className="ml-2">
                Updates in {updatesIn}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Users and machine identities with access to secrets they have not read {readPeriod}.
            Select one to see those secrets.
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
      <UnusedAccessActorSheet actor={selected} onClose={() => setSelected(null)} />
    </>
  );
};
