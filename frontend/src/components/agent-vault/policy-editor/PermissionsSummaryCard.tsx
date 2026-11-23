import { ReactNode } from "react";
import { TriangleAlertIcon } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@app/components/v3";

import {
  getRowRisk,
  getRowSummary,
  PERMISSION_ROWS,
  TAgentVaultPolicy,
  TPolicyKind
} from "./agentVaultPolicyModel";
import { PrivilegedMarker } from "./PrivilegedMarker";
import { useAgentVaultPolicyCatalog } from "./useAgentVaultPolicyCatalog";

const SummaryLine = ({
  label,
  risk,
  badge,
  children
}: {
  label: string;
  risk?: string;
  badge?: ReactNode;
  children?: ReactNode;
}) => (
  <div className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1.5 text-sm">
        <span className="truncate">{label}</span>
        {risk && <PrivilegedMarker risk={risk} />}
      </span>
      {badge}
    </div>
    {children}
  </div>
);

type Props = {
  projectId: string;
  noun: TPolicyKind;
  policy: TAgentVaultPolicy;
  unsupportedCount?: number;
  /** A built-in role never changes, so an empty one is final rather than unfinished. */
  isBuiltIn?: boolean;
  footer?: ReactNode;
};

export const PermissionsSummaryCard = ({
  projectId,
  noun,
  policy,
  unsupportedCount = 0,
  isBuiltIn = false,
  footer
}: Props) => {
  const { nameOf } = useAgentVaultPolicyCatalog(projectId);
  // What the rules give comes first; the rows they leave at None stay folded away.
  const summaries = PERMISSION_ROWS.map((row) => ({
    row,
    ...getRowSummary(policy, row.key, nameOf)
  }));
  const granted = summaries.filter(({ access }) => access !== "none");
  const notGranted = summaries.filter(({ access }) => access === "none");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary</CardTitle>
        <CardDescription>
          {noun === "role"
            ? "Everything this role grants. Its holders also get what their other roles grant."
            : "What this policy adds on top of their roles."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y divide-border">
        {granted.length === 0 && unsupportedCount === 0 && (
          <p className="pb-2.5 text-sm text-muted">
            {noun === "policy" && "This policy adds nothing yet."}
            {noun === "role" &&
              (isBuiltIn ? "This role grants nothing." : "This role grants nothing yet.")}
          </p>
        )}
        {granted.map(({ row, details }) => (
          <SummaryLine key={row.key} label={row.label} risk={getRowRisk(policy, row.key)}>
            {details.length > 0 && (
              <div className="flex flex-col gap-0.5 text-xs text-muted">
                {details.map((detail) => (
                  <p key={detail} className="break-words">
                    {detail}
                  </p>
                ))}
              </div>
            )}
          </SummaryLine>
        ))}
        {unsupportedCount > 0 && (
          <SummaryLine
            label="Other Permissions"
            badge={
              <Badge variant="warning">
                <TriangleAlertIcon />
                JSON Only
              </Badge>
            }
          >
            <p className="text-xs text-muted">
              {unsupportedCount === 1
                ? "1 rule only the JSON tab can show"
                : `${unsupportedCount} rules only the JSON tab can show`}
            </p>
          </SummaryLine>
        )}
        {notGranted.length > 0 && (
          <Accordion type="single" collapsible variant="ghost">
            <AccordionItem value="not-granted">
              <AccordionTrigger>No Access ({notGranted.length})</AccordionTrigger>
              <AccordionContent>
                <ul className="flex flex-col gap-1 pl-6 text-xs text-muted">
                  {notGranted.map(({ row }) => (
                    <li key={row.key}>{row.label}</li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </CardContent>
      {footer && <CardContent className="-mt-2 text-xs text-muted">{footer}</CardContent>}
    </Card>
  );
};
