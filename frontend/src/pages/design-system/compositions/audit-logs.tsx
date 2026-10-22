import { useEffect, useMemo, useState } from "react";
import { type DateRange } from "react-day-picker";

import { Identity } from "@app/components/v4/ui/avatar";
import { Button } from "@app/components/v4/ui/button";
import { Calendar } from "@app/components/v4/ui/calendar";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
import { MiddleTruncate } from "@app/components/v4/ui/middle-truncate";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Popover, PopoverContent, PopoverTrigger } from "@app/components/v4/ui/popover";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import { Tabs } from "@app/components/v4/ui/tabs";
import { Heading, Meta } from "@app/components/v4/ui/text";
import { ToggleGroup, ToggleGroupItem } from "@app/components/v4/ui/toggle-group";

import { Shell, useCrumbs } from "./shared";

type Actor = { name: string; machine?: boolean };
type AuditEvent = {
  id: string;
  at: number;
  actor: Actor;
  event: string;
  project?: string;
  environment?: string;
  target?: string;
  source: string;
  ip: string;
};

const total = 12408;
const page = 500;
const rowHeight = 48;
const maxFrame = 840;
const now = Date.UTC(2026, 9, 22, 21, 32, 0);
const window30d = 30 * 24 * 3600 * 1000;
const people: Actor[] = [
  "Sarah Lin",
  "Marcus Webb",
  "Priya Raman",
  "Diego Alvarez",
  "Hana Kim",
  "Tom Becker",
  "Lena Novak"
].map((name) => ({ name }));
const machines: Actor[] = [
  "payments-api-k8s-operator",
  "web-dashboard-github-actions-deploy",
  "platform-core-terraform-runner",
  "billing-worker",
  "internal-pki-cert-issuer"
].map((name) => ({ name, machine: true }));
const secretProjects = ["payments-api", "web-dashboard", "platform-core"];
const environments = ["production", "staging", "development"];
const secretKeys = ["DATABASE_URL", "STRIPE_API_KEY", "REDIS_URL", "JWT_SIGNING_KEY", "LOG_LEVEL"];
const kmsKeys = ["billing-pii", "customer-exports", "backup-signing"];

let state = 20261022;
const random = () => {
  state = (state * 16807) % 2147483647;
  return state / 2147483647;
};
const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
const ipOf = () =>
  `10.${Math.floor(random() * 8)}.${Math.floor(random() * 255)}.${Math.floor(random() * 255)}`;

