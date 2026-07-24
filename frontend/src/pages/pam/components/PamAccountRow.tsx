import { ReactNode, useSyncExternalStore } from "react";
import { Clock, KeyRound, Rocket } from "lucide-react";

import { HighlightText } from "@app/components/v2/HighlightText";
import {
  Badge,
  IconButton,
  TableCell,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { PamAccessStatus, PamAccountType, usePamAccountTypeMap } from "@app/hooks/api/pam";

import { AccountPlatformIcon } from "./AccountPlatformIcon";

// One shared 30s ticker for every row's countdown; the interval only runs while rows are mounted
const tickListeners = new Set<() => void>();
let tickNow = Date.now();
let tickTimer: ReturnType<typeof setInterval> | null = null;
const subscribeToTick = (listener: () => void) => {
  tickListeners.add(listener);
  if (!tickTimer) {
    tickTimer = setInterval(() => {
      tickNow = Date.now();
      tickListeners.forEach((notify) => notify());
    }, 30_000);
  }
  return () => {
    tickListeners.delete(listener);
    if (tickListeners.size === 0 && tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  };
};
const useNow = () => useSyncExternalStore(subscribeToTick, () => tickNow);

// Compact remaining time for the grant-expiry badge, e.g. "3h 41m"
const formatRemaining = (expiresAt: string, now: number) => {
  const remainingMs = new Date(expiresAt).getTime() - now;
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
  name: string;
  accountType: PamAccountType;
  search: string;
  accessStatus: PamAccessStatus;
  grantExpiresAt: string | null;
  // Action eligibility — each caller (admin vs regular user) computes these from its own data source
  // so the rendered row stays identical regardless of who is viewing it.
  needsApproval: boolean;
  canLaunchNow: boolean;
  // Hard-disabled (account not ready); takes precedence over every other action state.
  isDisabled?: boolean;
  disabledReason?: string;
  // Tooltip shown when the launch icon is disabled purely for lack of permission/readiness.
  launchDisabledReason?: string;
  onLaunch: () => void;
  onRequestAccess: () => void;
  // Optional slots layered on top of the shared row (e.g. the admin "..." menu / accessibility badge).
  actions?: ReactNode;
  accessibilityBadge?: ReactNode;
  indented?: boolean;
};

export const PamAccountRow = ({
  name,
  accountType,
  search,
  accessStatus,
  grantExpiresAt,
  needsApproval,
  canLaunchNow,
  isDisabled = false,
  disabledReason,
  launchDisabledReason = "You don't have permission to launch sessions for this account",
  onLaunch,
  onRequestAccess,
  actions,
  accessibilityBadge,
  indented
}: Props) => {
  const now = useNow();
  const { map } = usePamAccountTypeMap();
  const typeName = map[accountType]?.name ?? accountType;

  const isGranted = accessStatus === PamAccessStatus.Granted;
  const isPending = accessStatus === PamAccessStatus.Pending;

  // Row click mirrors the primary action icon, and only fires when the user can actually act.
  const rowAction = (() => {
    if (isDisabled) return undefined;
    if (isPending || needsApproval) return onRequestAccess;
    if (canLaunchNow) return onLaunch;
    return undefined;
  })();

  const renderAction = () => {
    if (isDisabled) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <IconButton
                variant="ghost"
                size="xs"
                aria-label="Launch session"
                className="text-muted hover:text-foreground"
                isDisabled
              >
                <Rocket className="size-4" />
              </IconButton>
            </div>
          </TooltipTrigger>
          <TooltipContent>{disabledReason}</TooltipContent>
        </Tooltip>
      );
    }

    if (isPending) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <IconButton
                variant="ghost"
                size="xs"
                aria-label="Request pending"
                className="text-warning hover:text-warning"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestAccess();
                }}
              >
                <Clock className="size-4" />
              </IconButton>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            Your access request is awaiting approval. Click for details.
          </TooltipContent>
        </Tooltip>
      );
    }

    if (needsApproval) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <IconButton
                variant="ghost"
                size="xs"
                aria-label="Request access"
                className="text-muted hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestAccess();
                }}
              >
                <KeyRound className="size-4" />
              </IconButton>
            </div>
          </TooltipTrigger>
          <TooltipContent>Request access to launch sessions for this account</TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div>
            <IconButton
              variant="ghost"
              size="xs"
              aria-label="Launch session"
              className="text-muted hover:text-foreground"
              isDisabled={!canLaunchNow}
              onClick={(e) => {
                e.stopPropagation();
                onLaunch();
              }}
            >
              <Rocket className="size-4" />
            </IconButton>
          </div>
        </TooltipTrigger>
        <TooltipContent>{canLaunchNow ? "Launch session" : launchDisabledReason}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TableRow className={rowAction ? "cursor-pointer" : ""} onClick={rowAction}>
      <TableCell>
        <div className={`flex items-center gap-2.5 ${indented ? "pl-[26px]" : ""}`}>
          <AccountPlatformIcon accountType={accountType} size={20} />
          <span className="font-medium text-foreground">
            <HighlightText text={name} highlight={search} />
          </span>
          <Badge variant="neutral">{typeName}</Badge>
          {accessibilityBadge}
        </div>
      </TableCell>
      <TableCell className="w-40">
        <div className="flex items-center justify-end gap-2.5">
          {isGranted && grantExpiresAt && (
            <Badge variant="success">
              <Clock className="mr-1 size-3" />
              Expires in {formatRemaining(grantExpiresAt, now)}
            </Badge>
          )}
          <div className="flex items-center gap-0.5">
            {renderAction()}
            {actions}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
};
