import { AlertTriangle } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { PamAccountAccessibilityIssue } from "@app/hooks/api/pam";

const ISSUE_LABELS: Record<PamAccountAccessibilityIssue, string> = {
  [PamAccountAccessibilityIssue.NoGateway]: "No gateway is configured",
  [PamAccountAccessibilityIssue.NoRecordingConfig]: "No recording bucket is configured",
  [PamAccountAccessibilityIssue.NoCredential]: "No password is set",
  [PamAccountAccessibilityIssue.NoApprovalConfig]: "No approval policy is configured for this folder"
};

type Props = {
  issues: PamAccountAccessibilityIssue[];
};

export const AccountAccessibilityBadge = ({ issues }: Props) => {
  if (!issues.length) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="warning">
          <AlertTriangle className="size-3" />
          Unavailable
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {issues.length === 1 ? (
          <p>
            This account can&apos;t be used yet:{" "}
            {ISSUE_LABELS[issues[0]].charAt(0).toLowerCase() + ISSUE_LABELS[issues[0]].slice(1)}.
          </p>
        ) : (
          <>
            <p className="mb-1 font-medium">This account can&apos;t be used yet</p>
            <ul className="list-inside list-disc">
              {issues.map((issue) => (
                <li key={issue}>{ISSUE_LABELS[issue]}</li>
              ))}
            </ul>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
};
