import { KeyRound, Rocket } from "lucide-react";

import { IconButton } from "@app/components/v3";
import {
  PamAccessStatus,
  PamAccountType,
  PamResourcePermissionActions,
  usePamAccountActions
} from "@app/hooks/api/pam";
import { PamSheetTab } from "@app/hooks/usePamSheetState";

import { AccountActionsMenu } from "./AccountActionsMenu";

type Props = {
  accountId: string;
  accountType: PamAccountType;
  isAccessible: boolean;
  requiresApproval: boolean;
  accessStatus: PamAccessStatus;
  onLaunch: () => void;
  onRequestAccess: () => void;
  onOpenTab: (tab: PamSheetTab) => void;
  onDelete: () => void;
};

export const AccountRowActions = ({
  accountId,
  accountType,
  isAccessible,
  requiresApproval,
  accessStatus,
  onLaunch,
  onRequestAccess,
  onOpenTab,
  onDelete
}: Props) => {
  const { can } = usePamAccountActions(accountId, true);
  const canLaunch = can(PamResourcePermissionActions.LaunchSessions);

  const isGranted = accessStatus === PamAccessStatus.Granted;
  const isPending = accessStatus === PamAccessStatus.Pending;
  const needsApproval = requiresApproval && !isGranted && canLaunch;

  // Launch requires: account is provisioned AND user has permission AND (no approval needed OR already granted)
  const canLaunchNow = isAccessible && canLaunch && (!requiresApproval || isGranted);

  if (needsApproval) {
    return (
      <div className="flex items-center gap-0.5">
        <IconButton
          variant="ghost"
          size="xs"
          aria-label={isPending ? "Request pending" : "Request access"}
          className="text-muted hover:text-foreground"
          isDisabled={isPending}
          onClick={onRequestAccess}
        >
          <KeyRound className="size-4" />
        </IconButton>
        <AccountActionsMenu
          accountId={accountId}
          accountType={accountType}
          isAccessible={isAccessible}
          requiresApproval={requiresApproval}
          accessStatus={accessStatus}
          onLaunch={onLaunch}
          onRequestAccess={onRequestAccess}
          onOpenTab={onOpenTab}
          onDelete={onDelete}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      <IconButton
        variant="ghost"
        size="xs"
        aria-label="Launch session"
        className="text-muted hover:text-foreground"
        isDisabled={!canLaunchNow}
        onClick={onLaunch}
      >
        <Rocket className="size-4" />
      </IconButton>
      <AccountActionsMenu
        accountId={accountId}
        accountType={accountType}
        isAccessible={isAccessible}
        requiresApproval={requiresApproval}
        accessStatus={accessStatus}
        onLaunch={onLaunch}
        onRequestAccess={onRequestAccess}
        onOpenTab={onOpenTab}
        onDelete={onDelete}
      />
    </div>
  );
};
