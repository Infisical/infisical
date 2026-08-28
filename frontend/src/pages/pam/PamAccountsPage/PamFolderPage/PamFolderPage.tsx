import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Filter, FolderOpen, MoreHorizontal, Plus, Search, Settings, Trash2 } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { PageHeader } from "@app/components/v2";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  PamAccountType,
  PamResourcePermissionActions,
  TAccessiblePamAccount,
  useDeletePamAccount,
  useDeletePamFolder,
  useListPamAccounts,
  useListPamAccountTypes,
  useListPamFolders,
  usePamFolderActions
} from "@app/hooks/api/pam";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useDebounce } from "@app/hooks/useDebounce";
import { PamSheetTab, usePamSheetState } from "@app/hooks/usePamSheetState";
import { usePopUp } from "@app/hooks/usePopUp";

import { LaunchSessionSheet } from "../../components/LaunchSessionSheet";
import { PAM_FOLDER_TABS } from "../../components/pamResourceTabs";
import { RequestAccessSheet } from "../../components/RequestAccessSheet";
import { PamDocsUrls } from "../../pam-docs-urls";
import { AccountDetailSheet } from "../components/AccountDetailSheet";
import { AccountsBreadcrumb } from "../components/AccountsBreadcrumb";
import { CreateAccountSheet } from "../components/CreateAccountSheet";
import { DeleteAccountModal } from "../components/DeleteAccountModal";
import { DeleteFolderModal } from "../components/DeleteFolderModal";
import { FolderAccountRow } from "../components/FolderAccountRow";
import { FolderDetailSheet } from "../components/FolderDetailSheet";

const SKELETON_KEYS = ["s1", "s2", "s3", "s4", "s5"];

