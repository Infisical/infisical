import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  ArrowRightIcon,
  BookOpenTextIcon,
  CircleHelpIcon,
  CircleXIcon,
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
  TAgentVaultSessionLogRecord
} from "@app/hooks/api/agentVault/types";

import {
  groupRepeatedMcpCalls,
  httpStatusLabel,
  mcpMoreCallsLabel,
  sessionLogMcpCalls,
  sessionLogMcpCallsTruncated
} from "./SessionLogsPanel.utils";

const ARRIVAL_HOLD_MS = 1200;

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
};

export const SessionLogRow = ({ record, arrivedAt, accessBundleName, onAddService }: Props) => {
  const [isArriving, setIsArriving] = useState(false);

  useEffect(() => {
    if (arrivedAt === undefined) return undefined;
    const remaining = arrivedAt + ARRIVAL_HOLD_MS - Date.now();
    if (remaining <= 0) return undefined;
    setIsArriving(true);
    const timer = setTimeout(() => setIsArriving(false), remaining);
    return () => clearTimeout(timer);
  }, [arrivedAt]);

  const presentation = decisionPresentation(record.decision);
  const proxyAnswered = isProxyAnswered(record.decision);
  const isOutcomeDescribed = proxyAnswered || isSessionEndpoint(record.decision);
  const outcome = (
    <Badge variant={presentation.variant}>
      <presentation.icon />
      {presentation.label}
    </Badge>
  );
  const host = (
    <span className="flex w-fit max-w-full items-center gap-2 text-sm">
      <ServiceIcon
        hostPattern={record.host}
        isInfisical={isSessionEndpoint(record.decision) || isInfisicalLogHost(record)}
      />
      <span className="truncate" title={record.service ? undefined : record.host}>
        {record.host}
      </span>
    </span>
  );

  return (
    <TableRow
      className={twMerge(
        "transition-colors duration-700 motion-reduce:transition-none",
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
      <TableCell className="font-mono text-xs">{record.method}</TableCell>
      <TableCell>
        {record.service ? (
          <Tooltip>
            <TooltipTrigger asChild>{host}</TooltipTrigger>
            <TooltipContent>{record.service}</TooltipContent>
          </Tooltip>
        ) : (
          host
        )}
      </TableCell>
      <TableCell>
        <RequestDetail record={record} />
      </TableCell>
      <TableCell className="font-mono text-xs">
        {!proxyAnswered && record.status ? (
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
        {isOutcomeDescribed && record.status ? (
          <Tooltip>
            <TooltipTrigger asChild>{outcome}</TooltipTrigger>
            <TooltipContent className="max-w-sm">{outcomeDescription(record)}</TooltipContent>
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
  );
};
