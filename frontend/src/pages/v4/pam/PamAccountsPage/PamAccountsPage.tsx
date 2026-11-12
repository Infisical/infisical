import { useMemo, useState, useSyncExternalStore } from "react";
import { useParams } from "@tanstack/react-router";

import { FilterBar } from "@app/components/v4/patterns/filter-bar";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { DocumentationLinkBadge } from "@app/components/v4/ui/documentation-link-badge";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { ProviderIcon } from "@app/components/v4/ui/provider-icon";
import { RowLink } from "@app/components/v4/ui/row-link";
import { Meta, StatusText } from "@app/components/v4/ui/text";
import { Tooltip, TooltipProvider } from "@app/components/v4/ui/tooltip";
import {
  buildPamAccountCan,
  PamAccessStatus,
  PamAccountAccessibilityIssue,
  PamAccountWarning,
  PamFolderCallerAccess,
  PamHeartbeatStatus,
  PamResourcePermissionActions,
  type TPamAccountListItem,
  type TPamAccountTypeMetadata,
  type TPamFolderWithCount
} from "@app/hooks/api/pam";
import { useDebounce } from "@app/hooks/useDebounce";

import { toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";

const route = v4Path("/organizations/$orgId/pam/accounts/");
const NOT_PORTED = "Not available in v4 yet";

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

type FolderRow = {
  kind: "folder";
  id: string;
  folder: TPamFolderWithCount;
  count: number;
};
type AccountRow = { kind: "account"; id: string; account: TPamAccountListItem };
type Row = FolderRow | AccountRow;

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

const AccessState = ({ account }: { account: TPamAccountListItem }) => {
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

const AccountMenu = ({ row, onCopy }: { row: AccountRow; onCopy: (row: Row) => void }) => {
  const { account } = row;
  const can = buildPamAccountCan(account.permissions);
  const canLaunch = can(PamResourcePermissionActions.LaunchSessions);
  const isGranted = account.accessStatus === PamAccessStatus.Granted;
  const isPending = account.accessStatus === PamAccessStatus.Pending;
  const needsApproval = account.requiresApproval && !isGranted && canLaunch && account.isAccessible;
  const canViewCredentials =
    account.supportsCredentialReveal && can(PamResourcePermissionActions.ViewCredentials);
  const needsCredentialApproval =
    account.requiresApproval && account.credentialAccessStatus !== PamAccessStatus.Granted;
  const canConfigure = can(PamResourcePermissionActions.EditAccounts);
  const canDelete = can(PamResourcePermissionActions.DeleteAccounts);

  let launchReason = NOT_PORTED;
  if (!canLaunch) launchReason = "You don't have permission to launch sessions";
  else if (!account.isAccessible) launchReason = "This account is not ready to launch";

  return (
    <>
      <DropdownMenuItem onSelect={() => onCopy(row)}>
        <Icon name="copy" />
        Copy account ID
      </DropdownMenuItem>
      {needsApproval ? (
        <DropdownMenuItem disabled description={NOT_PORTED}>
          <Icon name={isPending ? "clock" : "key"} />
          {isPending ? "Access request pending" : "Request access"}
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem disabled description={launchReason}>
          <Icon name="terminal" />
          Launch session
        </DropdownMenuItem>
      )}
      {canViewCredentials && (
        <DropdownMenuItem disabled description={NOT_PORTED}>
          <Icon name={needsCredentialApproval ? "key" : "eye"} />
          {needsCredentialApproval ? "Request credentials" : "View credentials"}
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled
        description={
          canConfigure ? NOT_PORTED : "You don't have permission to configure this account"
        }
      >
        <Icon name="settings" />
        Configure
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        disabled
        description={canDelete ? NOT_PORTED : "You don't have permission to delete this account"}
      >
        <Icon name="trash" />
        Delete account
      </DropdownMenuItem>
    </>
  );
};

const FolderMenu = ({ row, onCopy }: { row: FolderRow; onCopy: (row: Row) => void }) => {
  const { callerAccess } = row.folder;
  let joinReason = NOT_PORTED;
  if (callerAccess === undefined)
    joinReason = "Only organization admins can join a folder as admin";
  else if (callerAccess === PamFolderCallerAccess.Admin)
    joinReason = "You're already an admin of this folder";
  return (
    <>
      <DropdownMenuItem onSelect={() => onCopy(row)}>
        <Icon name="copy" />
        Copy folder ID
      </DropdownMenuItem>
      <DropdownMenuItem disabled description={NOT_PORTED}>
        <Icon name="settings" />
        Configure
      </DropdownMenuItem>
      <DropdownMenuItem disabled description={NOT_PORTED}>
        <Icon name="plus" />
        Add account
      </DropdownMenuItem>
      <DropdownMenuItem disabled description={joinReason}>
        <Icon name="user-plus" />
        Join as admin
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" disabled description={NOT_PORTED}>
        <Icon name="trash" />
        Delete folder
      </DropdownMenuItem>
    </>
  );
};

export const PamAccountsPage = () => {
  const { orgId } = useParams({ from: route });
  const pam = useV4Adapter("pam");
  const [searchInput, setSearchInput] = useState("");

  const { data: capabilities } = pam.useAccessCapabilities();
  const { data: folders = [], isPending: isLoadingFolders } = pam.useFolders({
    includeNonMemberFolders: true
  });
  const { data: creatableFolders = [] } = pam.useFolders({
    filterByAction: PamResourcePermissionActions.CreateAccounts
  });
  const { data: accountTypes = [] } = pam.useAccountTypes();
  const canManage = creatableFolders.length > 0 || Boolean(capabilities?.isProductAdmin);

  const [debouncedSearch] = useDebounce(searchInput);
  const query = debouncedSearch.trim();
  const filterActive = Boolean(query);
  const { data: matches = [], isPending: isLoadingMatches } = pam.useAccounts(
    { search: query || undefined },
    { enabled: filterActive }
  );

  const typeMap = useMemo(
    () => new Map<string, TPamAccountTypeMetadata>(accountTypes.map((meta) => [meta.type, meta])),
    [accountTypes]
  );

  const rows = useMemo<Row[]>(() => {
    if (!filterActive)
      return folders.map((folder) => ({
        kind: "folder",
        id: folder.id,
        folder,
        count: folder.accountCount
      }));
    return folders.flatMap((folder) => {
      const count = matches.filter((account) => account.folderId === folder.id).length;
      return count ? [{ kind: "folder" as const, id: folder.id, folder, count }] : [];
    });
  }, [filterActive, folders, matches]);
  const childrenOf = (row: Row): Row[] | undefined =>
    filterActive && row.kind === "folder"
      ? matches
          .filter((account) => account.folderId === row.id)
          .map((account) => ({ kind: "account" as const, id: account.id, account }))
      : undefined;

  const copyId = (row: Row) => {
    navigator.clipboard.writeText(row.id);
    toast({
      tone: "ok",
      title: `${row.kind === "folder" ? "Folder" : "Account"} ID copied to clipboard`
    });
  };

  const columns: DataTableColumn<Row>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (row) => (row.kind === "folder" ? row.folder.name : row.account.name),
      render: (row) => {
        if (row.kind === "folder") {
          const { folder } = row;
          if (folder.callerAccess === PamFolderCallerAccess.None)
            return (
              <Inline gap={8} align="center" wrap={false}>
                <Icon name="folder" />
                <span>{folder.name}</span>
                <Badge tone="outline">Not a member</Badge>
              </Inline>
            );
          return (
            <Inline gap={8} align="center" wrap={false}>
              <Icon name="folder" />
              <RowLink
                link={{
                  to: v4Path("/organizations/$orgId/$"),
                  params: { orgId, _splat: `pam/accounts/${folder.id}` }
                }}
              >
                {folder.name}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--v4-space-8)",
                    marginInlineStart: "var(--v4-space-8)",
                    verticalAlign: "middle"
                  }}
                >
                  <Meta>{`(${row.count})`}</Meta>
                  {folder.description && <Meta mono={false}>{folder.description}</Meta>}
                </span>
              </RowLink>
            </Inline>
          );
        }
        const { account } = row;
        const meta = typeMap.get(account.accountType);
        const canEdit = buildPamAccountCan(account.permissions)(
          PamResourcePermissionActions.EditAccounts
        );
        return (
          <Inline gap={8} align="center" wrap={false}>
            {meta && <ProviderIcon icon={meta.icon} alt={meta.name} size="sm" />}
            <RowLink
              link={{
                to: v4Path("/organizations/$orgId/$"),
                params: {
                  orgId,
                  _splat: `pam/accounts/${account.accountType}/${account.id}/access`
                }
              }}
            >
              {account.name}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--v4-space-8)",
                  marginInlineStart: "var(--v4-space-8)",
                  verticalAlign: "middle"
                }}
              >
                <Badge tone="outline">{meta?.name ?? account.accountType}</Badge>
                <AccountBadges account={account} canEdit={canEdit} />
              </span>
            </RowLink>
          </Inline>
        );
      }
    },
    {
      id: "access",
      header: "Access",
      width: 184,
      render: (row) => (row.kind === "account" ? <AccessState account={row.account} /> : null)
    }
  ];

  let empty = (
    <EmptyState
      size="sm"
      media="bare"
      icon="folder"
      title="No accounts available"
      description="Ask your PAM admin to grant you access to a folder or account."
    />
  );
  if (filterActive)
    empty = (
      <EmptyState
        size="sm"
        media="bare"
        icon="search"
        title="No accounts match your search"
        actions={
          <Button variant="outline" onClick={() => setSearchInput("")}>
            Clear search
          </Button>
        }
      />
    );
  else if (canManage)
    empty = (
      <EmptyState
        size="sm"
        media="bare"
        icon="folder"
        title="No accounts yet"
        description="You need at least one account template first."
      />
    );

  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="Accounts"
          description="Launch sessions with the accounts you have access to."
          badges={
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/pam/accounts/overview" />
          }
          actions={
            <Inline gap={8}>
              <Tooltip content={NOT_PORTED}>
                <Button variant="outline" icon="folder" aria-disabled>
                  Add folder
                </Button>
              </Tooltip>
              <Tooltip content={NOT_PORTED}>
                <Button variant="accent" icon="plus" aria-disabled>
                  Add account
                </Button>
              </Tooltip>
            </Inline>
          }
        />
        <FilterBar
          label="Account filters"
          fields={[]}
          value={[]}
          onChange={() => undefined}
          search={
            <Input
              icon="search"
              aria-label="Search accounts"
              placeholder="Search accounts..."
              kbd="/"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          }
        />
        <DataTable
          label="Accounts"
          rows={rows}
          columns={columns}
          loading={isLoadingFolders || (filterActive && isLoadingMatches)}
          loadingRows={5}
          getRowId={(row) => `${row.kind}-${row.id}`}
          getRowChildren={childrenOf}
          rowLabel={(row) => (row.kind === "folder" ? row.folder.name : row.account.name)}
          rowActions={{
            menuLabel: "Row options",
            renderMenu: (row) =>
              row.kind === "folder" ? (
                <FolderMenu row={row} onCopy={copyId} />
              ) : (
                <AccountMenu row={row} onCopy={copyId} />
              )
          }}
          empty={empty}
        />
      </Stack>
    </TooltipProvider>
  );
};
