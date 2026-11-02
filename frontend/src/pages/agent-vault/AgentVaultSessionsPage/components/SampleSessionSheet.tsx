import { useEffect, useMemo, useState } from "react";
import { ArrowRightIcon, BotIcon, PackageIcon, SparklesIcon } from "lucide-react";

import {
  Badge,
  Button,
  Detail,
  DetailLabel,
  DetailValue,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { AgentVaultSessionLogDecision, AgentVaultSessionStatus } from "@app/hooks/api/agentVault";
import { TAgentVaultSessionLogRecord } from "@app/hooks/api/agentVault/types";

import { LiveStateBadge } from "./LiveStatusRow";
import { SessionLogRow } from "./SessionLogRow";
import { SessionStatusBadge } from "./SessionStatusBadge";

// The empty state holds long enough to read as waiting, not flicker past.
const FIRST_REQUEST_DELAY_MS = 1400;
const STREAM_INTERVAL_MS = 650;

type SampleRequest = Omit<TAgentVaultSessionLogRecord, "ts" | "seq" | "proxyId" | "accessBundle">;

const SAMPLE_REQUESTS: SampleRequest[] = [
  {
    method: "POST",
    host: "api.openai.com",
    port: "443",
    path: "/v1/chat/completions",
    status: 200,
    decision: AgentVaultSessionLogDecision.Brokered,
    service: "openai"
  },
  {
    method: "GET",
    host: "api.github.com",
    port: "443",
    path: "/repos/halcyon/api/pulls?state=open",
    status: 200,
    decision: AgentVaultSessionLogDecision.Brokered,
    service: "github"
  },
  {
    method: "GET",
    host: "api.github.com",
    port: "443",
    path: "/repos/halcyon/api/pulls/482/files",
    status: 200,
    decision: AgentVaultSessionLogDecision.Brokered,
    service: "github"
  },
  {
    method: "POST",
    host: "api.openai.com",
    port: "443",
    path: "/v1/chat/completions",
    status: 200,
    decision: AgentVaultSessionLogDecision.Brokered,
    service: "openai"
  },
  {
    method: "POST",
    host: "api.github.com",
    port: "443",
    path: "/repos/halcyon/api/issues/482/comments",
    status: 201,
    decision: AgentVaultSessionLogDecision.Brokered,
    service: "github"
  },
  {
    method: "DELETE",
    host: "api.github.com",
    port: "443",
    path: "/repos/halcyon/api/git/refs/heads/main",
    status: 403,
    decision: AgentVaultSessionLogDecision.Blocked,
    service: "github"
  },
  {
    method: "GET",
    host: "registry.npmjs.org",
    port: "443",
    path: "/left-pad",
    status: 200,
    decision: AgentVaultSessionLogDecision.Passthrough,
    service: null
  },
  {
    method: "POST",
    host: "paste.example.net",
    port: "443",
    path: "/api/new",
    status: 403,
    decision: AgentVaultSessionLogDecision.Blocked,
    service: null
  },
  {
    method: "POST",
    host: "slack.com",
    port: "443",
    path: "/api/chat.postMessage",
    status: 200,
    decision: AgentVaultSessionLogDecision.Brokered,
    service: "slack"
  }
];

const buildSampleRecords = (now: number): TAgentVaultSessionLogRecord[] =>
  SAMPLE_REQUESTS.map((request, index) => ({
    ...request,
    ts: new Date(now - (SAMPLE_REQUESTS.length - index) * 4000).toISOString(),
    seq: index,
    proxyId: "sample",
    accessBundle: "release-agents"
  })).reverse();

const HeaderPanel = ({
  title,
  lines,
  tone
}: {
  title: string;
  lines: { name: string; value: string; isAdded?: boolean }[];
  tone: "muted" | "success";
}) => (
  <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-md border border-border bg-container p-3">
    <span className="text-xs text-accent">{title}</span>
    <div className="flex flex-col gap-1 font-mono text-xs">
      {lines.map((line) => (
        <div key={line.name} className="flex min-w-0 gap-2">
          <span className="shrink-0 text-muted">{line.name}:</span>
          <span
            className={
              line.isAdded && tone === "success"
                ? "truncate text-success"
                : "truncate text-foreground"
            }
          >
            {line.value}
          </span>
        </div>
      ))}
    </div>
  </div>
);

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSetUp?: () => void;
};

