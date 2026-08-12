import {
  Badge,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Table,
  TableBody,
  TableCell,
  TableRow
} from "@app/components/v3";
import { TPolicyRule } from "@app/hooks/api/agentPolicies";

// Rules are unordered, so the count is the only thing worth showing in a cell; the hover card carries
// the detail rather than making the table unreadably wide.
export const PolicyRulesHoverCard = ({ rules }: { rules: TPolicyRule[] }) => {
  if (!rules.length) return <span className="text-muted">—</span>;

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Badge variant="neutral">
          {rules.length} {rules.length === 1 ? "rule" : "rules"}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent className="w-96">
        <Table>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell className="font-mono text-xs break-all">{rule.hostPattern}</TableCell>
                <TableCell className="w-28 text-right">
                  <Badge variant="neutral">
                    {rule.methods.length ? rule.methods.join(", ") : "Any"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </HoverCardContent>
    </HoverCard>
  );
};
