import { Rocket } from "lucide-react";

import { IconButton } from "@app/components/v3";
import {
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
  onLaunch: () => void;
  onOpenTab: (tab: PamSheetTab) => void;
  onDelete: () => void;
};

export const AccountRowActions = ({
  accountId,
  accountType,
  isAccessible,
  onLaunch,
  onOpenTab,
  onDelete
}: Props) => {
  const { can } = usePamAccountActions(accountId, true);
  const canLaunch = can(PamResourcePermissionActions.LaunchSessions);

  // Launch requires both: account is provisioned AND user has permission
  const isLaunchDisabled = !isAccessible || !canLaunch;

  return (
    <div className="flex items-center gap-0.5">
      <IconButton
        variant="ghost"
        size="xs"
        aria-label="Launch session"
        className="text-muted hover:text-foreground"
        isDisabled={isLaunchDisabled}
        onClick={onLaunch}
      >
        <Rocket className="size-4" />
      </IconButton>
      <AccountActionsMenu
        accountId={accountId}
        accountType={accountType}
        isAccessible={isAccessible}
        onLaunch={onLaunch}
        onOpenTab={onOpenTab}
        onDelete={onDelete}
      />
    </div>
  );
};
