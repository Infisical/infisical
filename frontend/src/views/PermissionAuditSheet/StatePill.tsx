import { BanIcon, CheckIcon, SplitIcon } from "lucide-react";

import {
  Badge,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";

import { AuditCondition, AuditState } from "./permission-audit.types";
import { formatConditionEntries } from "./permission-audit.utils";

type Props = {
  state: AuditState;
  conditions?: AuditCondition[];
  // When true, the forbid state was produced by an explicit inverted rule (red).
  // When false, forbid means no rule grants the action (muted N/A).
  isForbidden?: boolean;
};

const STATE_LABEL: Record<AuditState, string> = {
  allow: "Allowed",
  conditional: "Conditional",
  forbid: "Forbidden"
};

export const StatePill = ({ state, conditions, isForbidden }: Props) => {
  if (state === "allow") {
    return <CheckIcon className="size-4 text-success" aria-label={STATE_LABEL[state]} />;
  }
  if (state === "conditional") {
    const entries = conditions?.flatMap((c) => formatConditionEntries(c)) ?? [];
    if (entries.length === 0) {
      return <SplitIcon className="size-4 text-warning" aria-label={STATE_LABEL[state]} />;
    }
    return (
      <HoverCard openDelay={150}>
        <HoverCardTrigger asChild>
          <button type="button" aria-label="View conditions" className="cursor-pointer">
            <SplitIcon className="size-4 text-warning" />
          </button>
        </HoverCardTrigger>
        <HoverCardContent align="end" className="w-auto max-w-2xl min-w-72">
          <div className="mb-2 border-b border-border py-2 text-xs font-semibold text-mineshaft-100">
            Conditions
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Effect</TableHead>
                <TableHead className="w-32">Field</TableHead>
                <TableHead className="w-20">Operator</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={`${entry.kind}-${entry.field}-${entry.operator}-${entry.value}`}>
                  <TableCell>
                    <Badge variant={entry.kind === "allow" ? "success" : "danger"}>
                      {entry.kind === "allow" ? <CheckIcon /> : <BanIcon />}
                      <span>{entry.kind === "allow" ? "Allow" : "Forbid"}</span>
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{entry.field}</TableCell>
                  <TableCell className="font-mono text-xs text-mineshaft-300">
                    {entry.operator}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{entry.value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </HoverCardContent>
      </HoverCard>
    );
  }
  if (isForbidden) {
    return <BanIcon className="size-4 text-danger" aria-label={STATE_LABEL[state]} />;
  }
  return (
    <span className="text-xs text-muted" aria-label="No access">
      —
    </span>
  );
};
