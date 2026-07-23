import {
  PamAccountAccessibilityIssue,
  PamResourcePermissionActions,
  usePamAccountActions
} from "@app/hooks/api/pam";

import { AccountAccessibilityBadge } from "../../components/AccountAccessibilityBadge";

type Props = {
  accountId: string;
  issues: PamAccountAccessibilityIssue[];
};

export const AccountAccessibilityBadgeWithPermission = ({ accountId, issues }: Props) => {
  const { can } = usePamAccountActions(accountId, true);
  const canEdit = can(PamResourcePermissionActions.EditAccounts);

  // Only show accessibility issues to users who can manage the account
  if (!canEdit) return null;

  return <AccountAccessibilityBadge issues={issues} />;
};
