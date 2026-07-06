import { AlertTriangle } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { PamAccountAccessibilityIssue } from "@app/hooks/api/pam";

const ISSUE_LABELS: Record<PamAccountAccessibilityIssue, string> = {
  [PamAccountAccessibilityIssue.NoGateway]: "No gateway is configured",
  [PamAccountAccessibilityIssue.NoRecordingConfig]: "No recording bucket is configured",
  [PamAccountAccessibilityIssue.NoCredential]: "No password is set",
  [PamAccountAccessibilityIssue.NoApprovalConfig]:
    "This account requires approval, but its folder has no approvers yet. Ask a folder admin to add approvers under the folder's Approvals tab."
};

type Props = {
  issues: PamAccountAccessibilityIssue[];
};

// Inline the label into the sentence: lowercase the lead-in and avoid doubling the final period
const formatSingleIssue = (label: string) => {
  const trimmed = label.endsWith(".") ? label.slice(0, -1) : label;
  return `${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}.`;
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
          <p>This account can&apos;t be used yet: {formatSingleIssue(ISSUE_LABELS[issues[0]])}</p>
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