export const SampleSessionSheet = ({ isOpen, onOpenChange, onSetUp }: Props) => {
  const [openedAt, setOpenedAt] = useState(() => Date.now());
  const [visibleCount, setVisibleCount] = useState(0);
  const records = useMemo(() => buildSampleRecords(openedAt), [openedAt]);

  useEffect(() => {
    if (!isOpen) return undefined;
    setOpenedAt(Date.now());
    setVisibleCount(0);
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      setVisibleCount(1);
      interval = setInterval(() => {
        setVisibleCount((count) => {
          if (count + 1 >= SAMPLE_REQUESTS.length) clearInterval(interval);
          return Math.min(count + 1, SAMPLE_REQUESTS.length);
        });
      }, STREAM_INTERVAL_MS);
    }, FIRST_REQUEST_DELAY_MS);
    return () => {
      clearTimeout(start);
      clearInterval(interval);
    };
  }, [isOpen]);

  // Records are newest first, so the stream reveals them from the bottom of the list upwards.
  const visible = records.slice(records.length - visibleCount);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        size="workspace"
        className="flex h-full max-h-full flex-col gap-y-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Sample Session
            <Badge variant="info">
              <SparklesIcon />
              Sample Data
            </Badge>
          </SheetTitle>
          <SheetDescription>
            An example of the requests a session records. This data is not from your organization.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="flex shrink-0 items-center gap-4 overflow-hidden rounded-md border border-border bg-container py-3 pr-4">
            <div className="-ml-px flex min-w-0 flex-1 flex-wrap gap-y-3 *:border-l *:border-border *:px-4">
              <Detail className="min-w-0">
                <DetailLabel>Machine Identity</DetailLabel>
                <DetailValue className="flex items-center gap-2">
                  <BotIcon className="size-4 shrink-0 text-muted" />
                  <span className="truncate">release-bot</span>
                </DetailValue>
              </Detail>
              <Detail className="min-w-0">
                <DetailLabel>Access Bundle</DetailLabel>
                <DetailValue className="flex items-center gap-2">
                  <PackageIcon className="size-4 shrink-0 text-muted" />
                  <span className="truncate">release-agents</span>
                </DetailValue>
              </Detail>
              <Detail>
                <DetailLabel>Expires</DetailLabel>
                <DetailValue>In 8 hours</DetailValue>
              </Detail>
              <Detail className="items-start">
                <DetailLabel>Status</DetailLabel>
                <SessionStatusBadge status={AgentVaultSessionStatus.Active} />
              </Detail>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2">
            <span className="text-sm font-medium">How the first request was brokered</span>
            <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
              <HeaderPanel
                title="Request from the agent"
                tone="muted"
                lines={[
                  { name: "POST", value: "https://api.openai.com/v1/chat/completions" },
                  { name: "Authorization", value: "(not set)" }
                ]}
              />
              <ArrowRightIcon className="mx-auto size-4 shrink-0 rotate-90 text-muted md:rotate-0" />
              <HeaderPanel
                title="Request forwarded by the proxy"
                tone="success"
                lines={[
                  { name: "POST", value: "https://api.openai.com/v1/chat/completions" },
                  { name: "Authorization", value: "Bearer sk-proj-••••••••••••", isAdded: true }
                ]}
              />
            </div>
            <span className="text-xs text-muted">
              The credential is stored in the access bundle and attached by the proxy. The agent has
              only a session token, so no credential is present in its environment.
            </span>
          </div>

          <div className="flex min-h-64 flex-1 flex-col">
            {visible.length === 0 ? (
              <Empty className="flex-1 border">
                <EmptyHeader>
                  <LiveStateBadge state="live" />
                  <EmptyTitle>Waiting for requests</EmptyTitle>
                  <EmptyDescription>Requests made through a proxy show up here.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table
                className="w-full min-w-240 table-fixed"
                containerClassName="min-h-0 thin-scrollbar overflow-auto"
              >
                <TableHeader sticky>
                  <TableRow>
                    <TableHead className="w-48">Time</TableHead>
                    <TableHead className="w-24">Method</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>Path</TableHead>
                    <TableHead className="w-24">Upstream</TableHead>
                    <TableHead className="w-36">Outcome</TableHead>
                    <TableHead variant="action" className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((record) => (
                    <SessionLogRow
                      key={record.seq}
                      record={record}
                      arrivedAt={
                        openedAt + FIRST_REQUEST_DELAY_MS + record.seq * STREAM_INTERVAL_MS
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        <SheetFooter className="flex-row items-center justify-between border-t border-border">
          <span className="text-xs text-muted">
            The proxy attached a credential to each brokered request. Blocked requests were not
            forwarded.
          </span>
          {onSetUp && (
            <Button variant="av" onClick={onSetUp}>
              Set Up Your Own
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export const SampleSessionTable = ({ onOpen }: { onOpen: () => void }) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Identity</TableHead>
        <TableHead>Access Bundle</TableHead>
        <TableHead>Created</TableHead>
        <TableHead>Expires</TableHead>
        <TableHead>Status</TableHead>
        <TableHead variant="action" />
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow onClick={onOpen} className="cursor-pointer">
        <TableCell>
          <div className="flex items-center gap-2">
            <BotIcon className="size-4 text-muted" />
            release-bot
            <Badge variant="info">
              <SparklesIcon />
              Sample
            </Badge>
          </div>
        </TableCell>
        <TableCell>
          <span className="flex items-center gap-2">
            <PackageIcon className="size-4 text-muted" />
            release-agents
          </span>
        </TableCell>
        <TableCell className="text-muted">Example</TableCell>
        <TableCell className="text-muted">In 8 hours</TableCell>
        <TableCell>
          <SessionStatusBadge status={AgentVaultSessionStatus.Active} />
        </TableCell>
        <TableCell variant="action">
          <Button
            variant="outline"
            size="xs"
            onClick={(event) => {
              event.stopPropagation();
              onOpen();
            }}
          >
            View Sample
          </Button>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
);
