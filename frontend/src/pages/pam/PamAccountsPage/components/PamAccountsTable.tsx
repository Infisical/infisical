import { useMemo, useState } from "react";
import { faCircleXmark } from "@fortawesome/free-regular-svg-icons";
import {
  faAngleDown,
  faArrowDown,
  faArrowUp,
  faCheckCircle,
  faFilter,
  faFolderPlus,
  faMagnifyingGlass,
  faPlus,
  faSearch
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Input,
  Pagination,
  Table,
  TableContainer,
  TBody,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  ProjectPermissionActions,
  ProjectPermissionPamAccountActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { PAM_RESOURCE_TYPE_MAP, TPamAccount, TPamFolder } from "@app/hooks/api/pam";

import { AccountView, AccountViewToggle } from "./AccountViewToggle";
import { PamAccessAccountModal } from "./PamAccessAccountModal";
import { PamAccountRow } from "./PamAccountRow";
import { PamAddAccountModal } from "./PamAddAccountModal";
import { PamAddFolderModal } from "./PamAddFolderModal";
import { PamDeleteAccountModal } from "./PamDeleteAccountModal";
import { PamDeleteFolderModal } from "./PamDeleteFolderModal";
import { PamFolderRow } from "./PamFolderRow";
import { PamUpdateAccountModal } from "./PamUpdateAccountModal";
import { PamUpdateFolderModal } from "./PamUpdateFolderModal";

enum OrderBy {
  Name = "name"
}

type Filters = {
  resource: string[];
};

type Props = {
  accounts: TPamAccount[];
  folders: TPamFolder[];
  projectId: string;
};

export const PamAccountsTable = ({ accounts, folders, projectId }: Props) => {
  const navigate = useNavigate({ from: ROUTE_PATHS.Pam.AccountsPage.path });

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "misc",
    "addFolder",
    "updateFolder",
    "deleteFolder",
    "addAccount",
    "accessAccount",
    "updateAccount",
    "deleteAccount"
  ] as const);

  const {
    search: initSearch,
    accountPath,
    accountView: initAccountView
  } = useSearch({
    from: ROUTE_PATHS.Pam.AccountsPage.id
  });

  const [accountView, setAccountView] = useState<AccountView>(initAccountView ?? AccountView.Flat);

  const [filters, setFilters] = useState<Filters>({
    resource: []
  });

  const {
    search,
    setSearch,
    setPage,
    page,
    perPage,
    setPerPage,
    offset,
    orderDirection,
    toggleOrderDirection,
    orderBy,
    setOrderDirection,
    setOrderBy
  } = usePagination<OrderBy>(OrderBy.Name, { initPerPage: 20, initSearch });

  const { foldersByParentId, pathMap, folderPaths } = useMemo(() => {
    const foldersById: Record<string, TPamFolder> = {};
    const tempFoldersByParentId: Record<string, TPamFolder[]> = { null: [] };
    const tempPathMap: Record<string, string> = { "/": "null" };
    const tempFolderPaths: Record<string, string> = {};

    folders.forEach((folder) => {
      foldersById[folder.id] = folder;
      if (!tempFoldersByParentId[folder.parentId || "null"]) {
        tempFoldersByParentId[folder.parentId || "null"] = [];
      }
      tempFoldersByParentId[folder.parentId || "null"].push(folder);
    });

    const buildPaths = (parentId: string | null, currentPath: string) => {
      (tempFoldersByParentId[parentId || "null"] || []).forEach((folder) => {
        const newPath = `${currentPath}${folder.name}/`;
        tempPathMap[newPath] = folder.id;
        tempFolderPaths[folder.id] = newPath;
        buildPaths(folder.id, newPath);
      });
    };

    buildPaths(null, "/");

    return {
      foldersByParentId: tempFoldersByParentId,
      pathMap: tempPathMap,
      folderPaths: tempFolderPaths
    };
  }, [folders]);

  const effectiveFolderIdForFiltering = useMemo(() => {
    if (accountView === AccountView.Flat) {
      return null;
    }
    const folderId = pathMap[accountPath];
    return folderId === "null" ? null : folderId || null;
  }, [accountView, accountPath, pathMap]);

  const foldersToRender = useMemo(() => {
    if (accountView === AccountView.Flat) {
      return [];
    }
    return (foldersByParentId[effectiveFolderIdForFiltering || "null"] || []).filter((folder) =>
      folder.name.toLowerCase().includes(search.trim().toLowerCase())
    );
  }, [accountView, effectiveFolderIdForFiltering, foldersByParentId, search]);

  const accountsToProcess = useMemo(() => {
    if (accountView === AccountView.Flat) {
      return accounts;
    }
    return accounts.filter(
      (acc) => (acc.folderId || "null") === (effectiveFolderIdForFiltering || "null")
    );
  }, [accountView, accounts, effectiveFolderIdForFiltering]);

  const filteredAccounts = useMemo(
    () =>
      accountsToProcess
        .filter((account) => {
          const {
            name,
            description,
            resource: { name: resourceName, id: resourceId }
          } = account;

          if (filters.resource.length && !filters.resource.includes(resourceId)) {
            return false;
          }

          const searchValue = search.trim().toLowerCase();
          const path = (account.folderId && folderPaths[account.folderId]) || "";

          return (
            name.toLowerCase().includes(searchValue) ||
            resourceName.toLowerCase().includes(searchValue) ||
            (description || "").toLowerCase().includes(searchValue) ||
            path.toLowerCase().includes(searchValue)
          );
        })
        .sort((a, b) => {
          const [accOne, accTwo] = orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          switch (orderBy) {
            case OrderBy.Name:
            default:
              return accOne.name.toLowerCase().localeCompare(accTwo.name.toLowerCase());
          }
        }),
    [accountsToProcess, orderDirection, search, orderBy, filters, folderPaths]
  );

  useResetPageHelper({
    totalCount: filteredAccounts.length,
    offset,
    setPage
  });

  const currentPageData = useMemo(
    () => filteredAccounts.slice(offset, perPage * page),
    [filteredAccounts, offset, perPage, page]
  );

  const handleSort = (column: OrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const getClassName = (col: OrderBy) => twMerge("ml-2", orderBy === col ? "" : "opacity-30");

  const getColSortIcon = (col: OrderBy) =>
    orderDirection === OrderByDirection.DESC && orderBy === col ? faArrowUp : faArrowDown;

  const isTableFiltered = Boolean(filters.resource.length);

  const handleFolderClick = (folder: TPamFolder) => {
    if (accountView === AccountView.Flat) {
      return;
    }
    const newPath = `${accountPath}${folder.name}/`;
    navigate({ search: (prev) => ({ ...prev, accountPath: newPath }) });
  };

  const isContentEmpty = !filteredAccounts.length && !foldersToRender.length;
  const isSearchEmpty = isContentEmpty && (Boolean(search) || isTableFiltered);

  const uniqueResources = useMemo(() => {
    const resourceMap = new Map<string, TPamAccount["resource"]>();
    accounts.forEach((account) => {
      resourceMap.set(account.resource.id, account.resource);
    });
    return Array.from(resourceMap.values());
  }, [accounts]);

  return (
    <div>
      <div className="mt-4 flex gap-2">
        <ProjectPermissionCan I={ProjectPermissionActions.Read} a={ProjectPermissionSub.PamFolders}>
          {(isAllowed) =>
            isAllowed && (
              <AccountViewToggle
                value={accountView}
                onChange={(e) => {
                  setAccountView(e);
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      accountView: e === AccountView.Flat ? undefined : e,
                      accountPath: e === AccountView.Flat ? "/" : prev.accountPath
                    })
                  });
                }}
              />
            )
          }
        </ProjectPermissionCan>
        <Input
          value={search}
          onChange={(e) => {
            const newSearch = e.target.value;
            setSearch(newSearch);
            navigate({
              search: (prev) => ({ ...prev, search: newSearch || undefined }),
              replace: true
            });
          }}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search accounts..."
          className="flex-1"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              ariaLabel="Filter accounts"
              variant="plain"
              size="sm"
              className={twMerge(
                "border-mineshaft-600 bg-mineshaft-800 hover:border-primary/60 hover:bg-primary/10 flex h-10 min-w-10 items-center justify-center overflow-hidden border p-0 transition-all",
                isTableFiltered && "border-primary/50 text-primary"
              )}
            >
              <FontAwesomeIcon icon={faFilter} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="thin-scrollbar max-h-[70vh] overflow-y-auto" align="end">
            <DropdownMenuLabel>Resource</DropdownMenuLabel>
            {uniqueResources.length ? (
              uniqueResources.map((resource) => {
                const { name, image } = PAM_RESOURCE_TYPE_MAP[resource.resourceType];

                return (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      const newResources = filters.resource.includes(resource.id)
                        ? filters.resource.filter((a) => a !== resource.id)
                        : [...filters.resource, resource.id];
                      setFilters((prev) => ({
                        ...prev,
                        resource: newResources
                      }));
                    }}
                    key={resource.id}
                    icon={
                      filters.resource.includes(resource.id) && (
                        <FontAwesomeIcon className="text-primary" icon={faCheckCircle} />
                      )
                    }
                    iconPos="right"
                  >
                    <div className="flex items-center gap-2">
                      <img
                        alt={`${name} resource`}
                        src={`/images/integrations/${image}`}
                        className="h-4 w-4"
                      />
                      <span>{resource.name}</span>
                    </div>
                  </DropdownMenuItem>
                );
              })
            ) : (
              <DropdownMenuItem isDisabled>No Account Resources</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <ProjectPermissionCan
          I={ProjectPermissionPamAccountActions.Create}
          a={ProjectPermissionSub.PamAccounts}
        >
          {(isAllowedToCreateAccounts) => (
            <div className="flex">
              <Button
                variant="outline_bg"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => handlePopUpOpen("addAccount")}
                isDisabled={!isAllowedToCreateAccounts}
                className={`h-10 transition-colors ${accountView === AccountView.Flat ? "" : "rounded-r-none"}`}
              >
                Add Account
              </Button>

              {accountView !== AccountView.Flat && (
                <DropdownMenu
                  open={popUp.misc.isOpen}
                  onOpenChange={(isOpen) => handlePopUpToggle("misc", isOpen)}
                >
                  <DropdownMenuTrigger asChild>
                    <IconButton
                      variant="outline_bg"
                      ariaLabel="add-folder-or-import"
                      className="bg-mineshaft-600 rounded-l-none p-3"
                    >
                      <FontAwesomeIcon icon={faAngleDown} />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={5}>
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Create}
                      a={ProjectPermissionSub.PamFolders}
                    >
                      {(isAllowed) => (
                        <Button
                          leftIcon={<FontAwesomeIcon icon={faFolderPlus} className="pr-2" />}
                          onClick={() => {
                            handlePopUpOpen("addFolder");
                            handlePopUpClose("misc");
                          }}
                          isDisabled={!isAllowed}
                          variant="outline_bg"
                          className="h-10 text-left"
                          isFullWidth
                        >
                          Add Folder
                        </Button>
                      )}
                    </ProjectPermissionCan>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
        </ProjectPermissionCan>
      </div>
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th>
                <div className="flex items-center">
                  Accounts
                  <IconButton
                    variant="plain"
                    className={getClassName(OrderBy.Name)}
                    ariaLabel="sort"
                    onClick={() => handleSort(OrderBy.Name)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(OrderBy.Name)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {accountView !== AccountView.Flat &&
              foldersToRender.map((folder) => (
                <PamFolderRow
                  key={folder.id}
                  folder={folder}
                  search={search}
                  onClick={() => handleFolderClick(folder)}
                  onUpdate={(e) => handlePopUpOpen("updateFolder", e)}
                  onDelete={(e) => handlePopUpOpen("deleteFolder", e)}
                />
              ))}
            {currentPageData.map((account) => (
              <PamAccountRow
                key={account.id}
                account={account}
                search={search}
                isFlatView={accountView === AccountView.Flat}
                accountPath={
                  account.folderId ? folderPaths[account.folderId]?.slice(0, -1) : undefined
                }
                onAccess={(e) => {
                  handlePopUpOpen("accessAccount", e);
                }}
                onUpdate={(e) => handlePopUpOpen("updateAccount", e)}
                onDelete={(e) => handlePopUpOpen("deleteAccount", e)}
              />
            ))}
          </TBody>
        </Table>
        {Boolean(filteredAccounts.length) && (
          <Pagination
            count={filteredAccounts.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={setPerPage}
          />
        )}
        {isContentEmpty && (
          <EmptyState
            title={isSearchEmpty ? "No accounts match search" : "No accounts"}
            icon={isSearchEmpty ? faSearch : faCircleXmark}
          />
        )}
      </TableContainer>
      <PamDeleteFolderModal
        isOpen={popUp.deleteFolder.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteFolder", isOpen)}
        folder={popUp.deleteFolder.data}
      />
      <PamUpdateFolderModal
        isOpen={popUp.updateFolder.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("updateFolder", isOpen)}
        folder={popUp.updateFolder.data}
      />
      <PamAddFolderModal
        isOpen={popUp.addFolder.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addFolder", isOpen)}
        projectId={projectId}
        currentFolderId={effectiveFolderIdForFiltering}
      />
      <PamAccessAccountModal
        isOpen={popUp.accessAccount.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("accessAccount", isOpen)}
        account={popUp.accessAccount.data}
      />
      <PamDeleteAccountModal
        isOpen={popUp.deleteAccount.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteAccount", isOpen)}
        account={popUp.deleteAccount.data}
      />
      <PamUpdateAccountModal
        isOpen={popUp.updateAccount.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("updateAccount", isOpen)}
        account={popUp.updateAccount.data}
      />
      <PamAddAccountModal
        isOpen={popUp.addAccount.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addAccount", isOpen)}
        projectId={projectId}
        currentFolderId={effectiveFolderIdForFiltering}
      />
    </div>
  );
};
