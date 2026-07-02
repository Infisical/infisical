import { Rocket } from "lucide-react";

import { HighlightText } from "@app/components/v2/HighlightText";
import {
  Badge,
  Button,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { PamAccountType, TAccessiblePamAccount, usePamAccountTypeMap } from "@app/hooks/api/pam";

import { AccountPlatformIcon } from "./AccountPlatformIcon";

type Props = {
  account: TAccessiblePamAccount;
  search: string;
  onLaunch: (account: TAccessiblePamAccount) => void;
  indented?: boolean;
};

export const AccountRow = ({ account, search, onLaunch, indented }: Props) => {
  const { map } = usePamAccountTypeMap();
  const typeName = map[account.accountType as PamAccountType]?.name ?? account.accountType;
  const { canLaunch } = account;

  return (
    <TableRow
      className={canLaunch ? "cursor-pointer" : ""}
      onClick={canLaunch ? () => onLaunch(account) : undefined}
    >
      <TableCell>
        <div className={`flex items-center gap-2.5 ${indented ? "pl-[26px]" : ""}`}>
          <AccountPlatformIcon accountType={account.accountType} size={20} />
          <span className="font-medium text-foreground">
            <HighlightText text={account.name} highlight={search} />
          </span>
          <Badge variant="neutral">{typeName}</Badge>
        </div>
      </TableCell>
      <TableCell className="w-20">
        <div className="flex items-center justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Button
                  variant="pam"
                  size="xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onLaunch(account);
                  }}
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
      </TableCell>
    </TableRow>
  );
};
