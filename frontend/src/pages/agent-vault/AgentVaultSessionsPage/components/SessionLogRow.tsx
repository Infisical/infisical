import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  ArrowRightIcon,
  CircleHelpIcon,
  CircleXIcon,
  KeyRoundIcon,
  type LucideIcon,
  PlusIcon,
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
import { AgentVaultSessionLogDecision } from "@app/hooks/api/agentVault";
import { TAgentVaultSessionLogRecord } from "@app/hooks/api/agentVault/types";

import { httpStatusLabel } from "./SessionLogsPanel.utils";

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
    icon: KeyRoundIcon,
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

// Agent Vault answers Blocked and Error requests itself, so their status is its own reply, not the
// upstream's.
const isProxyAnswered = (decision: AgentVaultSessionLogDecision) =>
  decision === AgentVaultSessionLogDecision.Blocked ||
  decision === AgentVaultSessionLogDecision.Error;

const proxyAnswerDescription = (record: TAgentVaultSessionLogRecord) => {
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
  const outcome = (
    <Badge variant={presentation.variant}>
      <presentation.icon />
      {presentation.label}
    </Badge>
  );
  const host = (
    <span className="flex w-fit max-w-full items-center gap-2 text-sm">
      <ServiceIcon hostPattern={record.host} />
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
            <span className="font-mono text-xs whitespace-nowrap">
              {format(new Date(record.ts), "MMM d, yyyy HH:mm:ss")}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {format(new Date(record.ts), "MMM d, yyyy HH:mm:ss.SSS (zzz)")}
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
        <span className="block truncate" title={record.path}>
          {record.path}
        </span>
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
        {proxyAnswered && record.status ? (
          <Tooltip>
            <TooltipTrigger asChild>{outcome}</TooltipTrigger>
            <TooltipContent className="max-w-sm">{proxyAnswerDescription(record)}</TooltipContent>
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
