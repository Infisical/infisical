import { useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Card } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Progress } from "@infisical/cipher/ui/progress";
import { StatusText } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { format } from "date-fns";

import type { TUnusedAccessActor } from "@app/hooks/api/secretInsights/types";
import { useDebounce } from "@app/hooks/useDebounce";

import { errorMessage } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { UnusedAccessSheet } from "./unused-access-sheet";
import {
  ACTOR_TYPE,
  accessPathLabels,
  formatRemainingTtl,
  unusedSharePercent,
  unusedShareTone
} from "./unused-access.utils";

const PAGE_SIZES = [10, 20, 50];
const VISIBLE_PATHS = 2;

export const UnusedAccessCard = ({
  orgId,
  projectId,
  environmentName
}: {
  orgId: string;
  projectId: string;
  environmentName: (slug: string) => string;
}) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 500);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [selected, setSelected] = useState<TUnusedAccessActor | null>(null);
  const { data, isPending, error } = useV4Adapter("secretInsights").useUnusedAccess({
    projectId,
    offset: (page - 1) * perPage,
    limit: perPage,
    search: debouncedSearch || undefined
  });
  const totalCount = data?.totalCount ?? 0;

  const updatesIn =
    data?.remainingTtl != null && data.remainingTtl >= 0
      ? formatRemainingTtl(data.remainingTtl)
      : null;
  const isJudging = !data || new Date(data.unusedAccessFrom) <= new Date();

  const columns: DataTableColumn<TUnusedAccessActor>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      minWidth: 180,
      text: (row) => row.name,
      render: (row) => row.name
    },
    {
      id: "type",
      header: "Type",
      width: 168,
      text: (row) => ACTOR_TYPE[row.actorType].label,
      render: (row) => (
        <Inline gap={8} align="center" wrap={false}>
          <Icon name={ACTOR_TYPE[row.actorType].icon} />
          <span>{ACTOR_TYPE[row.actorType].label}</span>
        </Inline>
      )
    },
    {
      id: "unread",
      header: "Secrets Not Read",
      width: 240,
      text: (row) => `${row.unusedSecretCount} of ${row.accessibleSecretCount}`,
      render: (row) => {
        const percent = unusedSharePercent(row.unusedSecretCount, row.accessibleSecretCount);
        const tone = unusedShareTone(percent);
        return (
          <Stack gap={4}>
            <Inline gap={12} justify="between" wrap={false}>
              <span>
                {row.unusedSecretCount} of {row.accessibleSecretCount}{" "}
                {row.accessibleSecretCount === 1 ? "secret unread" : "secrets unread"}
              </span>
              <StatusText tone={tone} size="sm">
                {percent}%
              </StatusText>
            </Inline>
            <Progress
              value={percent}
              tone={tone === "ok" ? "ink" : tone}
              aria-label={`${row.name} secrets not read`}
            />
          </Stack>
        );
      }
    },
    {
      id: "environments",
      header: "Environments",
      width: 220,
      wrap: true,
      text: (row) => row.environments.map(environmentName).join(", "),
      render: (row) => (
        <Inline gap={4}>
          {row.environments.map((environment) => (
            <Badge key={environment} tone="soft">
              {environmentName(environment)}
            </Badge>
          ))}
        </Inline>
      )
    },
    {
      id: "paths",
      header: "Access Paths",
      width: 280,
      wrap: true,
      text: (row) =>
        accessPathLabels(row.accessPaths, environmentName)
          .map(({ label }) => label)
          .join(", "),
      render: (row) => {
        const paths = accessPathLabels(row.accessPaths, environmentName);
        const hidden = paths.slice(VISIBLE_PATHS);
        return (
          <Inline gap={4}>
            {paths.slice(0, VISIBLE_PATHS).map((path) => (
              <Badge key={path.key} tone="soft">
                {path.label}
              </Badge>
            ))}
            {hidden.length > 0 && (
              <Tooltip content={hidden.map(({ label }) => label).join(", ")}>
                <Badge tone="soft">+{hidden.length}</Badge>
              </Tooltip>
            )}
          </Inline>
        );
      }
    }
  ];

  let empty;
  if (error)
    empty = (
      <EmptyState
        size="sm"
        icon="alert-c"
        title="Couldn't load overprivileged access"
        description={errorMessage(error) ?? "Try again in a moment."}
      />
    );
  else if (debouncedSearch)
    empty = (
      <EmptyState
        size="sm"
        icon="search"
        title="No matching identity"
        description="No overprivileged user or machine identity matches your search."
      />
    );
  else if (!isJudging && data)
    empty = (
      <EmptyState
        size="sm"
        icon="hourglass"
        title="Not enough read history yet"
        description={`Results show on ${format(new Date(data.unusedAccessFrom), "PP")}, once secret reads have been tracked for 30 days.`}
      />
    );
  else
    empty = (
      <EmptyState
        size="sm"
        icon="check-c"
        title="No overprivileged access found"
        description="No identity has left a secret it can access unread in the last 30 days."
      />
    );

  return (
    <Card
      variant="framed"
      title="Overprivileged Access"
      hint="Users and machine identities with access to secrets they haven't read in the last 30 days."
      badges={updatesIn ? <Badge tone="soft">Updates in {updatesIn}</Badge> : undefined}
      flush
      action={
        <Input
          icon="search"
          aria-label="Search overprivileged identities"
          placeholder="Search by name..."
          width="md"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      }
    >
      <DataTable
        label="Overprivileged access"
        rows={data?.actors ?? []}
        columns={columns}
        loading={isPending}
        loadingRows={5}
        getRowId={(row) => `${row.actorType}-${row.actorId}`}
        rowLabel={(row) => row.name}
        onRowActivate={setSelected}
        empty={empty}
        pagination={
          totalCount > PAGE_SIZES[0] ? (
            <Pagination
              label="Overprivileged access pages"
              variant="compact"
              page={page}
              onPageChange={setPage}
              total={totalCount}
              pageSize={perPage}
              pageSizeOptions={PAGE_SIZES}
              onPageSizeChange={(next) => {
                setPerPage(next);
                setPage(1);
              }}
            />
          ) : undefined
        }
      />
      <UnusedAccessSheet
        orgId={orgId}
        projectId={projectId}
        actor={selected}
        environmentName={environmentName}
        onClose={() => setSelected(null)}
      />
    </Card>
  );
};
