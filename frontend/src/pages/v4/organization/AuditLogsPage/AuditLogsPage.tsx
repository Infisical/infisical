import { useMemo, useState } from "react";
import { type DateRange } from "react-day-picker";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import {
  FilterBar,
  type FilterBarField,
  type FilterBarFilter
} from "@app/components/v4/patterns/filter-bar";
import { Button } from "@app/components/v4/ui/button";
import { Calendar } from "@app/components/v4/ui/calendar";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyState,
  EmptyTitle
} from "@app/components/v4/ui/empty";
import { Json, type JsonValue } from "@app/components/v4/ui/json";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
import { MiddleTruncate } from "@app/components/v4/ui/middle-truncate";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Popover, PopoverContent, PopoverTrigger } from "@app/components/v4/ui/popover";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Tabs } from "@app/components/v4/ui/tabs";
import { Heading, Meta } from "@app/components/v4/ui/text";
import { ToggleGroup, ToggleGroupItem } from "@app/components/v4/ui/toggle-group";
import { eventToNameMap, userAgentTypeToNameMap } from "@app/hooks/api/auditLogs/constants";
import { ActorType, EventType, UserAgentType } from "@app/hooks/api/auditLogs/enums";
import type { Actor, AuditLog, TGetAuditLogsFilter } from "@app/hooks/api/auditLogs/types";

import { useV4Adapter, useV4Mode } from "../../data/adapters";
import { useV4Session } from "../../data/session/contract";

const PAGE_SIZE = 500;
const rowHeight = 48;
const initialFrame = 11 * rowHeight;
const maxFrame = 840;
const hour = 3600 * 1000;
const day = 24 * hour;

const ranges = [
  { value: "1h", label: "1h", ms: hour, title: "last hour" },
  { value: "24h", label: "24h", ms: day, title: "last 24 hours" },
  { value: "7d", label: "7d", ms: 7 * day, title: "last 7 days" },
  { value: "30d", label: "30d", ms: 30 * day, title: "last 30 days" }
] as const;

const tabs = [
  { value: "audit-logs", label: "Audit logs" },
  { value: "streams", label: "External log streams" },
  { value: "settings", label: "Settings" }
];

