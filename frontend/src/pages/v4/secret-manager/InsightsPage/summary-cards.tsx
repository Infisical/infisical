import { useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { Grid, Inline } from "@infisical/cipher/ui/layout";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@infisical/cipher/ui/popover";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { StatCard } from "@infisical/cipher/ui/stat-card";

import { useV4Adapter } from "../../data/adapters";
import { fromNow, overviewLink } from "./insights.utils";

const STALE_PAGE_SIZE = 10;

type Row = {
  id: string;
  name: string;
  environment: string;
  secretPath: string;
  status: { tone: "bad" | "warn" | "info"; label: string } | { tone: "muted"; label: string };
  filterBy: "rotation" | "secret";
};

const ViewTable = ({
  label,
  rows,
  orgId,
  projectId,
  statusHeader,
  pagination
}: {
  label: string;
  rows: Row[];
  orgId: string;
  projectId: string;
  statusHeader: string;
  pagination?: React.ReactNode;
}) => {
  const columns: DataTableColumn<Row>[] = [
    {
      id: "name",
      header: "Name",
      grow: true,
      mono: true,
      text: (row) => row.name,
      render: (row) => (
        <RowLink
          title={row.name}
          link={overviewLink(orgId, projectId, {
            search: row.name,
            environments: [row.environment],
            filterBy: row.filterBy
          })}
        >
          {row.name}
        </RowLink>
      )
    },
    {
      id: "environment",
      header: "Env",
      width: 96,
      text: (row) => row.environment,
      render: (row) => row.environment
    },
    {
      id: "path",
      header: "Path",
      width: 128,
      mono: true,
      text: (row) => row.secretPath,
      render: (row) => row.secretPath
    },
    {
      id: "status",
      header: statusHeader,
      width: 168,
      text: (row) => row.status.label,
      render: (row) =>
        row.status.tone === "muted" ? (
          <span>{row.status.label}</span>
        ) : (
          <Badge tone={row.status.tone}>{row.status.label}</Badge>
        )
    }
  ];
  return (
    <DataTable
      label={label}
      rows={rows}
      columns={columns}
      height={320}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.name}
      pagination={pagination}
    />
  );
};

