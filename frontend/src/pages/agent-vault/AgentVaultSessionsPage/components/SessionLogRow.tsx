import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { format } from "date-fns";
import {
  ArrowRightIcon,
  BookOpenTextIcon,
  ChevronRightIcon,
  CircleHelpIcon,
  CircleXIcon,
  InfoIcon,
  KeyIcon,
  ListIcon,
  type LucideIcon,
  PlusIcon,
  ServerIcon,
  ShieldBanIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { ServiceIcon } from "@app/components/agent-vault/ServiceIconStack";
import {
  Badge,
  Button,
  CodeBlock,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { isInfisicalLogHost } from "@app/helpers/agentVaultSessionLogs";
import { AgentVaultServiceType, AgentVaultSessionLogDecision } from "@app/hooks/api/agentVault";
import {
  TAgentVaultSessionLogMcpCall,
  TAgentVaultSessionLogNativeDetail,
  TAgentVaultSessionLogRecord
} from "@app/hooks/api/agentVault/types";

import {
  groupRepeatedMcpCalls,
  hasNativeSessionLogDetails,
  httpStatusLabel,
  isNativeSessionLogRecord,
  mcpMoreCallsLabel,
  nativeSessionLogSections,
  nativeSessionLogSummary,
  sessionLogMcpCalls,
  sessionLogMcpCallsTruncated,
  sessionLogMethodLabel
} from "./SessionLogsPanel.utils";

const ARRIVAL_HOLD_MS = 1200;

export const SESSION_LOG_COLUMN_COUNT = 7;

export const DECISION_PRESENTATION: Record<
  AgentVaultSessionLogDecision,
  {
    label: string;
    variant: "success" | "neutral" | "warning" | "danger";
    icon: LucideIcon;
    iconClassName: string;
  }
> = {
  [AgentVaultSessionLogDecision.Brokered]: {
    label: "Brokered",
    variant: "success",
    icon: KeyIcon,
    iconClassName: "text-success"
  },
  [AgentVaultSessionLogDecision.Passthrough]: {
    label: "Passthrough",
    variant: "neutral",
    icon: ArrowRightIcon,
    iconClassName: "text-neutral"
  },
  [AgentVaultSessionLogDecision.Blocked]: {
    label: "Blocked",
    variant: "warning",
    icon: ShieldBanIcon,
    iconClassName: "text-warning"
  },
  [AgentVaultSessionLogDecision.Error]: {
    label: "Error",
    variant: "danger",
    icon: CircleXIcon,
    iconClassName: "text-danger"
  },
  [AgentVaultSessionLogDecision.Discovery]: {
    label: "Listed Services",
    variant: "neutral",
    icon: ListIcon,
    iconClassName: "text-neutral"
  },
  [AgentVaultSessionLogDecision.Skills]: {
    label: "Fetched Skills",
    variant: "neutral",
    icon: BookOpenTextIcon,
    iconClassName: "text-neutral"
  }
};

const decisionPresentation = (decision: AgentVaultSessionLogDecision) =>
  DECISION_PRESENTATION[decision] ?? {
    label: decision || "Unknown",
    variant: "neutral" as const,
    icon: CircleHelpIcon
  };

const statusTone = (status: number) => {
  if (status >= 500) return "text-danger";
  if (status >= 400) return "text-warning";
  return "text-foreground";
};

// Agent Vault answers Blocked and Error requests itself, so their statuses don't come from the host the request named.
const isProxyAnswered = (decision: AgentVaultSessionLogDecision) =>
  decision === AgentVaultSessionLogDecision.Blocked ||
  decision === AgentVaultSessionLogDecision.Error;

// Discovery and Skills requests go to the session's Infisical, so their status is Infisical's own answer and shows like
// any host's, while the outcome says what the agent asked for.
const isSessionEndpoint = (decision: AgentVaultSessionLogDecision) =>
  decision === AgentVaultSessionLogDecision.Discovery ||
  decision === AgentVaultSessionLogDecision.Skills;

const outcomeDescription = (record: TAgentVaultSessionLogRecord) => {
  if (record.decision === AgentVaultSessionLogDecision.Discovery) {
    return record.status === 200
      ? "The agent asked Agent Vault which services this session can use, and Agent Vault listed them"
      : `The agent asked Agent Vault which services this session can use, and Agent Vault returned ${httpStatusLabel(record.status)}`;
  }
  if (record.decision === AgentVaultSessionLogDecision.Skills) {
    return record.status === 200
      ? "Agent Vault got this session's skills from Infisical"
      : `Agent Vault asked Infisical for this session's skills, and Infisical returned ${httpStatusLabel(record.status)}`;
  }
  const answer = `Agent Vault returned ${httpStatusLabel(record.status)}`;
  return record.decision === AgentVaultSessionLogDecision.Blocked
    ? `${answer} without sending this request to ${record.host}`
    : `${answer} with no response from ${record.host}`;
};

// A host pattern without a port means 443, and an IPv6 literal needs its brackets back.
export const hostPatternFor = (record: TAgentVaultSessionLogRecord) => {
  const host = record.host.includes(":") ? `[${record.host}]` : record.host;
  return record.port === "443" ? host : `${host}:${record.port}`;
};

const PathDetail = ({ record }: { record: TAgentVaultSessionLogRecord }) => (
  <span className="block truncate" title={record.path}>
    {record.path}
  </span>
);

// The proxy records a tool only for tools/call, so the method beside it would say nothing new.
const McpCallText = ({ call, path }: { call: TAgentVaultSessionLogMcpCall; path: string }) =>
  call.tool ? (
    <Tooltip>
      <TooltipTrigger className="min-w-0 truncate text-left">{call.tool}</TooltipTrigger>
      <TooltipContent className="max-w-sm break-all">{call.tool}</TooltipContent>
    </Tooltip>
  ) : (
    <span className="min-w-0 truncate" title={path}>
      {call.method}
    </span>
  );

const McpDetail = ({ record }: { record: TAgentVaultSessionLogRecord }) => {
  const [first, ...rest] = sessionLogMcpCalls(record);
  const truncated = sessionLogMcpCallsTruncated(record);

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Badge variant="info">
        <ServerIcon />
        MCP
      </Badge>
      {first ? (
        <McpCallText call={first} path={record.path} />
      ) : (
        <span className="min-w-0 truncate" title={record.path}>
          {record.path}
        </span>
      )}
      {(rest.length > 0 || truncated) && (
        <Tooltip>
          <TooltipTrigger className="shrink-0 text-xs text-muted">
            {mcpMoreCallsLabel(rest.length, truncated)}
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            {rest.length > 0 && (
              <div className="flex flex-col text-xs">
                {groupRepeatedMcpCalls(rest).map(({ label, count }, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <span key={index}>
                    {label}
                    {count > 1 && <span className="text-muted"> ×{count}</span>}
                  </span>
                ))}
              </div>
            )}
            {truncated && (
              <p className={twMerge("text-xs text-muted", rest.length > 0 && "mt-1.5")}>
                More calls in this request weren&apos;t recorded.
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );
};

// The row says which service type it is in the Method column, so the summary carries no badge.
const NativeSummary = ({
  record,
  detailId,
  isExpanded,
  onToggle
}: {
  record: TAgentVaultSessionLogRecord;
  detailId: string;
  isExpanded: boolean;
  onToggle?: () => void;
}) => {
  const summary = nativeSessionLogSummary(record);
  if (!onToggle) {
    return summary ? (
      <span className="block truncate font-mono text-xs" title={summary}>
        {summary}
      </span>
    ) : (
      <span className="text-muted">No details recorded</span>
    );
  }
  return (
    <button
      type="button"
      aria-expanded={isExpanded}
      aria-controls={isExpanded ? detailId : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className="flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronRightIcon
        aria-hidden
        className={twMerge(
          "size-3.5 shrink-0 text-muted transition-transform duration-200 motion-reduce:transition-none",
          isExpanded && "rotate-90 text-foreground"
        )}
      />
      <span className="min-w-0 truncate font-mono text-xs">
        {summary || <span className="font-sans text-muted">Show details</span>}
      </span>
    </button>
  );
};

const NativeDetailPanel = ({ native }: { native: TAgentVaultSessionLogNativeDetail }) => (
  <div className="flex min-w-0 flex-col gap-3">
    {nativeSessionLogSections(native).map((section) => (
      <CodeBlock
        key={section.label}
        label={section.label}
        value={section.value}
        className={twMerge(
          "max-h-80 break-words whitespace-pre-wrap",
          section.isError && "text-danger"
        )}
      />
    ))}
    {(native.note || native.truncated) && (
      <div className="flex flex-col gap-1 text-xs text-label">
        {native.note && (
          <p className="flex items-start gap-1.5">
            <InfoIcon aria-hidden className="mt-px size-3.5 shrink-0" />
            <span>{native.note}</span>
          </p>
        )}
        {native.truncated && (
          <p className="text-muted">Longer text was cut short when it was recorded.</p>
        )}
      </div>
    )}
  </div>
);

const RequestDetail = ({ record }: { record: TAgentVaultSessionLogRecord }) =>
  record.serviceType === AgentVaultServiceType.Mcp ? (
    <McpDetail record={record} />
  ) : (
    <PathDetail record={record} />
  );

type Props = {
  record: TAgentVaultSessionLogRecord;
  arrivedAt?: number;
  accessBundleName?: string;
  onAddService?: () => void;
  /** Whether a database or SSH row shows its recorded details beneath it. */
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
  /** Told the height of the row and its details while they are open, so the list can make room. */
  onMeasure?: (height: number) => void;
};

export const SessionLogRow = ({
  record,
  arrivedAt,
  accessBundleName,
  onAddService,
  isExpanded = false,
  onToggleExpanded,
  onMeasure
}: Props) => {
  const [isArriving, setIsArriving] = useState(false);
  const isNative = isNativeSessionLogRecord(record);
  const { native } = record;
  const isExpandable = isNative && hasNativeSessionLogDetails(native) && Boolean(onToggleExpanded);
  const isOpen = isExpandable && isExpanded;
  const detailId = useId();
  const rowRef = useRef<HTMLTableRowElement>(null);
  const detailRef = useRef<HTMLTableRowElement>(null);
  const onMeasureRef = useRef(onMeasure);
  const wasExpandedRef = useRef(false);

  useLayoutEffect(() => {
    onMeasureRef.current = onMeasure;
  });

  // Reported only around an expansion: a collapsed row is the height the list already assumes.
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || (!isOpen && !wasExpandedRef.current)) return undefined;
    wasExpandedRef.current = isOpen;
    const report = () =>
      onMeasureRef.current?.(row.offsetHeight + (detailRef.current?.offsetHeight ?? 0));
    report();
    if (!isOpen) return undefined;
    const observer = new ResizeObserver(report);
    observer.observe(row);
    if (detailRef.current) observer.observe(detailRef.current);
    return () => observer.disconnect();
  }, [isOpen]);

  useEffect(() => {
    if (arrivedAt === undefined) return undefined;
    const remaining = arrivedAt + ARRIVAL_HOLD_MS - Date.now();
    if (remaining <= 0) return undefined;
    setIsArriving(true);
    const timer = setTimeout(() => setIsArriving(false), remaining);
    return () => clearTimeout(timer);
  }, [arrivedAt]);

  const presentation = decisionPresentation(record.decision);
  // A database or SSH exchange has no HTTP status: its record carries 0, which is not an error.
  const proxyAnswered = !isNative && isProxyAnswered(record.decision);
  const hasHttpStatus = !isNative && !proxyAnswered && Boolean(record.status);
  const isOutcomeDescribed = proxyAnswered || isSessionEndpoint(record.decision);
  const outcomeHover = isOutcomeDescribed && record.status ? outcomeDescription(record) : null;
  const outcome = (
    <Badge variant={presentation.variant}>
      <presentation.icon />
      {presentation.label}
    </Badge>
  );
  // Several database or SSH services can share a server, so their rows lead with the service and keep the address
  // for hover. An HTTP row's host is what it reached, so it leads with that.
  const showsServiceName = isNative && Boolean(record.service);
  const address = record.host.includes(":") ? `[${record.host}]` : record.host;
  const hostLabel = showsServiceName ? record.service : record.host;
  const hostHover = showsServiceName ? `${address}:${record.port}` : record.service;
  const host = (
    <span className="flex w-fit max-w-full items-center gap-2 text-sm">
      <ServiceIcon
        hostPattern={record.host}
        serviceType={record.serviceType}
        isInfisical={isSessionEndpoint(record.decision) || isInfisicalLogHost(record)}
      />
      <span className="truncate" title={hostHover ? undefined : record.host}>
        {hostLabel}
      </span>
    </span>
  );

  return (
    <>
      <TableRow
        ref={rowRef}
        onClick={isExpandable ? onToggleExpanded : undefined}
        className={twMerge(
          "transition-colors duration-700 motion-reduce:transition-none",
          isOpen && "bg-container-hover [&>td]:border-b-0",
          isArriving && "bg-surface-active"
        )}
      >
        <TableCell>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="whitespace-nowrap tabular-nums">
                {format(new Date(record.ts), "MMM dd, yyyy HH:mm:ss")}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {format(new Date(record.ts), "MMM dd, yyyy HH:mm:ss.SSS (zzz)")}
            </TooltipContent>
          </Tooltip>
        </TableCell>
        <TableCell className="truncate font-mono text-xs">
          {sessionLogMethodLabel(record)}
        </TableCell>
        <TableCell>
          {hostHover ? (
            <Tooltip>
              <TooltipTrigger asChild>{host}</TooltipTrigger>
              <TooltipContent>{hostHover}</TooltipContent>
            </Tooltip>
          ) : (
            host
          )}
        </TableCell>
        <TableCell>
          {isNative ? (
            <NativeSummary
              record={record}
              detailId={detailId}
              isExpanded={isOpen}
              onToggle={isExpandable ? onToggleExpanded : undefined}
            />
          ) : (
            <RequestDetail record={record} />
          )}
        </TableCell>
        <TableCell className="font-mono text-xs">
          {hasHttpStatus ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={statusTone(record.status)}>{record.status}</span>
              </TooltipTrigger>
              <TooltipContent>
                {record.host} returned {httpStatusLabel(record.status)}
              </TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-muted">—</span>
          )}
        </TableCell>
        <TableCell>
          {outcomeHover ? (
            <Tooltip>
              <TooltipTrigger asChild>{outcome}</TooltipTrigger>
              <TooltipContent className="max-w-sm">{outcomeHover}</TooltipContent>
            </Tooltip>
          ) : (
            outcome
          )}
        </TableCell>
        <TableCell variant="action">
          {onAddService && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="xs" onClick={onAddService}>
                  <PlusIcon />
                  Add Service
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Add {record.host} to {accessBundleName}
              </TooltipContent>
            </Tooltip>
          )}
        </TableCell>
      </TableRow>
      {isOpen && native && (
        <TableRow ref={detailRef} id={detailId} className="bg-container-hover">
          <TableCell colSpan={SESSION_LOG_COLUMN_COUNT} className="py-3 whitespace-normal">
            <NativeDetailPanel native={native} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
};
