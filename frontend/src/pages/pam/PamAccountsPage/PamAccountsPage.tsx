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
  useListAccessiblePamFolders,
  useListPamAccountTemplates,
  useListPamAccountTypes,
  useListPamFoldersAdmin
} from "@app/hooks/api/pam";
import { ProjectType } from "@app/hooks/api/projects/types";
import { usePamSheetState } from "@app/hooks/usePamSheetState";
import { usePopUp } from "@app/hooks/usePopUp";

import { PamDocsUrls } from "../pam-docs-urls";
import { AccountPlatformIcon } from "../PamAccessPage/components/AccountPlatformIcon";
import { FolderAccountGroup } from "../PamAccessPage/components/FolderAccountGroup";
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
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [selectedAccountType, setSelectedAccountType] = useState<string>("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [resultCounts, setResultCounts] = useState<Record<string, number>>({});

  // Check user capabilities to determine admin vs regular user view
  const { data: capabilities, isLoading: isLoadingCapabilities } = useGetPamAccessCapabilities();
  const isAdmin = Boolean(capabilities?.isProductAdmin || capabilities?.isResourceAdmin);

  // Admin users see all folders; regular users see only accessible folders
  // Only enable the relevant hook once capabilities are loaded to avoid duplicate/failing requests
  const capabilitiesLoaded = !isLoadingCapabilities && capabilities !== undefined;
  const { data: adminFolders = [], isLoading: isLoadingAdminFolders } = useListPamFoldersAdmin(
    undefined,
    { enabled: capabilitiesLoaded && isAdmin }
  );
  const { data: userFolders = [], isLoading: isLoadingUserFolders } = useListAccessiblePamFolders({
    enabled: capabilitiesLoaded && !isAdmin
  });
  const isLoadingFolders =
    isLoadingCapabilities || (isAdmin ? isLoadingAdminFolders : isLoadingUserFolders);

  // Fetch folders where user can create accounts (for "Add Account" button visibility)
  const { data: creatableFolders = [] } = useListPamFoldersAdmin(
    { filterByAction: PamResourcePermissionActions.CreateAccounts },
    { enabled: capabilitiesLoaded && isAdmin }
  );

  // Admin: filter by templates; Users: filter by account types
  const { data: templates = [] } = useListPamAccountTemplates();
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
  // Admin uses template filter; regular users use account type filter
  const filterActive = isAdmin
    ? Boolean(query || selectedTemplateId)
    : Boolean(query || selectedAccountType);
  const hasActiveFilters = isAdmin
    ? Boolean(query || selectedFolderId || selectedTemplateId)
    : Boolean(query || selectedFolderId || selectedAccountType);

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
  }, [query, selectedTemplateId, selectedAccountType]);

  // Compute visible folders separately for admin and user views (for proper typing)
  const visibleAdminFolders = selectedFolderId
    ? adminFolders.filter((folder) => folder.id === selectedFolderId)
    : adminFolders;

  // For regular users, only show folders that have accounts they can access
  const nonEmptyUserFolders = userFolders.filter((folder) => folder.accountCount > 0);
  const visibleUserFolders = selectedFolderId
    ? nonEmptyUserFolders.filter((folder) => folder.id === selectedFolderId)
    : nonEmptyUserFolders;

  // For folder dropdown, use the appropriate list
  const folderDropdownOptions = isAdmin ? adminFolders : nonEmptyUserFolders;

  const isFolderOpen = (folderId: string) =>
    filterActive || folderId === selectedFolderId || expandedFolders.has(folderId);

  const visibleFolderCount = isAdmin ? visibleAdminFolders.length : visibleUserFolders.length;
  const visibleFolders = isAdmin ? visibleAdminFolders : visibleUserFolders;
  const filterSettled = visibleFolders.every((f) => resultCounts[f.id] !== undefined);
  const filterHasMatches = visibleFolders.some((f) => (resultCounts[f.id] ?? 0) > 0);
  const showNoMatches = filterActive && filterSettled && !filterHasMatches;
  const showEmpty = !isLoadingFolders && (visibleFolderCount === 0 || showNoMatches);

  // Compute empty state messages to avoid nested ternaries
  let emptyTitle: string;
  let emptyDescription: string;
  if (hasActiveFilters) {
    emptyTitle = "No accounts match your filters";
    emptyDescription = "Try adjusting your search or filters.";
  } else if (isAdmin) {
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
          {isAdmin && (creatableFolders.length > 0 || capabilities?.isProductAdmin) && (
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

          {isAdmin ? (
            <Select
              value={selectedTemplateId}
              onValueChange={(val) => setSelectedTemplateId(val === "all" ? "" : val)}
            >
              <SelectTrigger>
                {!selectedTemplateId && <Layers className="mr-1.5 size-4 text-muted" />}
                <SelectValue placeholder="All templates" />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="all">All templates</SelectItem>
                {templates.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    <span className="flex items-center gap-1.5">
                      <AccountPlatformIcon accountType={tpl.type} size={16} />
                      {tpl.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
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
          )}
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
              {isAdmin
                ? visibleAdminFolders.map((folder) => (
                    <FolderAccountRows
                      key={folder.id}
                      folder={folder}
                      isOpen={isFolderOpen(folder.id)}
                      onToggle={() => toggleFolder(folder.id)}
                      search={searchInput}
                      templateId={selectedTemplateId}
                      filterActive={filterActive}
                      onOpenAccount={(id, tab) => accountSheet.openSheet(id, tab)}
                      onLaunchAccount={setLaunchAccount}
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
                  ))
                : visibleUserFolders.map((folder) => (
                    <FolderAccountGroup
                      key={folder.id}
                      folder={folder}
                      isOpen={isFolderOpen(folder.id)}
                      onToggle={() => toggleFolder(folder.id)}
                      search={searchInput}
                      accountType={selectedAccountType}
                      filterActive={filterActive}
                      onLaunch={setLaunchAccount}
                      onRequestAccess={setRequestAccount}
                      onResultCount={handleResultCount}
                    />
                  ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Admin-only modals and sheets */}
      {isAdmin && (
        <>
          <CreateAccountSheet
            isOpen={popUp.createAccount.isOpen}
            defaultFolderId={
              (popUp.createAccount.data as { folderId?: string } | undefined)?.folderId
            }
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
            folder={adminFolders.find((f) => f.id === folderSheet.selectedId)}
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
        </>
      )}

      {/* Shared components */}
      <LaunchSessionSheet
        account={launchAccount}
        isOpen={launchAccount !== null}
        onOpenChange={(open) => {
          if (!open) setLaunchAccount(null);
        }}
      />

      {/* User-only components */}
      {!isAdmin && (
        <RequestAccessSheet
          account={requestAccount}
          isOpen={!!requestAccount}
          onOpenChange={(open) => {
            if (!open) setRequestAccount(null);
          }}
        />
      )}
    </div>
  );
};
