import { useState, useSyncExternalStore } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { Meta, StatusText } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { useParams } from "@tanstack/react-router";

import {
  buildPamAccountCan,
  PamAccessStatus,
  PamAccessType,
  PamAccountAccessibilityIssue,
  PamAccountWarning,
  PamFolderCallerAccess,
  PamHeartbeatStatus,
  PamResourcePermissionActions,
  type TPamAccountListItem,
  type TPamAccountTypeMetadata,
  type TPamFolderWithCount
} from "@app/hooks/api/pam";
import { PamSheetTab, usePamSheetState } from "@app/hooks/usePamSheetState";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo, v4Path } from "../../links";
import { AccountSheet } from "./account-sheet";
import { CreateAccountSheet } from "./create-account-sheet";
import {
  type AccountTarget,
  CreateFolderDialog,
  DeleteAccountDialog,
  DeleteFolderDialog,
  FolderSheet,
  type FolderTarget,
  JoinFolderDialog
} from "./folder-dialogs";
import { CredentialsDialog, RequestAccessSheet } from "./request-access";
import { FOLDER_TABS, visibleAccountTabs } from "./sheet-tabs";

const ISSUE_LABELS: Record<PamAccountAccessibilityIssue, string> = {
  [PamAccountAccessibilityIssue.NoGateway]: "No gateway is configured",
  [PamAccountAccessibilityIssue.NoRecordingConfig]: "No recording bucket is configured",
  [PamAccountAccessibilityIssue.NoCredential]: "No password is set",
  [PamAccountAccessibilityIssue.NoApprovalConfig]:
    "No approvers are configured for its folder. Ask a folder admin to add approvers under the folder's Approvals tab"
};

const HEALTH: Partial<
  Record<PamHeartbeatStatus, { label: string; tone: "bad" | "warn"; tooltip: string }>
> = {
  [PamHeartbeatStatus.InvalidCredentials]: {
    label: "Out of sync",
    tone: "bad",
    tooltip:
      "The stored credential no longer matches the target, so sessions and rotation will fail. Checks are paused until it is updated, since repeated failed logins can lock the account out."
  },
  [PamHeartbeatStatus.CannotCheck]: {
    label: "Unreachable",
    tone: "warn",
    tooltip:
      "The target could not be reached on the last check, so the credential's state is unknown."
  }
};

