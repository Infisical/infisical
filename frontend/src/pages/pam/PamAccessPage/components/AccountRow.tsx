import { Rocket } from "lucide-react";

import { Badge, Button, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import {
  PAM_ACCOUNT_TYPE_MAP,
  PamResourcePermissionActions,
  PamResourcePermissionSub,
  TAccessiblePamAccount
} from "@app/hooks/api/pam";
import { usePamAccountPermission } from "@app/hooks/api/pam/queries";

import { AccountPlatformIcon } from "./AccountPlatformIcon";

type Props = {
  account: TAccessiblePamAccount;
  onLaunch: (account: TAccessiblePamAccount) => void;
};

export const AccountRow = ({ account, onLaunch }: Props) => {
  const typeName = PAM_ACCOUNT_TYPE_MAP[account.accountType]?.name ?? account.accountType;

  const { data: accountPermission } = usePamAccountPermission(account.id);
  const canLaunch = accountPermission?.permission.can(
    PamResourcePermissionActions.LaunchSessions,
    PamResourcePermissionSub.PamResource
  );

  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-2 last:border-b-0">
      <AccountPlatformIcon accountType={account.accountType} size={24} />
      <span className="truncate text-sm text-foreground">{account.name}</span>
      <Badge variant="info">{typeName}</Badge>
      <span className="flex-1" />
      <div className="flex shrink-0 items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Button
                variant="pam"
                size="xs"
                onClick={() => onLaunch(account)}
                isDisabled={!canLaunch}
              >
                <Rocket className="size-3" />
                Launch
              </Button>
            </div>
          </TooltipTrigger>
          {!canLaunch && (
            <TooltipContent>
              You don&apos;t have permission to launch sessions for this account
            </TooltipContent>
          )}
        </Tooltip>
      </div>
    </div>
  );
};
