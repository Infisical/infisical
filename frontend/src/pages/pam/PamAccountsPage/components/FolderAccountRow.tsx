import {
  PamAccessStatus,
  PamAccountType,
  PamResourcePermissionActions,
  TAccessiblePamAccount,
  TAdminAccountListItem,
  usePamAccountActions
} from "@app/hooks/api/pam";
import { PamSheetTab } from "@app/hooks/usePamSheetState";

import { PamAccountRow } from "../../PamAccessPage/components/PamAccountRow";
import { AccountAccessibilityBadgeWithPermission } from "./AccountAccessibilityBadgeWithPermission";
import { AccountActionsMenu } from "./AccountActionsMenu";

type Props = {
  account: TAdminAccountListItem;
  search: string;
  onOpenAccount: (accountId: string, tab?: PamSheetTab) => void;
  onLaunchAccount: (account: TAccessiblePamAccount) => void;
  onRequestAccess: (account: TAccessiblePamAccount) => void;
  onDeleteAccount: (accountId: string, accountName: string, accountType: PamAccountType) => void;
};

export const FolderAccountRow = ({
  account,
  search,
  onOpenAccount,
  onLaunchAccount,
  onRequestAccess,
  onDeleteAccount
}: Props) => {
  const { can } = usePamAccountActions(account.id, true);
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
      indented
      accessibilityBadge={
        <AccountAccessibilityBadgeWithPermission
          accountId={account.id}
          issues={account.accessibilityIssues}
        />
      }
      actions={
        <AccountActionsMenu
          accountId={account.id}
          accountType={accountType}
          isAccessible={account.isAccessible}
          requiresApproval={requiresApproval}
          accessStatus={accessStatus}
          onLaunch={() => onLaunchAccount(launchableAccount)}
          onRequestAccess={() => onRequestAccess(launchableAccount)}
          onOpenTab={(tab) => onOpenAccount(account.id, tab)}
          onDelete={() => onDeleteAccount(account.id, account.name, accountType)}
        />
      }
    />
  );
};
