import { CheckIcon, ListChecksIcon } from "lucide-react";

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
import { PolicyRuleMethod, TPolicyRule } from "@app/hooks/api/agentPolicies";

const METHODS = Object.values(PolicyRuleMethod);

// Rules are unordered, so the count is the only thing worth showing in a cell; the hover card carries
// the detail rather than making the table unreadably wide.
export const PolicyRulesHoverCard = ({ rules }: { rules: TPolicyRule[] }) => {
  if (!rules.length) return <span className="text-muted">—</span>;

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Badge variant="neutral">
          <ListChecksIcon />
          {rules.length} {rules.length === 1 ? "rule" : "rules"}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent collisionPadding={16} className="w-fit max-w-[calc(100vw-2rem)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="border-r">Host</TableHead>
              {METHODS.map((method) => (
                <TableHead key={method} className="w-16 border-r px-2 text-center last:border-r-0">
                  {method}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="max-w-56 border-r font-mono text-xs break-all whitespace-normal">
                  {rule.hostPattern}
                </TableCell>
                {METHODS.map((method) => {
                  // An empty method list means the rule matches every method.
                  const isAllowed = !rule.methods.length || rule.methods.includes(method);

                  return (
                    <TableCell key={method} className="border-r px-2 text-center last:border-r-0">
                      {isAllowed ? (
                        <CheckIcon className="inline-block text-success" />
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </HoverCardContent>
    </HoverCard>
  );
};
