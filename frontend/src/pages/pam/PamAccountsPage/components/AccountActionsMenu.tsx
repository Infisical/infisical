import { KeyRound, MoreHorizontal, Rocket, Trash2 } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  isRotatablePamAccountType,
  PamAccessStatus,
  PamAccountType,
  PamResourcePermissionActions,
  usePamAccountActions
} from "@app/hooks/api/pam";
import { PamSheetTab } from "@app/hooks/usePamSheetState";

import { PAM_ACCOUNT_TABS } from "../../components/pamResourceTabs";

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

export const AccountActionsMenu = ({
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
  const { can, isLoading } = usePamAccountActions(accountId, true);

  const canLaunch = can(PamResourcePermissionActions.LaunchSessions);
  const canDelete = can(PamResourcePermissionActions.DeleteAccounts);
  const isRotatable = isRotatablePamAccountType(accountType);

  const isGranted = accessStatus === PamAccessStatus.Granted;
  const isPending = accessStatus === PamAccessStatus.Pending;
  const needsApproval = requiresApproval && !isGranted && canLaunch;

  // Launch requires: account is provisioned AND user has permission AND (no approval needed OR already granted)
  const canLaunchNow = isAccessible && canLaunch && (!requiresApproval || isGranted);

  let launchDisabledReason = "";
  if (!canLaunch) {
    launchDisabledReason = "You don't have permission to launch sessions";
  } else if (!isAccessible) {
    launchDisabledReason = "This account is not ready to launch";
  } else {
    launchDisabledReason = "Approval required";
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          variant="ghost"
          size="xs"
          aria-label="Account actions"
          className="text-muted hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {isLoading && <DropdownMenuItem isDisabled>Loading&hellip;</DropdownMenuItem>}
        {!isLoading && (
          <>
            {needsApproval ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <DropdownMenuItem isDisabled={isPending} onClick={onRequestAccess}>
                      <KeyRound className="size-4" />
                      {isPending ? "Request Pending" : "Request Access"}
                    </DropdownMenuItem>
                  </div>
                </TooltipTrigger>
                {isPending && (
                  <TooltipContent side="left">Your request is awaiting approval</TooltipContent>
                )}
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <DropdownMenuItem isDisabled={!canLaunchNow} onClick={onLaunch}>
                      <Rocket className="size-4" />
                      Launch Session
                    </DropdownMenuItem>
                  </div>
                </TooltipTrigger>
                {!canLaunchNow && (
                  <TooltipContent side="left">{launchDisabledReason}</TooltipContent>
                )}
              </Tooltip>
            )}
            <DropdownMenuSeparator />
            {PAM_ACCOUNT_TABS.filter(
              (tab) => tab.value !== PamSheetTab.Rotation || isRotatable
            ).map((tab) => {
              const hasPermission = !tab.action || can(tab.action);
              return (
                <Tooltip key={tab.value}>
                  <TooltipTrigger asChild>
                    <div>
                      <DropdownMenuItem
                        isDisabled={!hasPermission}
                        onClick={() => onOpenTab(tab.value)}
                      >
                        <tab.icon className="size-4" />
                        {tab.label}
                      </DropdownMenuItem>
                    </div>
                  </TooltipTrigger>
                  {!hasPermission && (
                    <TooltipContent side="left">
                      You don&apos;t have permission to access {tab.label.toLowerCase()}
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
            <DropdownMenuSeparator />
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <DropdownMenuItem variant="danger" isDisabled={!canDelete} onClick={onDelete}>
                    <Trash2 className="size-4" />
                    Delete Account
                  </DropdownMenuItem>
                </div>
              </TooltipTrigger>
              {!canDelete && (
                <TooltipContent side="left">
                  You don&apos;t have permission to delete this account
                </TooltipContent>
              )}
            </Tooltip>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