export const PamFolderPage = () => {
  const { t } = useTranslation();
  const { orgId, folderId } = useParams({ from: ROUTE_PATHS.Pam.FolderPage.id });
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useState("");
  const [selectedAccountType, setSelectedAccountType] = useState<string>("");

  const [debouncedSearch] = useDebounce(searchInput);
  const query = debouncedSearch.trim();

  // Backed by ReadAccounts/ReadFolder, so a folder the caller can't read simply isn't in the list.
  const { data: folders = [], isPending: isLoadingFolders } = useListPamFolders();
  const folder = folders.find((f) => f.id === folderId);

  const { data: accountTypes = [] } = useListPamAccountTypes();
  const { data: accounts = [], isPending: isLoadingAccounts } = useListPamAccounts({
    folderId,
    search: query || undefined,
    accountType: selectedAccountType || undefined
  });

  const { can, isLoading: isLoadingPermissions } = usePamFolderActions(folderId, Boolean(folder));
  // Until the permission set resolves the button is disabled, but the reason isn't known yet, so
  // don't claim it's a permission problem.
  const arePermissionsResolved = Boolean(folder) && !isLoadingPermissions;
  const canCreateAccounts =
    arePermissionsResolved && can(PamResourcePermissionActions.CreateAccounts);
  const canDeleteFolder = arePermissionsResolved && can(PamResourcePermissionActions.DeleteFolder);
  const availableTabs = PAM_FOLDER_TABS.filter(
    (tab) => arePermissionsResolved && (!tab.action || can(tab.action))
  );
  const configureTab =
    availableTabs.find((tab) => tab.value === PamSheetTab.Configuration) ?? availableTabs[0];

  const deleteAccount = useDeletePamAccount();
  const deleteFolder = useDeletePamFolder();

  const { popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "createAccount",
    "deleteAccount",
    "deleteFolder"
  ] as const);

  const accountSheet = usePamSheetState("accountId");
  // The folder is the page itself, so its settings sheet is local state rather than a URL param.
  const [folderSheetTab, setFolderSheetTab] = useState<PamSheetTab | undefined>();

  const [launchAccount, setLaunchAccount] = useState<TAccessiblePamAccount | null>(null);
  const [requestAccount, setRequestAccount] = useState<TAccessiblePamAccount | null>(null);

  const accountsRoute = {
    to: "/organizations/$orgId/pam/accounts",
    params: { orgId }
  } as const;

  const handleDeleteAccount = () => {
    const { accountId, accountType } = popUp.deleteAccount.data as {
      accountId: string;
      accountType: PamAccountType;
    };

    deleteAccount.mutate(
      { accountId, accountType },
      {
        onSuccess: () => {
          createNotification({ text: "Account deleted", type: "success" });
          handlePopUpClose("deleteAccount");
        }
      }
    );
  };

  const handleDeleteFolder = () => {
    deleteFolder.mutate(
      { folderId },
      {
        onSuccess: () => {
          createNotification({ text: "Folder deleted", type: "success" });
          handlePopUpClose("deleteFolder");
          navigate(accountsRoute);
        }
      }
    );
  };

  const selectedTypeName = accountTypes.find((meta) => meta.type === selectedAccountType)?.name;
  const hasActiveFilters = Boolean(query || selectedAccountType);
  const isLoading = isLoadingFolders || isLoadingAccounts;

  let emptyTitle = "No accounts in this folder";
  let emptyDescription = "Ask your PAM admin to grant you access to an account in this folder.";
  if (hasActiveFilters) {
    emptyTitle = "No accounts match your filters";
    emptyDescription = "Try adjusting your search or filters.";
  } else if (canCreateAccounts) {
    emptyDescription = "Add an account to this folder to get started.";
  }

  if (!isLoadingFolders && !folder) {
    return (
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <Empty className="mt-4 border">
          <EmptyHeader>
            <EmptyTitle>Folder not found</EmptyTitle>
            <EmptyDescription>
              This folder no longer exists, or you don&apos;t have access to it.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm" asChild>
              <Link {...accountsRoute}>Back to Accounts</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="mx-auto mb-6 w-full max-w-8xl">
      <Helmet>
        <title>{t("common.head-title", { title: folder?.name ?? "Folder" })}</title>
      </Helmet>

      <PageHeader
        title="Accounts"
        description="Access and manage privileged accounts."
        scope={ProjectType.PAM}
        icon={FolderOpen}
      />

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>
            Accounts
            <DocumentationLinkBadge href={PamDocsUrls.accounts.overview} />
            <AccountsBreadcrumb orgId={orgId} folderName={folder?.name} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  variant="ghost"
                  size="xs"
                  aria-label="Folder options"
                  className="ml-1.5 text-muted"
                >
                  <MoreHorizontal className="size-4" />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={4} className="min-w-48">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <DropdownMenuItem
                        isDisabled={!configureTab}
                        onClick={() => configureTab && setFolderSheetTab(configureTab.value)}
                      >
                        <Settings />
                        Configure
                      </DropdownMenuItem>
                    </div>
                  </TooltipTrigger>
                  {!configureTab && arePermissionsResolved && (
                    <TooltipContent side="right">
                      You don&apos;t have permission to configure this folder
                    </TooltipContent>
                  )}
                </Tooltip>
                <DropdownMenuSeparator />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <DropdownMenuItem
                        variant="danger"
                        isDisabled={!canDeleteFolder}
                        onClick={() => handlePopUpOpen("deleteFolder")}
                      >
                        <Trash2 />
                        Delete Folder
                      </DropdownMenuItem>
                    </div>
                  </TooltipTrigger>
                  {!canDeleteFolder && arePermissionsResolved && (
                    <TooltipContent side="right">
                      You don&apos;t have permission to delete this folder
                    </TooltipContent>
                  )}
                </Tooltip>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardTitle>
          <CardDescription>
            Launch sessions for accounts you have access to, or manage account settings.
          </CardDescription>
          <CardAction>
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <IconButton
                        variant="outline"
                        aria-label="Filter by account type"
                        className={selectedAccountType ? "text-product-pam" : undefined}
                      >
                        <Filter />
                      </IconButton>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent>{selectedTypeName ?? "Filter by account type"}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end" sideOffset={4} className="min-w-48">
                  <DropdownMenuLabel>Account type</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={selectedAccountType || "all"}
                    onValueChange={(val) => setSelectedAccountType(val === "all" ? "" : val)}
                  >
                    <DropdownMenuRadioItem value="all">All types</DropdownMenuRadioItem>
                    {accountTypes.map((meta) => (
                      <DropdownMenuRadioItem key={meta.type} value={meta.type}>
                        <img
                          src={`/images/integrations/${meta.icon}`}
                          alt={meta.name}
                          className="size-4 rounded-sm"
                        />
                        {meta.name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <InputGroup className="w-64">
                <InputGroupAddon align="inline-start">
                  <Search />
                </InputGroupAddon>
                <InputGroupInput
                  placeholder="Search accounts..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </InputGroup>

              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={canCreateAccounts ? undefined : "cursor-not-allowed"}>
                    <Button
                      variant="pam"
                      isDisabled={!canCreateAccounts}
                      onClick={() => handlePopUpOpen("createAccount")}
                    >
                      <Plus />
                      Add Account
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {canCreateAccounts || !arePermissionsResolved
                    ? "Add an account to this folder"
                    : "You don't have permission to create accounts in this folder"}
                </TooltipContent>
              </Tooltip>
            </div>
          </CardAction>
        </CardHeader>

        {isLoading && (
          <CardContent>
            <div className="flex flex-col gap-3">
              {SKELETON_KEYS.map((key) => (
                <Skeleton key={key} className="h-10 w-full rounded-md" />
              ))}
            </div>
          </CardContent>
        )}

        {!isLoading && accounts.length === 0 && (
          <CardContent>
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>{emptyTitle}</EmptyTitle>
                <EmptyDescription>{emptyDescription}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        )}

        {!isLoading && accounts.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <FolderAccountRow
                  key={account.id}
                  account={account}
                  search={debouncedSearch}
                  onOpenAccount={(id, tab) => accountSheet.openSheet(id, tab)}
                  onLaunchAccount={setLaunchAccount}
                  onRequestAccess={setRequestAccount}
                  onDeleteAccount={(accountId, accountName, accountType) =>
                    handlePopUpOpen("deleteAccount", { accountId, accountName, accountType })
                  }
                />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <CreateAccountSheet
        isOpen={popUp.createAccount.isOpen}
        defaultFolderId={folderId}
        isFolderLocked
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("createAccount");
        }}
        onCreated={(accountId) => accountSheet.openSheet(accountId)}
      />

      <AccountDetailSheet
        isOpen={accountSheet.isOpen}
        accountId={accountSheet.selectedId}
        onOpenChange={(open) => {
          if (!open) accountSheet.closeSheet();
        }}
      />

      <FolderDetailSheet
        isOpen={Boolean(folderSheetTab)}
        folder={folder}
        activeTab={folderSheetTab}
        onTabChange={(tab) => setFolderSheetTab(tab as PamSheetTab)}
        onOpenChange={(open) => {
          if (!open) setFolderSheetTab(undefined);
        }}
      />

      <DeleteAccountModal
        isOpen={popUp.deleteAccount.isOpen}
        accountName={
          (popUp.deleteAccount.data as { accountName: string } | undefined)?.accountName ?? ""
        }
        accountType={
          (popUp.deleteAccount.data as { accountType: PamAccountType } | undefined)?.accountType
        }
        isLoading={deleteAccount.isPending}
        onConfirm={handleDeleteAccount}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("deleteAccount");
        }}
      />

      <DeleteFolderModal
        isOpen={popUp.deleteFolder.isOpen}
        folderName={folder?.name ?? ""}
        accountCount={folder?.accountCount}
        isLoading={deleteFolder.isPending}
        onConfirm={handleDeleteFolder}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("deleteFolder");
        }}
      />

      <LaunchSessionSheet
        account={launchAccount}
        isOpen={launchAccount !== null}
        onOpenChange={(open) => {
          if (!open) setLaunchAccount(null);
        }}
      />

      <RequestAccessSheet
        account={requestAccount}
        isOpen={!!requestAccount}
        onOpenChange={(open) => {
          if (!open) setRequestAccount(null);
        }}
      />
    </div>
  );
};
