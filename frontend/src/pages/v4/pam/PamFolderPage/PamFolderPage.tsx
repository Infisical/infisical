import { Button } from "@infisical/cipher/ui/button";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { Link, useParams } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import { PamResourcePermissionActions } from "@app/hooks/api/pam";

import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo, v4Path } from "../../links";
import { AccountList, useAccountFilters } from "../PamAccountsPage/account-list";
import { FolderMenu, useAccountOverlays } from "../PamAccountsPage/account-rows";
import { PAM_ACCOUNTS_DOCS } from "../PamAccountsPage/PamAccountsPage";

const route = v4Path("/organizations/$orgId/pam/accounts/$folderId");

export const PamFolderPage = () => {
  const { orgId, folderId } = useParams({ from: route });
  const go = useGo();
  const pam = useV4Adapter("pam");
  const filters = useAccountFilters();
  const accountsHref = orgHref(orgId, "/pam/accounts");

  const { data: folders = [], isPending: isLoadingFolders } = pam.useFolders();
  const folder = folders.find(({ id }) => id === folderId);
  const { data: accounts = [], isPending: isLoadingAccounts } = pam.useAccounts({
    folderId,
    search: filters.search,
    accountType: filters.accountType
  });
  const { can, isLoading: isLoadingPermissions } = pam.useFolderActions(folderId, Boolean(folder));
  const resolved = Boolean(folder) && !isLoadingPermissions;
  const canCreate = resolved && can(PamResourcePermissionActions.CreateAccounts);
  const overlays = useAccountOverlays({
    folders,
    lockedFolderId: folderId,
    onFolderDeleted: () => go(accountsHref)
  });
  const breadcrumb = [{ label: "Accounts", link: go.link(accountsHref) }];

  if (!isLoadingFolders && !folder)
    return (
      <>
        <PageTitle title="Folder" />
        <Stack gap={24}>
          <PageHeader breadcrumb={breadcrumb} title="Folder" />
          <EmptyState
            icon="folder"
            title="Folder not found"
            description="This folder no longer exists, or you don't have access to it."
            actions={
              <Button variant="outline" asChild>
                <Link {...go.link(accountsHref)}>Back to accounts</Link>
              </Button>
            }
          />
        </Stack>
      </>
    );

  let createReason: string | undefined;
  if (!resolved) createReason = "Checking your permissions";
  else if (!canCreate) createReason = "You don't have permission to create accounts in this folder";

  return (
    <TooltipProvider>
      <PageTitle title={folder?.name ?? "Folder"} />
      <Stack gap={24}>
        <PageHeader
          breadcrumb={breadcrumb}
          title={folder?.name ?? "Folder"}
          badges={<DocumentationLink href={PAM_ACCOUNTS_DOCS} subject="accounts" />}
          description={folder?.description ?? undefined}
          actions={
            <Inline gap={8}>
              {folder && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" icon="more" iconOnly aria-label="Folder options" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <FolderMenu
                      folder={folder}
                      onConfigure={() => overlays.openConfigureFolder(folder.id)}
                      onDelete={() => overlays.openDeleteFolder(folder)}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button
                variant="accent"
                icon="plus"
                disabledReason={createReason}
                onClick={() => overlays.openCreateAccount(folderId)}
              >
                Add account
              </Button>
            </Inline>
          }
        />
        <AccountList
          orgId={orgId}
          label="Folder accounts"
          accounts={accounts}
          loading={isLoadingFolders || isLoadingAccounts}
          filters={filters}
          overlays={overlays}
          emptyTitle="No accounts in this folder"
          emptyDescription={
            canCreate
              ? undefined
              : "Ask your PAM admin to grant you access to an account in this folder."
          }
          emptyAction={
            canCreate ? (
              <Button
                variant="outline"
                icon="plus"
                onClick={() => overlays.openCreateAccount(folderId)}
              >
                Add account
              </Button>
            ) : undefined
          }
        />
      </Stack>
      {overlays.overlays}
    </TooltipProvider>
  );
};
