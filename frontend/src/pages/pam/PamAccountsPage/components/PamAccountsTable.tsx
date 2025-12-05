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
  TableSkeleton,
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
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  PAM_RESOURCE_TYPE_MAP,
  PamAccountOrderBy,
  PamAccountView,
  PamResourceType,
  TPamAccount,
  TPamFolder
} from "@app/hooks/api/pam";
import { useListPamAccounts, useListPamResources } from "@app/hooks/api/pam/queries";

import { AccountViewToggle } from "./AccountViewToggle";
import { FolderBreadCrumbs } from "./FolderBreadCrumbs";
import { PamAccessAccountModal } from "./PamAccessAccountModal";
import { PamAccountRow } from "./PamAccountRow";
import { PamAddAccountModal } from "./PamAddAccountModal";
import { PamAddFolderModal } from "./PamAddFolderModal";
import { PamDeleteAccountModal } from "./PamDeleteAccountModal";
import { PamDeleteFolderModal } from "./PamDeleteFolderModal";
import { PamFolderRow } from "./PamFolderRow";
import { PamUpdateAccountModal } from "./PamUpdateAccountModal";
import { PamUpdateFolderModal } from "./PamUpdateFolderModal";
import { useAccessAwsIamAccount } from "./useAccessAwsIamAccount";

type PamAccountFilter = {
  resourceIds: string[];
};

type Props = {
  projectId: string;
};

