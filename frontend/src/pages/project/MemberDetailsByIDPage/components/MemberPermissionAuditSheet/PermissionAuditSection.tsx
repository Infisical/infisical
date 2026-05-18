import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";

import { ActionAudit, AuditState, ResourceAudit } from "./permission-audit.types";
import { PermissionAuditRow } from "./PermissionAuditRow";

type Props = {
  resource: ResourceAudit;
  stateFilter: AuditState | "all";
  search: string;
};

const matchesSearch = (action: ActionAudit, term: string): boolean => {
  if (!term) return true;
  const needle = term.toLowerCase();
  const haystack = [action.label, action.description ?? "", ...action.grantedBy.map((s) => s.name)]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
};

export const PermissionAuditSection = ({ resource, stateFilter, search }: Props) => {
  const visibleActions = resource.actions.filter(
    (a) => matchesSearch(a, search) && (stateFilter === "all" || a.state === stateFilter)
  );

  const grantedCount = resource.allowedCount + resource.conditionalCount;

  return (
    <AccordionItem value={resource.subject}>
      <AccordionTrigger>
        <div className="flex flex-1 items-center gap-3 text-left">
          <span className="min-w-0 grow text-sm select-none">{resource.label}</span>
          {grantedCount > 0 ? (
            <Badge variant="neutral" className="mr-2 shrink-0">
              {grantedCount}/{resource.totalCount}
            </Badge>
          ) : (
            <span className="mr-2 shrink-0 text-xs text-muted">No Access</span>
          )}
        </div>
      </AccordionTrigger>
      <AccordionContent className="bg-card">
        {visibleActions.length === 0 ? (
          <div className="px-4 py-3 text-xs text-mineshaft-400">
            No actions match the current filter.
          </div>
        ) : (
          <Table containerClassName="rounded-none! bg-card border-t! border-border border-0">
            <TableHeader>
              <TableRow>
                <TableHead className="w-1/3">Action</TableHead>
                <TableHead className="w-40">Access</TableHead>
                <TableHead>Granted by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleActions.map((audit) => (
                <PermissionAuditRow key={audit.action} audit={audit} />
              ))}
              {visibleActions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-xs text-muted">
                    —
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        )}
      </AccordionContent>
    </AccordionItem>
  );
};