const SummaryCard = ({
  label,
  value,
  icon,
  tone,
  note,
  footnote,
  viewLabel,
  isEmpty,
  emptyReason,
  children
}: {
  label: string;
  value: number;
  icon: "sync" | "bell" | "clock";
  tone: "info" | "warn" | "bad";
  note: string;
  footnote: { tone: "ok" | "bad" | "warn"; label: string };
  viewLabel: string;
  isEmpty: boolean;
  emptyReason: string;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <StatCard
      label={label}
      value={value.toLocaleString()}
      icon={icon}
      tone={tone}
      note={
        <Inline gap={8} justify="between" align="center">
          <Inline gap={8} align="center">
            <span>{note}</span>
            <Badge tone={footnote.tone} icon={footnote.tone === "ok" ? "check" : "alert"}>
              {footnote.label}
            </Badge>
          </Inline>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabledReason={isEmpty ? emptyReason : undefined}
              >
                {viewLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" style={{ width: 720 }}>
              {children}
            </PopoverContent>
          </Popover>
        </Inline>
      }
    />
  );
};

export const InsightsSummaryCards = ({
  orgId,
  projectId
}: {
  orgId: string;
  projectId: string;
}) => {
  const [stalePage, setStalePage] = useState(1);
  const { data, isPending } = useV4Adapter("secretInsights").useSummary({
    projectId,
    staleSecretsOffset: (stalePage - 1) * STALE_PAGE_SIZE,
    staleSecretsLimit: STALE_PAGE_SIZE
  });

  if (isPending || !data)
    return (
      <Grid gap={16} columns={3}>
        <StatCard label="Upcoming Rotations" value="" loading />
        <StatCard label="Upcoming Reminders" value="" loading />
        <StatCard label="Stale Secrets" value="" loading />
      </Grid>
    );

  const { upcomingRotations, failedRotations, upcomingReminders, overdueReminders, staleSecrets } =
    data;
  const totalStale = data.totalStaleCount ?? staleSecrets.length;

  const rotationRows: Row[] = [
    ...failedRotations.map((item, index) => ({
      id: `failed-${index}`,
      name: item.name,
      environment: item.environment,
      secretPath: item.secretPath,
      status: {
        tone: "bad" as const,
        label: item.nextRotationAt ? `Retries ${fromNow(item.nextRotationAt)}` : "Failed"
      },
      filterBy: "rotation" as const
    })),
    ...upcomingRotations.map((item, index) => ({
      id: `upcoming-${index}`,
      name: item.name,
      environment: item.environment,
      secretPath: item.secretPath,
      status: {
        tone: "info" as const,
        label: item.nextRotationAt ? fromNow(item.nextRotationAt) : "Scheduled"
      },
      filterBy: "rotation" as const
    }))
  ];

  const reminderRows: Row[] = [
    ...overdueReminders.map((item, index) => ({
      item,
      id: `overdue-${index}`,
      tone: "bad" as const
    })),
    ...upcomingReminders.map((item, index) => ({
      item,
      id: `upcoming-${index}`,
      tone: "warn" as const
    }))
  ].map(({ item, id, tone }) => ({
    id,
    name: item.secretKey,
    environment: item.environment,
    secretPath: item.secretPath,
    status: { tone, label: fromNow(item.nextReminderDate) },
    filterBy: "secret"
  }));

  const staleRows: Row[] = staleSecrets.map((item) => ({
    id: `${item.key}-${item.environment}-${item.secretPath}`,
    name: item.key,
    environment: item.environment,
    secretPath: item.secretPath,
    status: { tone: "muted", label: fromNow(item.updatedAt) },
    filterBy: "secret"
  }));

  return (
    <Grid gap={16} columns={3}>
      <SummaryCard
        label="Upcoming Rotations"
        value={upcomingRotations.length}
        icon="sync"
        tone="info"
        note="In the next 7 days"
        footnote={
          failedRotations.length
            ? { tone: "bad", label: `${failedRotations.length} failed` }
            : { tone: "ok", label: "No failed rotations" }
        }
        viewLabel={failedRotations.length ? "View Failed Rotations" : "View Rotations"}
        isEmpty={rotationRows.length === 0}
        emptyReason="No rotations in the next 7 days"
      >
        <ViewTable
          label="Rotations"
          rows={rotationRows}
          orgId={orgId}
          projectId={projectId}
          statusHeader="Status"
        />
      </SummaryCard>
      <SummaryCard
        label="Upcoming Reminders"
        value={upcomingReminders.length}
        icon="bell"
        tone="warn"
        note="In the next 7 days"
        footnote={
          overdueReminders.length
            ? { tone: "bad", label: `${overdueReminders.length} overdue` }
            : { tone: "ok", label: "No overdue reminders" }
        }
        viewLabel={overdueReminders.length ? "View Overdue Reminders" : "View Upcoming Reminders"}
        isEmpty={reminderRows.length === 0}
        emptyReason="No reminders in the next 7 days"
      >
        <ViewTable
          label="Reminders"
          rows={reminderRows}
          orgId={orgId}
          projectId={projectId}
          statusHeader="Due"
        />
      </SummaryCard>
      <SummaryCard
        label="Stale Secrets"
        value={totalStale}
        icon="clock"
        tone="bad"
        note="Unmodified over 90 days"
        footnote={
          totalStale
            ? {
                tone: "warn",
                label: `${totalStale.toLocaleString()} need${totalStale === 1 ? "s" : ""} review`
              }
            : { tone: "ok", label: "All secrets up to date" }
        }
        viewLabel="View Stale Secrets"
        isEmpty={totalStale === 0}
        emptyReason="No stale secrets"
      >
        <ViewTable
          label="Stale secrets"
          rows={staleRows}
          orgId={orgId}
          projectId={projectId}
          statusHeader="Last Modified"
          pagination={
            totalStale > STALE_PAGE_SIZE ? (
              <Pagination
                label="Stale secret pages"
                variant="compact"
                page={stalePage}
                onPageChange={setStalePage}
                total={totalStale}
                pageSize={STALE_PAGE_SIZE}
              />
            ) : undefined
          }
        />
      </SummaryCard>
    </Grid>
  );
};
