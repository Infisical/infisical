import { useMemo, useState } from "react";
import { FilterBar } from "@infisical/cipher/patterns/filter-bar";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { Meta } from "@infisical/cipher/ui/text";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useParams } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  PamFolderCallerAccess,
  PamResourcePermissionActions,
  type TPamAccountListItem,
  type TPamAccountTypeMetadata,
  type TPamFolderWithCount
} from "@app/hooks/api/pam";
import { useDebounce } from "@app/hooks/useDebounce";

import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import {
  AccessState,
  AccountMenu,
  AccountName,
  FolderMenu,
  useAccountOverlays
} from "./account-rows";

const route = v4Path("/organizations/$orgId/pam/accounts/");
export const PAM_ACCOUNTS_DOCS =
  "https://infisical.com/docs/documentation/platform/pam/accounts/overview";

type MyAccountsRow = { kind: "my-accounts"; id: string; count?: number };
type FolderRow = { kind: "folder"; id: string; folder: TPamFolderWithCount; count: number };
type AccountRow = { kind: "account"; id: string; account: TPamAccountListItem };
type Row = MyAccountsRow | FolderRow | AccountRow;

const FolderTail = ({ count, description }: { count?: number; description?: string | null }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "var(--cipher-space-8)",
      marginInlineStart: "var(--cipher-space-8)",
      verticalAlign: "middle"
    }}
  >
    {count !== undefined && <Meta>{`(${count})`}</Meta>}
    {description && <Meta mono={false}>{description}</Meta>}
  </span>
);

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
  const { data: myAccountFolders } = pam.useFolders({
    filterByAction: PamResourcePermissionActions.LaunchSessions
  });
  const { data: accountTypes = [] } = pam.useAccountTypes();
  const isProductAdmin = Boolean(capabilities?.isProductAdmin);
  const canManage = creatableFolders.length > 0 || isProductAdmin;
  const myAccountCount = myAccountFolders?.reduce((sum, folder) => sum + folder.accountCount, 0);

  const [debouncedSearch] = useDebounce(searchInput);
  const query = debouncedSearch.trim();
  const filterActive = Boolean(query);
  const { data: matches = [], isPending: isLoadingMatches } = pam.useAccounts(
    { search: query || undefined },
    { enabled: filterActive }
  );

  const overlays = useAccountOverlays({ folders });

  const typeMap = useMemo(
    () => new Map<string, TPamAccountTypeMetadata>(accountTypes.map((meta) => [meta.type, meta])),
    [accountTypes]
  );

  const rows = useMemo<Row[]>(() => {
    if (!filterActive)
      return [
        { kind: "my-accounts", id: "my-accounts", count: myAccountCount },
        ...folders.map((folder) => ({
          kind: "folder" as const,
          id: folder.id,
          folder,
          count: folder.accountCount
        }))
      ];
    return folders.flatMap((folder) => {
      const count = matches.filter((account) => account.folderId === folder.id).length;
      return count ? [{ kind: "folder" as const, id: folder.id, folder, count }] : [];
    });
  }, [filterActive, folders, matches, myAccountCount]);
  const childrenOf = (row: Row): Row[] | undefined =>
    filterActive && row.kind === "folder"
      ? matches
          .filter((account) => account.folderId === row.id)
          .map((account) => ({ kind: "account" as const, id: account.id, account }))
      : undefined;

  const columns: DataTableColumn<Row>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (row) => {
        if (row.kind === "my-accounts") return "My accounts";
        return row.kind === "folder" ? row.folder.name : row.account.name;
      },
      render: (row) => {
        if (row.kind === "my-accounts")
          return (
            <Inline gap={8} align="center" wrap={false}>
              <Icon name="user" />
              <RowLink
                link={{
                  to: v4Path("/organizations/$orgId/pam/accounts/my-accounts"),
                  params: { orgId }
                }}
              >
                My accounts
                <FolderTail count={row.count} />
              </RowLink>
            </Inline>
          );
        if (row.kind === "folder") {
          const { folder } = row;
          if (folder.callerAccess === PamFolderCallerAccess.None)
            return (
              <Inline gap={8} align="center" wrap={false}>
                <Icon name="folder" style={{ flexShrink: 0 }} />
                <span>{folder.name}</span>
                <Badge tone="outline">Not a member</Badge>
              </Inline>
            );
          return (
            <Inline gap={8} align="center" wrap={false}>
              <Icon name="folder" style={{ flexShrink: 0 }} />
              <RowLink
                link={{
                  to: v4Path("/organizations/$orgId/pam/accounts/$folderId"),
                  params: { orgId, folderId: folder.id }
                }}
              >
                {folder.name}
                <FolderTail count={row.count} description={folder.description} />
              </RowLink>
            </Inline>
          );
        }
        return (
          <AccountName
            orgId={orgId}
            account={row.account}
            meta={typeMap.get(row.account.accountType)}
          />
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
        actions={
          <Button variant="outline" icon="plus" onClick={() => overlays.openCreateAccount()}>
            Add account
          </Button>
        }
      />
    );

  return (
    <TooltipProvider>
      <PageTitle title="Accounts" />
      <Stack gap={24}>
        <PageHeader
          title="Accounts"
          badges={<DocumentationLink href={PAM_ACCOUNTS_DOCS} subject="accounts" />}
          actions={
            <Inline gap={8}>
              <Button
                variant="outline"
                icon="folder"
                disabledReason={
                  isProductAdmin ? undefined : "Only product admins can create folders"
                }
                onClick={overlays.openCreateFolder}
              >
                Add folder
              </Button>
              <Button
                variant="accent"
                icon="plus"
                disabledReason={
                  canManage
                    ? undefined
                    : "You don't have permission to create accounts in any folder"
                }
                onClick={() => overlays.openCreateAccount()}
              >
                Add account
              </Button>
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
              slashShortcut
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          }
        />
        <DataTable
          label="Accounts"
          rows={folders.length || filterActive ? rows : []}
          columns={columns}
          loading={isLoadingFolders || (filterActive && isLoadingMatches)}
          loadingRows={5}
          getRowId={(row) => `${row.kind}-${row.id}`}
          getRowChildren={childrenOf}
          rowLabel={(row) => {
            if (row.kind === "my-accounts") return "My accounts";
            return row.kind === "folder" ? row.folder.name : row.account.name;
          }}
          rowActions={{
            menuLabel: "Row options",
            menuDisabledReason: (row) =>
              row.kind === "my-accounts" ? "My accounts has no options" : undefined,
            renderMenu: (row) => {
              if (row.kind === "my-accounts") return null;
              if (row.kind === "folder")
                return (
                  <FolderMenu
                    folder={row.folder}
                    onConfigure={(tab) => overlays.openConfigureFolder(row.folder.id, tab)}
                    onAddAccount={() => overlays.openCreateAccount(row.folder.id)}
                    onJoin={() => overlays.openJoinFolder(row.folder)}
                    onDelete={() => overlays.openDeleteFolder(row.folder)}
                  />
                );
              const { account } = row;
              return (
                <AccountMenu
                  orgId={orgId}
                  account={account}
                  onConfigure={(tab) => overlays.openAccount(account.id, tab)}
                  onRequestAccess={(accessType) => overlays.openRequestAccess(account, accessType)}
                  onViewCredentials={() => overlays.openCredentials(account)}
                  onDelete={() =>
                    overlays.openDeleteAccount({
                      id: account.id,
                      name: account.name,
                      accountType: account.accountType,
                      typeName: typeMap.get(account.accountType)?.name
                    })
                  }
                />
              );
            }
          }}
          empty={empty}
        />
      </Stack>
      {overlays.overlays}
    </TooltipProvider>
  );
};
