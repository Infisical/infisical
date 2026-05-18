import {
  Badge,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  TableCell,
  TableRow
} from "@app/components/v3";

import { ActionAudit } from "./permission-audit.types";
import { SourcePill } from "./SourcePill";
import { StatePill } from "./StatePill";

type Props = {
  audit: ActionAudit;
};

export const PermissionAuditRow = ({ audit }: Props) => {
  const [primarySource, ...extraSources] = audit.grantedBy;

  return (
    <TableRow className="h-12">
      <TableCell className="w-full max-w-0">
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-xs text-foreground">{audit.label}</span>
          {audit.description ? (
            <span className="truncate text-xs text-accent">{audit.description}</span>
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        <StatePill state={audit.state} conditions={audit.conditions} />
      </TableCell>
      <TableCell>
        {!primarySource ? (
          <span className="text-muted">—</span>
        ) : (
          <div className="flex items-center gap-1">
            <SourcePill source={primarySource} />
            {extraSources.length > 0 ? (
              <HoverCard openDelay={150}>
                <HoverCardTrigger asChild>
                  <button
                    type="button"
                    aria-label="View additional sources"
                    className="cursor-pointer"
                  >
                    <Badge variant="neutral">+{extraSources.length}</Badge>
                  </button>
                </HoverCardTrigger>
                <HoverCardContent align="end" className="w-auto min-w-56 p-2">
                  <div className="mb-2 text-xs font-semibold text-mineshaft-100">
                    Also granted by
                  </div>
                  <div className="flex flex-col items-start gap-1">
                    {extraSources.map((source) => (
                      <SourcePill key={source.id} source={source} />
                    ))}
                  </div>
                </HoverCardContent>
              </HoverCard>
            ) : null}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
};
