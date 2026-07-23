import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { ChevronDown, FolderOpen, FolderPlus, Layers, Plus, Search } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { PageHeader } from "@app/components/v2";
import {
  Button,
  ButtonGroup,
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
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import {
  PamAccountType,
  PamResourcePermissionActions,
  TAccessiblePamAccount,
  useDeletePamAccount,
  useDeletePamFolder,
  useGetPamAccessCapabilities,
  useListPamAccountTypes,
  useListPamFoldersAdmin
} from "@app/hooks/api/pam";
import { ProjectType } from "@app/hooks/api/projects/types";
import { usePamSheetState } from "@app/hooks/usePamSheetState";
import { usePopUp } from "@app/hooks/usePopUp";

import { PamDocsUrls } from "../pam-docs-urls";
import { LaunchSessionSheet } from "../PamAccessPage/components/LaunchSessionSheet";
import { RequestAccessSheet } from "../PamAccessPage/components/RequestAccessSheet";
import { AccountDetailSheet } from "./components/AccountDetailSheet";
import { CreateAccountSheet } from "./components/CreateAccountSheet";
import { CreateFolderModal } from "./components/CreateFolderModal";
import { DeleteAccountModal } from "./components/DeleteAccountModal";
import { DeleteFolderModal } from "./components/DeleteFolderModal";
import { FolderAccountRows } from "./components/FolderAccountRows";
import { FolderDetailSheet } from "./components/FolderDetailSheet";

const SKELETON_KEYS = ["s1", "s2", "s3", "s4", "s5"];

export const PamAccountsPage = () => {
  const { t } = useTranslation();
  const [searchInput, setSearchInput] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");
  const [selectedAccountType, setSelectedAccountType] = useState<string>("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [resultCounts, setResultCounts] = useState<Record<string, number>>({});

  // Every role sees the same folder/account structure; permissions only disable actions on a row,
  // never hide it. Capabilities just drive the create affordances and the empty-state copy.
  const { data: capabilities } = useGetPamAccessCapabilities();

  // Backed by ReadAccounts/ReadFolder, so every role gets its visible subset (not a 403).
  const { data: folders = [], isLoading: isLoadingFolders } = useListPamFoldersAdmin();

  // Folders where the user can create accounts — gates the "Add Account" affordance.
  const { data: creatableFolders = [] } = useListPamFoldersAdmin({
    filterByAction: PamResourcePermissionActions.CreateAccounts
  });
  const canManage = creatableFolders.length > 0 || Boolean(capabilities?.isProductAdmin);

  // Both admin and regular users filter by account type for a consistent view
  const { data: accountTypes = [] } = useListPamAccountTypes();

  const deleteAccount = useDeletePamAccount();
  const deleteFolder = useDeletePamFolder();

  // For regular users - request access flow
  const [requestAccount, setRequestAccount] = useState<TAccessiblePamAccount | null>(null);

  const { popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "createAccount",
    "deleteAccount",
    "createFolder",
    "deleteFolder"
  ] as const);

  const accountSheet = usePamSheetState("accountId");
  const folderSheet = usePamSheetState("folderId");

  const [launchAccount, setLaunchAccount] = useState<TAccessiblePamAccount | null>(null);

  const query = searchInput.trim();
  // Active filters force-open every folder so matches surface; otherwise folders load lazily on open
  const filterActive = Boolean(query || selectedAccountType);
  const hasActiveFilters = Boolean(query || selectedFolderId || selectedAccountType);

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const handleResultCount = useCallback((folderId: string, count: number) => {
    setResultCounts((prev) => (prev[folderId] === count ? prev : { ...prev, [folderId]: count }));
  }, []);

  // Reset result counts when filters change so folder groups recompute counts for new filter
  useEffect(() => {
    setResultCounts({});
  }, [query, selectedAccountType]);

  const visibleFolders = selectedFolderId
    ? folders.filter((folder) => folder.id === selectedFolderId)
    : folders;
  const folderDropdownOptions = folders;

  const isFolderOpen = (folderId: string) =>
    filterActive || folderId === selectedFolderId || expandedFolders.has(folderId);

  const filterSettled = visibleFolders.every((f) => resultCounts[f.id] !== undefined);
  const filterHasMatches = visibleFolders.some((f) => (resultCounts[f.id] ?? 0) > 0);
  const showNoMatches = filterActive && filterSettled && !filterHasMatches;
  const showEmpty = !isLoadingFolders && (visibleFolders.length === 0 || showNoMatches);

  // Compute empty state messages to avoid nested ternaries
  let emptyTitle: string;
  let emptyDescription: string;
  if (hasActiveFilters) {
    emptyTitle = "No accounts match your filters";
    emptyDescription = "Try adjusting your search or filters.";
  } else if (canManage) {
    emptyTitle = "No accounts yet";
    emptyDescription =
      "Create your first account to get started. You'll need at least one account template.";
  } else {
    emptyTitle = "No accounts available";
    emptyDescription = "Ask your PAM admin to grant you access to a folder or account.";
  }

  const handleDelete = () => {
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
    const { folderId } = popUp.deleteFolder.data as { folderId: string };

    deleteFolder.mutate(
      { folderId },
      {
        onSuccess: () => {
          createNotification({ text: "Folder deleted", type: "success" });
          handlePopUpClose("deleteFolder");
        }
      }
    );
  };

  return (
    <div className="mx-auto mb-6 w-full max-w-8xl">
      <Helmet>
        <title>{t("common.head-title", { title: "Accounts" })}</title>
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
          </CardTitle>
          <CardDescription>
            Launch sessions for accounts you have access to, or manage account settings.
          </CardDescription>
          {canManage && (
            <CardAction>
              <ButtonGroup>
                {creatableFolders.length > 0 && (
                  <Button
                    variant="pam"
                    className={capabilities?.isProductAdmin ? "rounded-r-none" : ""}
                    onClick={() => handlePopUpOpen("createAccount")}
                  >
                    <Plus />
                    Add Account
                  </Button>
                )}
                {capabilities?.isProductAdmin && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton
                        variant="pam"
                        aria-label="More create options"
                        className={creatableFolders.length > 0 ? "border-l-transparent" : ""}
                      >
                        <ChevronDown />
                      </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      sideOffset={4}
                      className="min-w-48"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenuLabel>New</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => handlePopUpOpen("createFolder")}>
                        <FolderPlus />
                        Add Folder
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </ButtonGroup>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <InputGroup className="flex-1">
            <InputGroupAddon align="inline-start">
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search accounts..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </InputGroup>

          <Select
            value={selectedFolderId}
            onValueChange={(val) => setSelectedFolderId(val === "all" ? "" : val)}
          >
            <SelectTrigger>
              <FolderOpen className="mr-1.5 size-4 text-muted" />
              <SelectValue placeholder="All folders" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="all">All folders</SelectItem>
              {folderDropdownOptions.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  {folder.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={selectedAccountType}
            onValueChange={(val) => setSelectedAccountType(val === "all" ? "" : val)}
          >
            <SelectTrigger>
              {!selectedAccountType && <Layers className="mr-1.5 size-4 text-muted" />}
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent position="popper" align="end" sideOffset={4}>
              <SelectItem value="all">All types</SelectItem>
              {accountTypes.map((meta) => (
                <SelectItem key={meta.type} value={meta.type}>
                  <img
                    src={`/images/integrations/${meta.icon}`}
                    alt={meta.name}
                    className="mr-1.5 inline-block size-4 rounded-sm"
                  />
                  {meta.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>

        {isLoadingFolders && (
          <CardContent>
            <div className="flex flex-col gap-3">
              {SKELETON_KEYS.map((key) => (
                <Skeleton key={key} className="h-10 w-full rounded-md" />
              ))}
            </div>
          </CardContent>
        )}

        {showEmpty && (
          <CardContent>
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>{emptyTitle}</EmptyTitle>
                <EmptyDescription>{emptyDescription}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        )}

        {!isLoadingFolders && !showEmpty && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleFolders.map((folder) => (
                <FolderAccountRows
                  key={folder.id}
                  folder={folder}
                  isOpen={isFolderOpen(folder.id)}
                  onToggle={() => toggleFolder(folder.id)}
                  search={searchInput}
                  accountType={selectedAccountType}
                  filterActive={filterActive}
                  onOpenAccount={(id, tab) => accountSheet.openSheet(id, tab)}
                  onLaunchAccount={setLaunchAccount}
                  onRequestAccess={setRequestAccount}
                  onDeleteAccount={(accountId, accountName, accountType) =>
                    handlePopUpOpen("deleteAccount", { accountId, accountName, accountType })
                  }
                  onOpenFolder={(tab) => folderSheet.openSheet(folder.id, tab)}
                  onFolderAddAccount={() =>
                    handlePopUpOpen("createAccount", { folderId: folder.id })
                  }
                  onFolderDelete={() =>
                    handlePopUpOpen("deleteFolder", {
                      folderId: folder.id,
                      folderName: folder.name,
                      accountCount: folder.accountCount
                    })
                  }
                  onResultCount={handleResultCount}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Modals and sheets are rendered for every role; their contents are permission-gated
          internally, and the actions that open them are disabled when the user lacks access. */}
      <CreateAccountSheet
        isOpen={popUp.createAccount.isOpen}
        defaultFolderId={(popUp.createAccount.data as { folderId?: string } | undefined)?.folderId}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("createAccount");
        }}
        onCreated={(accountId) => accountSheet.openSheet(accountId)}
      />

      <CreateFolderModal
        isOpen={popUp.createFolder.isOpen}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("createFolder");
        }}
      />

      <AccountDetailSheet
        isOpen={accountSheet.isOpen}
        accountId={accountSheet.selectedId}
        onOpenChange={(open) => {
          if (!open) accountSheet.closeSheet();
        }}
      />

      <FolderDetailSheet
        isOpen={folderSheet.isOpen}
        folder={folders.find((f) => f.id === folderSheet.selectedId)}
        activeTab={folderSheet.tab}
        onTabChange={folderSheet.setTab}
        onOpenChange={(open) => {
          if (!open) folderSheet.closeSheet();
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
        onConfirm={handleDelete}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("deleteAccount");
        }}
      />

      <DeleteFolderModal
        isOpen={popUp.deleteFolder.isOpen}
        folderName={
          (popUp.deleteFolder.data as { folderName: string } | undefined)?.folderName ?? ""
        }
        accountCount={
          (popUp.deleteFolder.data as { accountCount: number } | undefined)?.accountCount
        }
        isLoading={deleteFolder.isPending}
        onConfirm={handleDeleteFolder}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("deleteFolder");
        }}
      />

      {/* Shared components */}
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