const actorTypeLabel: Partial<Record<ActorType, string>> = {
  [ActorType.USER]: "User",
  [ActorType.IDENTITY]: "Machine identity",
  [ActorType.SERVICE]: "Service token",
  [ActorType.PLATFORM]: "Platform",
  [ActorType.KMIP_CLIENT]: "KMIP client",
  [ActorType.UNKNOWN_USER]: "Unknown user"
};

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (value: number) => String(value).padStart(2, "0");
const formatTime = (at: string) => {
  const date = new Date(at);
  return `${months[date.getMonth()]} ${date.getDate()}, ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
};
const formatDay = (date: Date) => `${months[date.getMonth()]} ${date.getDate()}`;

const actorName = (actor: Actor) => {
  switch (actor.type) {
    case ActorType.USER:
      return actor.metadata.email;
    case ActorType.IDENTITY:
    case ActorType.SERVICE:
    case ActorType.KMIP_CLIENT:
      return actor.metadata.name;
    default:
      return actorTypeLabel[actor.type] ?? actor.type;
  }
};
const isMachine = (actor: Actor) => actor.type !== ActorType.USER;

const metadataOf = (log: AuditLog) => (log.event.metadata ?? {}) as Record<string, unknown>;
const stringField = (log: AuditLog, keys: string[]) => {
  const metadata = metadataOf(log);
  const found = keys.map((key) => metadata[key]).find((value) => typeof value === "string");
  return typeof found === "string" && found ? found : undefined;
};
const environmentOf = (log: AuditLog) => stringField(log, ["environment"]);
const targetOf = (log: AuditLog) =>
  stringField(log, ["secretKey", "dn", "keyName", "email", "name"]);
const sourceOf = (log: AuditLog) =>
  userAgentTypeToNameMap[log.userAgentType] ?? log.userAgentType ?? "Unknown";

const truncate = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
} as const;

const makeColumns = (onOpen: (log: AuditLog) => void): DataTableColumn<AuditLog>[] => [
  {
    id: "time",
    header: "Time",
    width: 184,
    render: (row) => <Meta>{formatTime(row.createdAt)}</Meta>
  },
  {
    id: "actor",
    header: "Actor",
    width: 264,
    maxWidth: 264,
    text: (row) => actorName(row.actor),
    render: (row) => <MiddleTruncate mono={isMachine(row.actor)} text={actorName(row.actor)} />
  },
  {
    id: "event",
    header: "Event",
    grow: true,
    maxWidth: 380,
    primary: true,
    text: (row) => row.event.type,
    render: (row) => {
      const detail = [row.projectName, environmentOf(row), targetOf(row)]
        .filter(Boolean)
        .join(", ");
      return (
        <Inline
          gap={12}
          align="center"
          wrap={false}
          style={{ minWidth: 0, overflow: "hidden" }}
          title={[row.event.type, detail].filter(Boolean).join(", ")}
        >
          <code style={truncate}>{row.event.type}</code>
          {detail && (
            <Meta
              mono={false}
              style={{ ...truncate, flex: "1 1 0", minWidth: "var(--v4-space-48)" }}
            >
              {detail}
            </Meta>
          )}
        </Inline>
      );
    }
  },
  {
    id: "source",
    header: "Source",
    width: 232,
    render: (row) => (
      <Inline gap={8} align="center" wrap={false}>
        {sourceOf(row)}
        <Meta>{row.ipAddress}</Meta>
      </Inline>
    )
  },
  {
    id: "open",
    header: "Details",
    actions: true,
    hideHeader: true,
    render: (row) => (
      <Button
        variant="ghost"
        size="icon-row"
        icon="chev-right"
        iconOnly
        onClick={() => onOpen(row)}
      >
        {`Open ${row.event.type} by ${actorName(row.actor)}`}
      </Button>
    )
  }
];

const LogDetails = ({ log, onClose }: { log: AuditLog | null; onClose: () => void }) => (
  <Sheet open={Boolean(log)} onOpenChange={(open) => !open && onClose()}>
    <SheetContent size="lg">
      {log && (
        <>
          <SheetHeader>
            <SheetTitle>
              <code>{log.event.type}</code>
            </SheetTitle>
            <SheetDescription>
              {eventToNameMap[log.event.type] ?? log.event.type}, {formatTime(log.createdAt)}
            </SheetDescription>
          </SheetHeader>
          <SheetBody>
            <Stack gap={24}>
              <DataList
                variant="props"
                items={[
                  [
                    "Actor",
                    isMachine(log.actor) ? (
                      <code key="actor">{actorName(log.actor)}</code>
                    ) : (
                      actorName(log.actor)
                    )
                  ],
                  ["Actor type", actorTypeLabel[log.actor.type] ?? log.actor.type],
                  ["Project", log.projectName ?? "Organization"],
                  ["Environment", environmentOf(log) ?? "None"],
                  ["Resource", targetOf(log) ? <code key="target">{targetOf(log)}</code> : "None"],
                  ["Source", sourceOf(log)],
                  ["IP address", <Meta key="ip">{log.ipAddress}</Meta>],
                  ["Event ID", <Meta key="id">{log.id}</Meta>]
                ]}
              />
              <Json
                label="Event metadata"
                value={metadataOf(log) as JsonValue}
                defaultExpandDepth={2}
              />
            </Stack>
          </SheetBody>
        </>
      )}
    </SheetContent>
  </Sheet>
);

const LogsTab = () => {
  const { projects } = useV4Session();
  const org = useV4Adapter("org");
  const [range, setRange] = useState<string>("30d");
  const [custom, setCustom] = useState<DateRange>();
  const [anchor, setAnchor] = useState(() => Date.now());
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [frame, setFrame] = useState(initialFrame);
  const [opened, setOpened] = useState<AuditLog | null>(null);
  const columns = useMemo(() => makeColumns(setOpened), []);
  const preset = ranges.find((item) => item.value === range);
  const active =
    !preset && custom?.from && custom.to
      ? {
          from: custom.from.getTime(),
          to: Math.min(custom.to.getTime() + day, anchor),
          title: `${formatDay(custom.from)} to ${formatDay(custom.to)}`
        }
      : { from: anchor - (preset ?? ranges[3]).ms, to: anchor, title: (preset ?? ranges[3]).title };

  const value = (field: string) => filters.find((filter) => filter.field === field)?.values ?? [];
  const projectId = value("project")[0] ?? null;
  const query: TGetAuditLogsFilter = {
    startDate: new Date(active.from),
    endDate: new Date(active.to),
    limit: PAGE_SIZE,
    eventType: value("event") as EventType[],
    actorType: value("actor-type")[0] as ActorType | undefined,
    userAgentType: value("source")[0] as UserAgentType | undefined,
    environment: value("environment")[0] || undefined,
    projectId: projectId ?? undefined
  };
  const { data, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } = org.useAuditLogs(
    query,
    projectId
  );
  const pages = data?.pages ?? [];
  const rows = pages.flat();
  const canLoadMore = hasNextPage && pages[pages.length - 1]?.length === PAGE_SIZE;
  const filtered = filters.some((filter) => filter.values.length > 0);

  const fields: FilterBarField[] = [
    {
      key: "event",
      label: "Event type",
      type: "multi-select",
      searchable: true,
      options: Object.values(EventType).map((type) => ({
        value: type,
        label: eventToNameMap[type] ?? type
      }))
    },
    {
      key: "actor-type",
      label: "Actor type",
      type: "select",
      options: [ActorType.USER, ActorType.IDENTITY, ActorType.PLATFORM].map((type) => ({
        value: type,
        label: actorTypeLabel[type] ?? type
      }))
    },
    {
      key: "project",
      label: "Project",
      type: "select",
      searchable: true,
      options: projects.map((project) => ({ value: project.id, label: project.name }))
    },
    { key: "environment", label: "Environment", type: "text", placeholder: "Environment slug" },
    {
      key: "source",
      label: "Source",
      type: "select",
      options: Object.values(UserAgentType).map((type) => ({
        value: type,
        label: userAgentTypeToNameMap[type]
      }))
    }
  ];

  const reset = () => {
    setFrame(initialFrame);
    setAnchor(Date.now());
  };

  return (
    <>
      <FilterBar
        label="Audit log filters"
        fields={fields}
        value={filters}
        onChange={(next) => {
          setFilters(next);
          reset();
        }}
        actions={
          <>
            <ToggleGroup
              type="single"
              aria-label="Date range"
              value={range}
              onValueChange={(next) => {
                const item = ranges.find((entry) => entry.value === next);
                if (!item) return;
                setRange(item.value);
                reset();
              }}
            >
              {ranges.map((item) => (
                <ToggleGroupItem key={item.value} value={item.value}>
                  {item.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" icon="calendar">
                  {preset ? "Custom" : active.title}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" aria-label="Custom date range">
                <Calendar
                  aria-label="Custom date range"
                  mode="range"
                  disabled={{ after: new Date() }}
                  selected={custom}
                  onSelect={(next) => {
                    setCustom(next);
                    if (next?.from && next.to) {
                      setRange("custom");
                      reset();
                    }
                  }}
                  footer={
                    custom?.from && custom.to
                      ? `${formatDay(custom.from)} to ${formatDay(custom.to)}`
                      : "Choose a start and end date"
                  }
                />
              </PopoverContent>
            </Popover>
          </>
        }
      />
      <Stack gap={12}>
        <Inline gap={16} align="center" justify="between">
          <Heading level={2} size="subsection">
            Audit log, {active.title}
          </Heading>
          <Meta mono={false}>
            {isPending
              ? "Loading events"
              : `Showing ${rows.length.toLocaleString("en-US")}${canLoadMore ? "+" : ""} events`}
          </Meta>
        </Inline>
        <DataTable<AuditLog>
          key={[active.from, active.to, JSON.stringify(filters)].join()}
          label={`Audit log, ${active.title}`}
          rows={rows}
          columns={columns}
          loading={isPending}
          getRowId={(row) => row.id}
          rowLabel={(row) => `${row.event.type} by ${actorName(row.actor)}`}
          height={frame}
          rowHeight={rowHeight}
          virtual
          loadMore={
            canLoadMore
              ? {
                  label: `Load ${PAGE_SIZE} more`,
                  loading: isFetchingNextPage,
                  onClick: () => {
                    fetchNextPage().then(() =>
                      setFrame((height) => Math.min(maxFrame, height + 6 * rowHeight))
                    );
                  }
                }
              : undefined
          }
          end={isPending ? undefined : "End of logs"}
          empty={
            <EmptyState
              size="sm"
              media="bare"
              icon="history"
              title="No events match these filters"
              description={`Nothing in the ${active.title}. Try a wider date range or clear the filters.`}
              actions={
                filtered ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFilters([]);
                      reset();
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          }
        />
      </Stack>
      <LogDetails log={opened} onClose={() => setOpened(null)} />
    </>
  );
};

export const AuditLogsPage = () => {
  const { selectedTab } = useSearch({ from: "/v4/organizations/$orgId/audit-logs" });
  const { orgId } = useParams({ from: "/v4/organizations/$orgId/audit-logs" });
  const navigate = useNavigate();
  const mode = useV4Mode();
  const { organization } = useV4Session();
  const activeTab = tabs.some((tab) => tab.value === selectedTab) ? selectedTab : "audit-logs";
  return (
    <Stack gap={24}>
      <PageHeader
        title="Audit logs"
        description={`Audit logs for security and compliance teams to monitor information access${organization.isSubOrganization ? " in this sub-organization" : ""}.`}
        tabs={
          <Tabs
            label="Audit log sections"
            value={activeTab}
            onValueChange={(next) =>
              navigate({
                to:
                  mode === "live" && next !== "audit-logs"
                    ? "/organizations/$orgId/audit-logs"
                    : "/v4/organizations/$orgId/audit-logs",
                params: { orgId },
                search: { selectedTab: next }
              })
            }
            tabs={tabs.map((tab) => ({ ...tab, content: null }))}
          />
        }
      />
      {activeTab === "audit-logs" ? (
        <LogsTab />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>This tab isn&apos;t in v4 yet</EmptyTitle>
            <EmptyDescription>
              {tabs.find((tab) => tab.value === activeTab)?.label} hasn&apos;t been ported to the
              new app. The audit log itself has.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </Stack>
  );
};