const cache = new Map<number, AuditEvent>();
const eventAt = (index: number): AuditEvent => {
  const cached = cache.get(index);
  if (cached) return cached;
  const roll = random();
  const at = now - Math.floor((index * window30d) / total) - Math.floor(random() * 120000);
  const base = { id: `evt-${index}`, at, ip: ipOf() };
  const project = pick(secretProjects);
  const environment = pick(environments);
  let entry: AuditEvent;
  if (roll < 0.42) {
    const actor = pick(machines.slice(0, 4));
    entry = {
      ...base,
      actor,
      event: "get-secrets",
      project,
      environment,
      source: actor.name.endsWith("operator") ? "K8s operator" : pick(["CLI", "Node SDK"])
    };
  } else if (roll < 0.58) {
    entry = {
      ...base,
      actor: pick(machines.slice(0, 4)),
      event: "login-identity-universal-auth",
      source: pick(["CLI", "Node SDK", "Python SDK"])
    };
  } else if (roll < 0.7) {
    entry = {
      ...base,
      actor: pick(people),
      event: "get-secret",
      project,
      environment,
      target: pick(secretKeys),
      source: pick(["Web", "CLI"])
    };
  } else if (roll < 0.8) {
    entry = {
      ...base,
      actor: pick(people),
      event: pick(["update-secret", "create-secret", "update-secret", "delete-secret"]),
      project,
      environment,
      target: pick(secretKeys),
      source: pick(["Web", "CLI", "Terraform"])
    };
  } else if (roll < 0.9) {
    entry = {
      ...base,
      actor: machines[3],
      event: pick(["cmek-encrypt", "cmek-decrypt"]),
      project: "kms-keys",
      target: pick(kmsKeys),
      source: "Node SDK"
    };
  } else if (roll < 0.96) {
    entry = {
      ...base,
      actor: machines[4],
      event: "issue-cert",
      project: "internal-pki",
      target: pick(["api.acme.dev", "checkout.acme.dev", "vault.internal.acme.dev"]),
      source: "Python SDK"
    };
  } else {
    entry = {
      ...base,
      actor: pick(people.slice(0, 2)),
      event: pick(["create-identity-universal-auth-client-secret", "add-workspace-member"]),
      project,
      source: "Web"
    };
  }
  cache.set(index, entry);
  return entry;
};

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = (value: number) => String(value).padStart(2, "0");
const formatTime = (at: number) => {
  const date = new Date(at);
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${two(date.getUTCHours())}:${two(date.getUTCMinutes())}:${two(date.getUTCSeconds())}`;
};

const ranges = [
  { value: "1h", label: "1h", ms: 3600 * 1000, title: "last hour" },
  { value: "24h", label: "24h", ms: 24 * 3600 * 1000, title: "last 24 hours" },
  { value: "7d", label: "7d", ms: 7 * 24 * 3600 * 1000, title: "last 7 days" },
  { value: "30d", label: "30d", ms: window30d, title: "last 30 days" }
] as const;
const eventOptions = [
  { value: "all", label: "All events" },
  ...[
    "get-secrets",
    "get-secret",
    "create-secret",
    "update-secret",
    "delete-secret",
    "login-identity-universal-auth",
    "create-identity-universal-auth-client-secret",
    "add-workspace-member",
    "cmek-encrypt",
    "cmek-decrypt",
    "issue-cert"
  ].map((value) => ({ value, label: value }))
];
const actorOptions = [
  { value: "all", label: "All actors" },
  ...people.map((actor) => ({ value: actor.name, label: actor.name, group: "Users" })),
  ...machines.map((actor) => ({
    value: actor.name,
    label: actor.name,
    group: "Machine identities"
  }))
];
const projectOptions = [
  { value: "all", label: "All projects" },
  ...[...secretProjects, "internal-pki", "kms-keys"].map((value) => ({ value, label: value }))
];
const environmentOptions = [
  { value: "all", label: "All environments" },
  { value: "production", label: "Production" },
  { value: "staging", label: "Staging" },
  { value: "development", label: "Development" }
];

type Row = AuditEvent | { id: string; placeholder: true };
const isPlaceholder = (row: Row): row is { id: string; placeholder: true } => "placeholder" in row;
const placeholders: Row[] = Array.from({ length: 10 }, (_, index) => ({
  id: `placeholder-${index}`,
  placeholder: true
}));

const makeColumns = (onOpen: (entry: AuditEvent) => void): DataTableColumn<Row>[] => [
  {
    id: "time",
    header: "Time",
    width: 184,
    render: (row) =>
      isPlaceholder(row) ? <Skeleton width={136} height={12} /> : <Meta>{formatTime(row.at)}</Meta>
  },
  {
    id: "actor",
    header: "Actor",
    width: 300,
    maxWidth: 300,
    text: (row) => (isPlaceholder(row) ? "" : row.actor.name),
    render: (row) =>
      isPlaceholder(row) ? (
        <Inline gap={8} align="center" wrap={false}>
          <Skeleton width={24} height={24} />
          <Skeleton width={140} height={12} />
        </Inline>
      ) : (
        <Identity
          name={row.actor.name}
          kind={row.actor.machine ? "machine" : "person"}
          mono={row.actor.machine}
          title={<MiddleTruncate mono={row.actor.machine} text={row.actor.name} />}
        />
      )
  },
  {
    id: "event",
    header: "Event",
    grow: true,
    maxWidth: 380,
    primary: true,
    text: (row) => (isPlaceholder(row) ? "" : row.event),
    render: (row) =>
      isPlaceholder(row) ? (
        <Skeleton width={240} height={12} />
      ) : (
        <Inline gap={12} align="center" wrap={false}>
          <code style={{ flexShrink: 0 }}>{row.event}</code>
          {(row.project || row.target) && (
            <Meta
              mono={false}
              style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {[row.project, row.environment, row.target].filter(Boolean).join(", ")}
            </Meta>
          )}
        </Inline>
      )
  },
  {
    id: "source",
    header: "Source",
    width: 232,
    render: (row) =>
      isPlaceholder(row) ? (
        <Skeleton width={120} height={12} />
      ) : (
        <Inline gap={8} align="center">
          {row.source}
          <Meta>{row.ip}</Meta>
        </Inline>
      )
  },
  {
    id: "open",
    header: "Details",
    actions: true,
    hideHeader: true,
    render: (row) =>
      isPlaceholder(row) ? null : (
        <Button
          variant="ghost"
          size="icon-sm"
          icon="chev-right"
          iconOnly
          onClick={() => onOpen(row)}
        >
          {`Open ${row.event} by ${row.actor.name}`}
        </Button>
      )
  }
];

const initialFrame = 11 * rowHeight;
const day = 24 * 3600 * 1000;
const formatDay = (date: Date) => `${months[date.getMonth()]} ${date.getDate()}`;

export default function AuditLogs() {
  const { org } = useCrumbs();
  const [range, setRange] = useState<string>("30d");
  const [custom, setCustom] = useState<DateRange>();
  const [opened, setOpened] = useState<AuditEvent | null>(null);
  const columns = useMemo(() => makeColumns(setOpened), []);
  const [eventType, setEventType] = useState("all");
  const [actor, setActor] = useState("all");
  const [project, setProject] = useState("all");
  const [environment, setEnvironment] = useState("all");
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(page);
  const [frame, setFrame] = useState(initialFrame);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const preset = ranges.find((item) => item.value === range);
  const active =
    !preset && custom?.from && custom.to
      ? {
          from: custom.from.getTime(),
          to: custom.to.getTime() + day,
          title: `${formatDay(custom.from)} to ${formatDay(custom.to)}`
        }
      : { from: now - (preset ?? ranges[3]).ms, to: now, title: (preset ?? ranges[3]).title };

  const matching = useMemo(() => {
    const query = search.trim().toLowerCase();
    const result: AuditEvent[] = [];
    for (let index = 0; index < total; index += 1) {
      const entry = eventAt(index);
      if (entry.at < active.from) break;
      const matches =
        entry.at <= active.to &&
        (eventType === "all" || entry.event === eventType) &&
        (actor === "all" || entry.actor.name === actor) &&
        (project === "all" || entry.project === project) &&
        (environment === "all" || entry.environment === environment) &&
        (!query ||
          [entry.event, entry.actor.name, entry.project, entry.target, entry.source].some((value) =>
            value?.toLowerCase().includes(query)
          ));
      if (matches) result.push(entry);
    }
    return result;
  }, [active.from, active.to, eventType, actor, project, environment, search]);

  const reset = () => {
    setLoaded(page);
    setFrame(initialFrame);
    setRefreshing(true);
  };
  useEffect(() => {
    if (!refreshing) return undefined;
    const timer = window.setTimeout(() => setRefreshing(false), 500);
    return () => window.clearTimeout(timer);
  }, [refreshing]);
  useEffect(() => {
    if (!loadingMore) return undefined;
    const timer = window.setTimeout(() => {
      setLoaded((count) => count + page);
      setFrame((height) => Math.min(maxFrame, height + 6 * rowHeight));
      setLoadingMore(false);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [loadingMore]);

  const shown = matching.slice(0, loaded);
  const filtered =
    eventType !== "all" ||
    actor !== "all" ||
    project !== "all" ||
    environment !== "all" ||
    search !== "";
  const clear = () => {
    setEventType("all");
    setActor("all");
    setProject("all");
    setEnvironment("all");
    setSearch("");
    reset();
  };
  const filter = (set: (value: string) => void) => (value: string) => {
    set(value);
    reset();
  };

  return (
    <Shell level="org" current="audit" crumbs={[org, { label: "Audit logs" }]}>
      <Stack gap={24}>
        <PageHeader
          title="Audit logs"
          description="Audit logs for security and compliance teams to monitor information access."
          actions={
            <>
              <ToggleGroup
                type="single"
                aria-label="Date range"
                value={range}
                onValueChange={(value) => {
                  const next = ranges.find((item) => item.value === value);
                  if (!next) return;
                  setRange(next.value);
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
                    defaultMonth={new Date(2026, 9, 1)}
                    disabled={{ after: new Date(2026, 9, 22), before: new Date(2026, 8, 22) }}
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
                        : "Choose a start and end date in the last 30 days"
                    }
                  />
                </PopoverContent>
              </Popover>
            </>
          }
          tabs={
            <Tabs
              label="Audit log sections"
              defaultValue="logs"
              tabs={[
                { value: "logs", label: "Audit logs", content: null },
                { value: "streams", label: "External log streams", count: 2, content: null },
                { value: "settings", label: "Settings", content: null }
              ]}
            />
          }
        />
        <Inline gap={8} align="center">
          <div style={{ flex: 1 }}>
            <Input
              icon="search"
              placeholder="Search events, actors and projects"
              kbd="/"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setLoaded(page);
              }}
            />
          </div>
          <div style={{ width: 184 }}>
            <Select
              aria-label="Event type"
              options={eventOptions}
              value={eventType}
              onChange={filter(setEventType)}
              menuWidth={320}
            />
          </div>
          <div style={{ width: 184 }}>
            <Select
              aria-label="Actor"
              options={actorOptions}
              value={actor}
              onChange={filter(setActor)}
              menuWidth={280}
            />
          </div>
          <div style={{ width: 160 }}>
            <Select
              aria-label="Project"
              options={projectOptions}
              value={project}
              onChange={filter(setProject)}
            />
          </div>
          <div style={{ width: 184 }}>
            <Select
              aria-label="Environment"
              options={environmentOptions}
              value={environment}
              onChange={filter(setEnvironment)}
            />
          </div>
        </Inline>
        <Stack gap={12}>
          <Inline gap={16} align="center" justify="between">
            <Heading level={2} size="subsection">
              Audit log, {active.title}
            </Heading>
            <Meta mono={false}>
              {refreshing
                ? "Loading events"
                : `Showing ${shown.length.toLocaleString("en-US")} of ${matching.length.toLocaleString("en-US")}`}
            </Meta>
          </Inline>
          <DataTable<Row>
            label={`Audit log, ${active.title}`}
            rows={refreshing ? placeholders : shown}
            columns={columns}
            getRowId={(row) => row.id}
            rowLabel={(row) =>
              isPlaceholder(row) ? "Loading" : `${row.event} by ${row.actor.name}`
            }
            height={frame}
            rowHeight={rowHeight}
            virtual
            loadMore={
              !refreshing && shown.length < matching.length
                ? {
                    label: `Load ${Math.min(page, matching.length - shown.length)} more`,
                    loading: loadingMore,
                    onClick: () => setLoadingMore(true)
                  }
                : undefined
            }
            empty={
              <EmptyState
                size="sm"
                media="bare"
                icon="history"
                title="No events match these filters"
                description={`Nothing in the ${active.title}. Try a wider date range or clear the filters.`}
                actions={
                  filtered ? (
                    <Button variant="outline" onClick={clear}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        </Stack>
      </Stack>
      <Sheet open={Boolean(opened)} onOpenChange={(open) => !open && setOpened(null)}>
        <SheetContent>
          {opened && (
            <>
              <SheetHeader>
                <SheetTitle>
                  <code>{opened.event}</code>
                </SheetTitle>
                <SheetDescription>{formatTime(opened.at)} UTC</SheetDescription>
              </SheetHeader>
              <SheetBody>
                <DataList
                  variant="props"
                  items={[
                    [
                      "Actor",
                      <Identity
                        key="actor"
                        name={opened.actor.name}
                        kind={opened.actor.machine ? "machine" : "person"}
                        mono={opened.actor.machine}
                        description={opened.actor.machine ? "Machine identity" : "User"}
                      />
                    ],
                    ["Project", opened.project ?? "Organization"],
                    ["Environment", opened.environment ?? "None"],
                    [
                      "Resource",
                      opened.target ? <code key="target">{opened.target}</code> : "None"
                    ],
                    ["Source", opened.source],
                    ["IP address", <Meta key="ip">{opened.ip}</Meta>],
                    ["Event ID", <Meta key="id">{opened.id}</Meta>]
                  ]}
                />
              </SheetBody>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Shell>
  );
}
