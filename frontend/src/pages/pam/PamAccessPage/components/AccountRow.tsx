import { Clock, LockKeyhole, Rocket } from "lucide-react";

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
import {
  PamAccessStatus,
  PamAccountType,
  TAccessiblePamAccount,
  usePamAccountTypeMap
} from "@app/hooks/api/pam";

import { AccountPlatformIcon } from "./AccountPlatformIcon";

// Compact remaining time for the grant-expiry badge, e.g. "3h 41m"
const formatRemaining = (expiresAt: string) => {
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  if (remainingMs <= 0) return "Expired";
  const totalMinutes = Math.floor(remainingMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

type Props = {
  account: TAccessiblePamAccount;
  search: string;
  onLaunch: (account: TAccessiblePamAccount) => void;
  onRequestAccess: (account: TAccessiblePamAccount) => void;
  indented?: boolean;
};

export const AccountRow = ({ account, search, onLaunch, onRequestAccess, indented }: Props) => {
  const { map } = usePamAccountTypeMap();
  const typeName = map[account.accountType as PamAccountType]?.name ?? account.accountType;
  const { canLaunch, requiresApproval, accessStatus, grantExpiresAt, disabledReason } = account;

  const isDisabled = !!disabledReason;
  const isGranted = accessStatus === PamAccessStatus.Granted;
  // Approval is a layer on top of standing access: only users who could launch the account may
  // request a grant, and launching a gated account requires both the permission and the grant.
  const needsApproval = requiresApproval && !isGranted && !isDisabled && canLaunch;
  const isPending = accessStatus === PamAccessStatus.Pending;
  const canLaunchNow = canLaunch && (!requiresApproval || isGranted);
  // Row click mirrors the action button: launch when possible, otherwise open the request sheet
  const rowAction = (() => {
    if (isDisabled) return undefined;
    if (needsApproval) return () => onRequestAccess(account);
    if (canLaunchNow) return () => onLaunch(account);
    return undefined;
  })();

  const renderAction = () => {
    if (isDisabled) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Button variant="neutral" size="xs" isDisabled>
                <Rocket className="size-3" />
                Launch
              </Button>
            </div>
          </TooltipTrigger>
          <TooltipContent>{disabledReason}</TooltipContent>
        </Tooltip>
      );
    }

    if (needsApproval) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Button
                variant="neutral"
                size="xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestAccess(account);
                }}
              >
                {isPending ? (
                  <>
                    <Clock className="size-3" />
                    Pending Approval
                  </>
                ) : (
                  <>
                    <LockKeyhole className="size-3" />
                    Request Access
                  </>
                )}
              </Button>
            </div>
          </TooltipTrigger>
          {isPending && (
            <TooltipContent>
              Your access request is awaiting approval. Click for details.
            </TooltipContent>
          )}
        </Tooltip>
      );
    }

    return (
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
              isDisabled={!canLaunchNow}
            >
              <Rocket className="size-3" />
              Launch
            </Button>
          </div>
        </TooltipTrigger>
        {!canLaunchNow && (
          <TooltipContent>
            You don&apos;t have permission to launch sessions for this account
          </TooltipContent>
        )}
      </Tooltip>
    );
  };

  return (
    <TableRow className={rowAction ? "cursor-pointer" : ""} onClick={rowAction}>
      <TableCell>
        <div className={`flex items-center gap-2.5 ${indented ? "pl-[26px]" : ""}`}>
          <AccountPlatformIcon accountType={account.accountType} size={20} />
          <span className="font-medium text-foreground">
            <HighlightText text={account.name} highlight={search} />
          </span>
          <Badge variant="neutral">{typeName}</Badge>
        </div>
      </TableCell>
      <TableCell className="w-32">
        <div className="flex items-center justify-end gap-2.5">
          {isGranted && grantExpiresAt && (
            <Badge variant="success">
              <Clock className="mr-1 size-3" />
              Expires in {formatRemaining(grantExpiresAt)}
            </Badge>
          )}
          {renderAction()}
        </div>
      </TableCell>
    </TableRow>
  );
};