const tickListeners = new Set<() => void>();
let tickNow = Date.now();
let tickTimer: ReturnType<typeof setInterval> | null = null;
const subscribeToTick = (listener: () => void) => {
  tickListeners.add(listener);
  if (!tickTimer)
    tickTimer = setInterval(() => {
      tickNow = Date.now();
      tickListeners.forEach((notify) => notify());
    }, 30_000);
  return () => {
    tickListeners.delete(listener);
    if (tickListeners.size === 0 && tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  };
};

const formatRemaining = (expiresAt: string, now: number) => {
  const totalMinutes = Math.floor((new Date(expiresAt).getTime() - now) / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

export const AccessState = ({ account }: { account: TPamAccountListItem }) => {
  const now = useSyncExternalStore(subscribeToTick, () => tickNow);
  if (account.accessStatus === PamAccessStatus.Pending)
    return (
      <Tooltip content="Your access request is awaiting approval.">
        <StatusText tone="warn" icon="clock" tabIndex={0}>
          Request pending
        </StatusText>
      </Tooltip>
    );
  if (account.accessStatus !== PamAccessStatus.Granted || !account.grantExpiresAt) return null;
  if (new Date(account.grantExpiresAt).getTime() <= now)
    return <StatusText icon="clock">Expired</StatusText>;
  return (
    <StatusText tone="ok" icon="clock">
      {`Expires in ${formatRemaining(account.grantExpiresAt, now)}`}
    </StatusText>
  );
};

const AccountBadges = ({
  account,
  canEdit
}: {
  account: TPamAccountListItem;
  canEdit: boolean;
}) => {
  const health =
    account.heartbeatEnabled && account.heartbeatStatus
      ? HEALTH[account.heartbeatStatus]
      : undefined;
  const issues = account.accessibilityIssues;
  return (
    <>
      {canEdit && issues.length > 0 && (
        <Tooltip
          content={
            <Stack gap={4}>
              <span>This account can&apos;t be used yet.</span>
              {issues.map((issue) => (
                <span key={issue}>{`${ISSUE_LABELS[issue]}.`}</span>
              ))}
            </Stack>
          }
        >
          <Badge tone="warn" tabIndex={0}>
            Unavailable
          </Badge>
        </Tooltip>
      )}
      {account.isStale && (
        <Tooltip content="The latest discovery scan didn't find this account in the environment. It still works normally, including rotation and access, so delete it if it's really gone.">
          <Badge tone="soft" tabIndex={0}>
            Stale
          </Badge>
        </Tooltip>
      )}
      {account.warnings.includes(PamAccountWarning.SessionLogMaskingDegraded) && (
        <Tooltip content="This account's template enables built-in detection, but the gateway serving it runs a version that doesn't support it. Recordings are masked by the template's custom patterns only until the gateway is upgraded.">
          <Badge tone="warn" tabIndex={0}>
            Partial masking
          </Badge>
        </Tooltip>
      )}
      {health && (
        <Tooltip content={health.tooltip}>
          <Badge tone={health.tone} tabIndex={0}>
            {health.label}
          </Badge>
        </Tooltip>
      )}
    </>
  );
};

const accessHref = (orgId: string, account: Pick<TPamAccountListItem, "id" | "accountType">) =>
  orgHref(orgId, `/pam/accounts/${account.accountType}/${account.id}/access`);

export const AccountName = ({
  orgId,
  account,
  meta,
  showFolder = false
}: {
  orgId: string;
  account: TPamAccountListItem;
  meta?: TPamAccountTypeMetadata;
  showFolder?: boolean;
}) => {
  const canEdit = buildPamAccountCan(account.permissions)(
    PamResourcePermissionActions.EditAccounts
  );
  return (
    <Inline gap={8} align="center" wrap={false}>
      {meta && <ProviderIcon icon={meta.icon} alt={meta.name} size="sm" />}
      <RowLink
        link={{
          to: v4Path("/organizations/$orgId/pam/accounts/$accountType/$accountId/access"),
          params: { orgId, accountType: account.accountType, accountId: account.id }
        }}
      >
        {account.name}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--cipher-space-8)",
            marginInlineStart: "var(--cipher-space-8)",
            verticalAlign: "middle"
          }}
        >
          <Badge tone="outline">{meta?.name ?? account.accountType}</Badge>
          {showFolder && account.folderName && <Meta mono={false}>{account.folderName}</Meta>}
          <AccountBadges account={account} canEdit={canEdit} />
        </span>
      </RowLink>
    </Inline>
  );
};

const copyId = (kind: "Folder" | "Account", id: string) => {
  navigator.clipboard.writeText(id);
  toast({ tone: "ok", title: `${kind} ID copied to clipboard` });
};