export const PamAccountsTable = ({ projectId }: Props) => {
  const navigate = useNavigate({ from: ROUTE_PATHS.Pam.AccountsPage.path });
  const { accessAwsIam, loadingAccountId } = useAccessAwsIamAccount();

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

  const [accountView, setAccountView] = useState<PamAccountView>(
    initAccountView ?? PamAccountView.Flat
  );

  const [filter, setFilter] = useState<PamAccountFilter>({
    resourceIds: []
  });

  const {
    search,
    debouncedSearch,
    setSearch,
    page,
    perPage,
    setPage,
    setPerPage,
    offset,
    orderDirection,
    toggleOrderDirection,
    orderBy,
    setOrderDirection,
    setOrderBy
  } = usePagination<PamAccountOrderBy>(PamAccountOrderBy.Name, {
    initPerPage: getUserTablePreference("pamAccountsTable", PreferenceKey.PerPage, 20),
    initSearch
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("pamAccountsTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data, isLoading } = useListPamAccounts({
    projectId,
    accountPath,
    accountView,
    offset,
    limit: perPage,
    search: debouncedSearch,
    orderBy,
    orderDirection,
    filterResourceIds: filter.resourceIds.length ? filter.resourceIds.join(",") : undefined
  });

  const accounts = data?.accounts || [];
  const folders = data?.folders || [];
  const totalCount = data?.totalCount || 0;
  const folderPaths = data?.folderPaths || {};
  const currentFolderId = data?.folderId ?? null;

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  const foldersToRender = useMemo(() => {
    if (accountView === PamAccountView.Flat) {
      return [];
    }
    return folders.filter((folder) =>
      folder.name.toLowerCase().includes(search.trim().toLowerCase())
    );
  }, [accountView, folders, search]);

  const filteredAccounts = useMemo(
    () =>
      accounts.filter((account) => {
        const {
          name,
          description,
          resource: { name: resourceName, id: resourceId }
        } = account;

        if (filter.resourceIds.length && !filter.resourceIds.includes(resourceId)) {
          return false;
        }

        const searchValue = search.trim().toLowerCase();

        return (
          name.toLowerCase().includes(searchValue) ||
          resourceName.toLowerCase().includes(searchValue) ||
          (description || "").toLowerCase().includes(searchValue)
        );
      }),
    [accounts, search, filter]
  );

  const handleSort = (column: PamAccountOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const getClassName = (col: PamAccountOrderBy) =>
    twMerge("ml-2", orderBy === col ? "" : "opacity-30");

  const getColSortIcon = (col: PamAccountOrderBy) =>
    orderDirection === OrderByDirection.DESC && orderBy === col ? faArrowUp : faArrowDown;

  const isTableFiltered = Boolean(filter.resourceIds.length);

  const handleFolderClick = (folder: TPamFolder) => {
    if (accountView === PamAccountView.Flat) {
      return;
    }
    const newPath = `${accountPath}${folder.name}/`;
    navigate({ search: (prev) => ({ ...prev, accountPath: newPath }) });
  };

  const isContentEmpty = !filteredAccounts.length && !foldersToRender.length;
  const isSearchEmpty = isContentEmpty && (Boolean(search) || isTableFiltered);

  const { data: resourcesData } = useListPamResources({
    projectId,
    // temporarily returning a large number until we rework table filtering
    limit: 100
  });

  const resources = resourcesData?.resources || [];

  return (
    <div>
      {accountView === PamAccountView.Nested && <FolderBreadCrumbs path={accountPath} />}
      <div className="mt-4 flex gap-2">
        <ProjectPermissionCan I={ProjectPermissionActions.Read} a={ProjectPermissionSub.PamFolders}>
          {(isAllowed) =>
            isAllowed && (
              <AccountViewToggle
                value={accountView}
                onChange={(e) => {
                  setPage(1);
                  setFilter({ resourceIds: [] });
                  setAccountView(e);
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      accountView: e === PamAccountView.Flat ? undefined : e,
                      accountPath: e === PamAccountView.Flat ? "/" : prev.accountPath
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
                "flex h-10 min-w-10 items-center justify-center overflow-hidden border border-mineshaft-600 bg-mineshaft-800 p-0 transition-all hover:border-primary/60 hover:bg-primary/10",
                isTableFiltered && "border-primary/50 text-primary"
              )}
            >
              <FontAwesomeIcon icon={faFilter} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-[70vh] thin-scrollbar overflow-y-auto" align="end">
            <DropdownMenuLabel>Resource</DropdownMenuLabel>
            {resources.length ? (
              resources.map((resource) => {
                const { name, image } = PAM_RESOURCE_TYPE_MAP[resource.resourceType];

                return (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      const newResources = filter.resourceIds.includes(resource.id)
                        ? filter.resourceIds.filter((a) => a !== resource.id)
                        : [...filter.resourceIds, resource.id];
                      setFilter((prev) => ({
                        ...prev,
                        resourceIds: newResources
                      }));
                    }}
                    key={resource.id}
                    icon={
                      filter.resourceIds.includes(resource.id) && (
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
                className={`h-10 transition-colors ${accountView === PamAccountView.Flat ? "" : "rounded-r-none"}`}
              >
                Add Account
              </Button>

              {accountView !== PamAccountView.Flat && (
                <DropdownMenu
                  open={popUp.misc.isOpen}
                  onOpenChange={(isOpen) => handlePopUpToggle("misc", isOpen)}
                >
                  <DropdownMenuTrigger asChild>
                    <IconButton
                      variant="outline_bg"
                      ariaLabel="add-folder-or-import"
                      className="rounded-l-none bg-mineshaft-600 p-3"
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
                    className={getClassName(PamAccountOrderBy.Name)}
                    ariaLabel="sort"
                    onClick={() => handleSort(PamAccountOrderBy.Name)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(PamAccountOrderBy.Name)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={2} innerKey="pam-accounts" />}
            {!isLoading && (
              <>
                {accountView !== PamAccountView.Flat &&
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
                {filteredAccounts.map((account) => (
                  <PamAccountRow
                    key={account.id}
                    account={account}
                    search={search}
                    isFlatView={accountView === PamAccountView.Flat}
                    accountPath={account.folderId ? folderPaths[account.folderId] : undefined}
                    isAccessLoading={loadingAccountId === account.id}
                    onAccess={(e: TPamAccount) => {
                      // For AWS IAM, directly open console without modal
                      if (e.resource.resourceType === PamResourceType.AwsIam) {
                        accessAwsIam(e);
                      } else {
                        handlePopUpOpen("accessAccount", e);
                      }
                    }}
                    onUpdate={(e) => handlePopUpOpen("updateAccount", e)}
                    onDelete={(e) => handlePopUpOpen("deleteAccount", e)}
                  />
                ))}
              </>
            )}
          </TBody>
        </Table>
        {Boolean(totalCount) && !isLoading && (
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={(newPage) => setPage(newPage)}
            onChangePerPage={handlePerPageChange}
          />
        )}
        {!isLoading && isContentEmpty && (
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
        currentFolderId={currentFolderId}
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
        currentFolderId={currentFolderId}
      />
    </div>
  );
};
