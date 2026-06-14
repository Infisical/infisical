import { Rocket } from "lucide-react";

import { Button } from "@app/components/v3";
import { TAccessiblePamAccount } from "@app/hooks/api/pam";

import { AccountPlatformIcon } from "./AccountPlatformIcon";

type Props = {
  account: TAccessiblePamAccount;
  onLaunch: (account: TAccessiblePamAccount) => void;
};

export const AccountRow = ({ account, onLaunch }: Props) => {
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-2 last:border-b-0 hover:bg-container-hover">
      <AccountPlatformIcon accountType={account.accountType} size={24} />
      <span className="flex-1 truncate text-sm text-foreground">{account.name}</span>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="pam" size="xs" onClick={() => onLaunch(account)}>
          <Rocket className="size-3" />
          Launch
        </Button>
      </div>
    </div>
  );
};