export const AccountMenu = ({
  orgId,
  account,
  onConfigure,
  onRequestAccess,
  onViewCredentials,
  onDelete
}: {
  orgId: string;
  account: TPamAccountListItem;
  onConfigure: (tab: PamSheetTab) => void;
  onRequestAccess: (accessType: PamAccessType) => void;
  onViewCredentials: () => void;
  onDelete: () => void;
}) => {
  const go = useGo();
  const can = buildPamAccountCan(account.permissions);
  const canLaunch = can(PamResourcePermissionActions.LaunchSessions);
  const isGranted = account.accessStatus === PamAccessStatus.Granted;
  const isPending = account.accessStatus === PamAccessStatus.Pending;
  const needsApproval = account.requiresApproval && !isGranted && canLaunch && account.isAccessible;
  const canLaunchNow =
    account.isAccessible && canLaunch && (!account.requiresApproval || isGranted);
  const canViewCredentials =
    account.supportsCredentialReveal && can(PamResourcePermissionActions.ViewCredentials);
  const needsCredentialApproval =
    account.requiresApproval && account.credentialAccessStatus !== PamAccessStatus.Granted;
  const isCredentialPending = account.credentialAccessStatus === PamAccessStatus.Pending;
  const hasApprovalConfig = !account.accessibilityIssues.includes(
    PamAccountAccessibilityIssue.NoApprovalConfig
  );
  const configureTab =
    visibleAccountTabs(can, account.accountType).find(
      ({ value }) => value === PamSheetTab.Configuration
    ) ?? visibleAccountTabs(can, account.accountType)[0];

  let launchReason: string | undefined;
  if (!canLaunch) launchReason = "You don't have permission to launch sessions";
  else if (!canLaunchNow) launchReason = "This account is not ready to launch";

  return (
    <>
      <DropdownMenuItem onSelect={() => copyId("Account", account.id)}>
        <Icon name="copy" />
        Copy account ID
      </DropdownMenuItem>
      {needsApproval ? (
        <DropdownMenuItem onSelect={() => onRequestAccess(PamAccessType.Session)}>
          <Icon name={isPending ? "clock" : "key"} />
          {isPending ? "Access request pending" : "Request access"}
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem
          disabledReason={launchReason}
          onSelect={() => go(accessHref(orgId, account))}
        >
          <Icon name="terminal" />
          Launch session
        </DropdownMenuItem>
      )}
      {canViewCredentials &&
        (needsCredentialApproval ? (
          <DropdownMenuItem
            disabledReason={
              hasApprovalConfig ? undefined : "This folder has no approvers configured"
            }
            onSelect={() => onRequestAccess(PamAccessType.Credential)}
          >
            <Icon name={isCredentialPending ? "clock" : "key"} />
            {isCredentialPending ? "Credential request pending" : "Request credentials"}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={onViewCredentials}>
            <Icon name="eye" />
            View credentials
          </DropdownMenuItem>
        ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabledReason={
          configureTab ? undefined : "You don't have permission to configure this account"
        }
        onSelect={() => configureTab && onConfigure(configureTab.value)}
      >
        <Icon name="settings" />
        Configure
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        disabledReason={
          can(PamResourcePermissionActions.DeleteAccounts)
            ? undefined
            : "You don't have permission to delete this account"
        }
        onSelect={onDelete}
      >
        <Icon name="trash" />
        Delete account
      </DropdownMenuItem>
    </>
  );
};

export const FolderMenu = ({
  folder,
  onConfigure,
  onAddAccount,
  onJoin,
  onDelete
}: {
  folder: TPamFolderWithCount;
  onConfigure: (tab: PamSheetTab) => void;
  onAddAccount?: () => void;
  onJoin?: () => void;
  onDelete: () => void;
}) => {
  const { can, isLoading } = useV4Adapter("pam").useFolderActions(
    folder.id,
    folder.callerAccess !== PamFolderCallerAccess.None
  );
  const reason = (action: PamResourcePermissionActions, denied: string) => {
    if (isLoading) return "Checking your permissions";
    return can(action) ? undefined : denied;
  };
  const allowedTabs = isLoading ? [] : FOLDER_TABS.filter(({ action }) => can(action));
  const configureTab =
    allowedTabs.find(({ value }) => value === PamSheetTab.Configuration) ?? allowedTabs[0];
  let configureReason: string | undefined;
  if (isLoading) configureReason = "Checking your permissions";
  else if (!configureTab) configureReason = "You don't have permission to configure this folder";
  let joinReason: string | undefined;
  if (folder.callerAccess === undefined)
    joinReason = "Only organization admins can join a folder as admin";
  else if (folder.callerAccess === PamFolderCallerAccess.Admin)
    joinReason = "You're already an admin of this folder";
  return (
    <>
      <DropdownMenuItem onSelect={() => copyId("Folder", folder.id)}>
        <Icon name="copy" />
        Copy folder ID
      </DropdownMenuItem>
      <DropdownMenuItem
        disabledReason={configureReason}
        onSelect={() => configureTab && onConfigure(configureTab.value)}
      >
        <Icon name="settings" />
        Configure
      </DropdownMenuItem>
      {onAddAccount && (
        <DropdownMenuItem
          disabledReason={reason(
            PamResourcePermissionActions.CreateAccounts,
            "You don't have permission to create accounts in this folder"
          )}
          onSelect={onAddAccount}
        >
          <Icon name="plus" />
          Add account
        </DropdownMenuItem>
      )}
      {onJoin && (
        <DropdownMenuItem disabledReason={joinReason} onSelect={onJoin}>
          <Icon name="user-plus" />
          Join as admin
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        disabledReason={reason(
          PamResourcePermissionActions.DeleteFolder,
          "You don't have permission to delete this folder"
        )}
        onSelect={onDelete}
      >
        <Icon name="trash" />
        Delete folder
      </DropdownMenuItem>
    </>
  );
};

export const useAccountOverlays = ({
  folders = [],
  lockedFolderId,
  onFolderDeleted
}: {
  folders?: TPamFolderWithCount[];
  lockedFolderId?: string;
  onFolderDeleted?: () => void;
} = {}) => {
  const go = useGo();
  const { orgId } = useParams({ strict: false }) as { orgId: string };
  const accountSheet = usePamSheetState("accountId");
  const folderSheet = usePamSheetState("folderId");
  const [requesting, setRequesting] = useState<{
    account: TPamAccountListItem;
    accessType: PamAccessType;
  } | null>(null);
  const [revealing, setRevealing] = useState<TPamAccountListItem | null>(null);
  const [creating, setCreating] = useState<{ folderId?: string } | null>(null);
  const [createSeq, setCreateSeq] = useState(0);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<AccountTarget | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<FolderTarget | null>(null);
  const [joining, setJoining] = useState<TPamFolderWithCount | null>(null);

  const overlays = (
    <>
      <CreateAccountSheet
        key={createSeq}
        open={Boolean(creating)}
        defaultFolderId={lockedFolderId ?? creating?.folderId}
        folderLocked={Boolean(lockedFolderId)}
        onOpenChange={(open) => {
          if (!open) setCreating(null);
        }}
        onCreated={(accountId) => accountSheet.openSheet(accountId)}
      />
      <CreateFolderDialog open={creatingFolder} onOpenChange={setCreatingFolder} />
      <AccountSheet
        accountId={accountSheet.selectedId}
        onOpenChange={(open) => {
          if (!open) accountSheet.closeSheet();
        }}
      />
      <FolderSheet
        folderId={folderSheet.selectedId}
        folders={folders}
        onOpenChange={(open) => {
          if (!open) folderSheet.closeSheet();
        }}
      />
      <RequestAccessSheet
        target={requesting}
        onOpenChange={(open) => {
          if (!open) setRequesting(null);
        }}
        onGranted={({ account, accessType }) => {
          if (accessType === PamAccessType.Credential) setRevealing(account);
          else go(accessHref(orgId, account));
        }}
      />
      <CredentialsDialog
        account={revealing}
        onOpenChange={(open) => {
          if (!open) setRevealing(null);
        }}
      />
      <DeleteAccountDialog
        account={deletingAccount}
        onOpenChange={(open) => {
          if (!open) setDeletingAccount(null);
        }}
      />
      <DeleteFolderDialog
        folder={deletingFolder}
        onDeleted={onFolderDeleted}
        onOpenChange={(open) => {
          if (!open) setDeletingFolder(null);
        }}
      />
      <JoinFolderDialog
        folder={joining}
        onOpenChange={(open) => {
          if (!open) setJoining(null);
        }}
      />
    </>
  );

  return {
    overlays,
    openCreateAccount: (folderId?: string) => {
      setCreateSeq((seq) => seq + 1);
      setCreating({ folderId });
    },
    openCreateFolder: () => setCreatingFolder(true),
    openAccount: (accountId: string, tab?: PamSheetTab) => accountSheet.openSheet(accountId, tab),
    openRequestAccess: (account: TPamAccountListItem, accessType: PamAccessType) =>
      setRequesting({ account, accessType }),
    openCredentials: setRevealing,
    openDeleteAccount: setDeletingAccount,
    openDeleteFolder: setDeletingFolder,
    openJoinFolder: setJoining,
    openConfigureFolder: (folderId: string, tab?: PamSheetTab) =>
      folderSheet.openSheet(folderId, tab)
  };
};
