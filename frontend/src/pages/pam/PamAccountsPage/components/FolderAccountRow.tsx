import {
  PamAccessStatus,
  PamAccountAccessibilityIssue,
  PamAccountType,
  PamResourcePermissionActions,
  TAccessiblePamAccount,
  TPamAccountListItem,
  usePamAccountActionsFromPermissions
} from "@app/hooks/api/pam";
import { PamSheetTab } from "@app/hooks/usePamSheetState";

import { AccountStaleBadge } from "../../components/AccountStaleBadge";
import { PamAccountRow } from "../../components/PamAccountRow";
import { AccountAccessibilityBadgeWithPermission } from "./AccountAccessibilityBadgeWithPermission";
import { AccountActionsMenu } from "./AccountActionsMenu";

type Props = {
  account: TPamAccountListItem;
  search: string;
  onOpenAccount: (accountId: string, tab?: PamSheetTab) => void;
  onLaunchAccount: (account: TAccessiblePamAccount) => void;
  onRequestAccess: (account: TAccessiblePamAccount) => void;
  onViewCredentials: (account: TAccessiblePamAccount) => void;
  onRequestCredentialAccess: (account: TAccessiblePamAccount) => void;
  onDeleteAccount: (accountId: string, accountName: string, accountType: PamAccountType) => void;
  indented?: boolean;
};

export const FolderAccountRow = ({
  account,
  search,
  onOpenAccount,
  onLaunchAccount,
  onRequestAccess,
  onViewCredentials,
  onRequestCredentialAccess,
  onDeleteAccount,
  indented
}: Props) => {
  // Permissions come embedded in the list item, so no per-account request is made here.
  const { can } = usePamAccountActionsFromPermissions(account.permissions);
  const canLaunch = can(PamResourcePermissionActions.LaunchSessions);

  const accountType = account.accountType as PamAccountType;
  const { requiresApproval, accessStatus } = account;
  const isGranted = accessStatus === PamAccessStatus.Granted;

  const needsApproval = requiresApproval && !isGranted && canLaunch && account.isAccessible;
  const canLaunchNow = account.isAccessible && canLaunch && (!requiresApproval || isGranted);
  const launchDisabledReason = canLaunch
    ? "This account is not ready to launch"
    : "You don't have permission to launch sessions";

  const launchableAccount: TAccessiblePamAccount = {
    id: account.id,
    name: account.name,
    description: account.description,
    folderId: account.folderId,
    folderName: account.folderName ?? "",
    templateId: account.templateId,
    templateName: account.templateName,
    accountType,
    canLaunch: canLaunchNow,
    requiresApproval,
    requireReason: account.requireReason,
    accessStatus,
    grantExpiresAt: account.grantExpiresAt,
    pendingRequestId: account.pendingRequestId,
    canBreakGlass: account.canBreakGlass,
    credentialAccessStatus: account.credentialAccessStatus,
    credentialPendingRequestId: account.credentialPendingRequestId,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  };

  return (
    <PamAccountRow
      name={account.name}
      accountType={accountType}
      search={search}
      accessStatus={accessStatus}
      grantExpiresAt={account.grantExpiresAt}
      needsApproval={needsApproval}
      canLaunchNow={canLaunchNow}
      launchDisabledReason={launchDisabledReason}
      onLaunch={() => onLaunchAccount(launchableAccount)}
      onRequestAccess={() => onRequestAccess(launchableAccount)}
      indented={indented}
      accessibilityBadge={
        <>
          <AccountAccessibilityBadgeWithPermission
            canEdit={can(PamResourcePermissionActions.EditAccounts)}
            issues={account.accessibilityIssues}
          />
          <AccountStaleBadge isStale={account.isStale} />
        </>
      }
      actions={
        <AccountActionsMenu
          can={can}
          accountType={accountType}
          isAccessible={account.isAccessible}
          requiresApproval={requiresApproval}
          hasApprovalConfig={
            !account.accessibilityIssues.includes(PamAccountAccessibilityIssue.NoApprovalConfig)
          }
          accessStatus={accessStatus}
          supportsCredentialReveal={account.supportsCredentialReveal}
          credentialAccessStatus={account.credentialAccessStatus}
          onLaunch={() => onLaunchAccount(launchableAccount)}
          onRequestAccess={() => onRequestAccess(launchableAccount)}
          onViewCredentials={() => onViewCredentials(launchableAccount)}
          onRequestCredentialAccess={() => onRequestCredentialAccess(launchableAccount)}
          onOpenTab={(tab) => onOpenAccount(account.id, tab)}
          onDelete={() => onDeleteAccount(account.id, account.name, accountType)}
        />
      }
    />
  );
};
