import { PamAccountAccessibilityIssue } from "@app/hooks/api/pam";

import { AccountAccessibilityBadge } from "../../components/AccountAccessibilityBadge";

type Props = {
  canEdit: boolean;
  issues: PamAccountAccessibilityIssue[];
};

export const AccountAccessibilityBadgeWithPermission = ({ canEdit, issues }: Props) => {
  // Only show accessibility issues to users who can manage the account
  if (!canEdit) return null;

  return <AccountAccessibilityBadge issues={issues} />;
};
