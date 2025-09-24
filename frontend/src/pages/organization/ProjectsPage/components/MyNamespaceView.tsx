import { ReactNode } from "react";
import { faFolderOpen } from "@fortawesome/free-regular-svg-icons";
import { faArrowDownAZ, faArrowUpZA, faPlus, faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { OrgPermissionCan } from "@app/components/permissions";
import { Button, IconButton, Pagination, Skeleton, Tooltip } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, usePagination, useResetPageHelper } from "@app/hooks";
import { namespacesQueryKeys, SearchNamespaceSortBy, TNamespace } from "@app/hooks/api/namespaces";

import { ResourceViewMode } from "./ResourcetListToggle";

type Props = {
  onAddNewNamespace: () => void;
  onUpgradePlan: () => void;
  isAddingNamespacesAllowed: boolean;
  searchFilter: string;
  resourceViewMode: ResourceViewMode;
};

export const MyNamespaceView = ({
  onAddNewNamespace,
  onUpgradePlan,
  isAddingNamespacesAllowed,
  searchFilter = "",
  resourceViewMode
}: Props) => {
  const navigate = useNavigate();
  const [debouncedSearch] = useDebounce(searchFilter);

  const {
    setPage,
    perPage,
    setPerPage,
    page,
    offset,
    limit,
    toggleOrderDirection,
    orderDirection
  } = usePagination(SearchNamespaceSortBy.NAME, {
    initPerPage: getUserTablePreference("myNamespacesTable", PreferenceKey.PerPage, 1)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("myNamespacesTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data: searchedNamespaces, isPending: isNamespaceLoading } = useQuery({
    ...namespacesQueryKeys.list({
      search: debouncedSearch || undefined,
      limit,
      offset
    }),
    placeholderData: (prev) => prev
  });

  const isNamespaceViewLoading = isNamespaceLoading;
  const isNamespaceEmpty = !isNamespaceViewLoading && searchedNamespaces?.namespaces?.length === 0;

  useResetPageHelper({
    setPage,
    offset,
    totalCount: searchedNamespaces?.totalCount || 0
  });

  const renderNamespaceGridItem = (namespace: TNamespace) => (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          navigate({
            to: "/organization/namespaces/$namespaceName/projects",
            params: {
              namespaceName: namespace.name
            }
          });
        }
      }}
      onClick={() => {
        navigate({
          to: "/organization/namespaces/$namespaceName/projects",
          params: {
            namespaceName: namespace.name
          }
        });
      }}
      key={namespace.id}
      className="cursor-pointer overflow-clip rounded border border-l-[4px] border-mineshaft-600 border-l-mineshaft-400 bg-mineshaft-800 p-4 transition-transform duration-100 hover:scale-[103%] hover:border-l-primary hover:bg-mineshaft-700"
    >
      <div className="mb-2 w-min rounded border border-mineshaft-500 bg-mineshaft-600 p-1.5 shadow-inner">
        <div className="flex h-3 w-3 items-center justify-center">
          <FontAwesomeIcon icon={faFolderOpen} className="text-mineshaft-300" />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-mineshaft-100">{namespace.name}</p>
      </div>
      <p className="mt-2 truncate text-sm text-mineshaft-400">
        {namespace.description || "No description"}
      </p>
    </div>
  );

  const renderNamespaceListItem = (namespace: TNamespace, index: number) => (
    <div
      onClick={() => {
        navigate({
          to: "/organization/namespaces/$namespaceName/projects",
          params: {
            namespaceName: namespace.name
          }
        });
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          navigate({
            to: "/organization/namespaces/$namespaceName/projects",
            params: {
              namespaceName: namespace.name
            }
          });
        }
      }}
      key={namespace.id}
      className={`group flex min-w-72 cursor-pointer border-l border-r border-t border-mineshaft-600 bg-mineshaft-800 px-6 py-3 hover:bg-mineshaft-700 ${
        index === 0 && "rounded-t-md"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="rounded border border-mineshaft-500 bg-mineshaft-600 p-1 shadow-inner">
          <div className="flex h-[1.35rem] w-[1.35rem] items-center justify-center">
            <FontAwesomeIcon icon={faFolderOpen} className="text-mineshaft-300" />
          </div>
        </div>
        <div className="-mt-0.5 flex min-w-0 flex-col">
          <p className="truncate text-sm text-mineshaft-100">{namespace.name}</p>
          <p className="truncate text-xs leading-4 text-mineshaft-300">
            Namespace {namespace.description ? `- ${namespace.description}` : ""}
          </p>
        </div>
      </div>
    </div>
  );

  let namespacesComponents: ReactNode;

  if (searchedNamespaces?.namespaces?.length || isNamespaceViewLoading) {
    switch (resourceViewMode) {
      case ResourceViewMode.GRID:
        namespacesComponents = (
          <div className="mt-4 grid w-full grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {isNamespaceViewLoading &&
              Array.apply(0, Array(3)).map((_x, i) => (
                <div
                  key={`namespace-cards-loading-${i + 1}`}
                  className="flex h-40 min-w-72 flex-col justify-between rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4"
                >
                  <div className="mt-0 text-lg text-mineshaft-100">
                    <Skeleton className="w-3/4 bg-mineshaft-600" />
                  </div>
                  <div className="mt-0 pb-6 text-sm text-mineshaft-300">
                    <Skeleton className="w-1/2 bg-mineshaft-600" />
                  </div>
                  <div className="flex justify-end">
                    <Skeleton className="w-1/2 bg-mineshaft-600" />
                  </div>
                </div>
              ))}
            {!isNamespaceViewLoading &&
              searchedNamespaces?.namespaces?.map((namespace) =>
                renderNamespaceGridItem(namespace)
              )}
          </div>
        );
        break;
      case ResourceViewMode.LIST:
      default:
        namespacesComponents = (
          <div className="mt-4 w-full rounded-md">
            {isNamespaceViewLoading &&
              Array.apply(0, Array(3)).map((_x, i) => (
                <div
                  key={`namespace-cards-loading-${i + 1}`}
                  className={`group flex h-12 min-w-72 cursor-pointer flex-row items-center justify-between border border-mineshaft-600 bg-mineshaft-800 px-6 hover:bg-mineshaft-700 ${
                    i === 0 && "rounded-t-md"
                  } ${i === 2 && "rounded-b-md border-b"}`}
                >
                  <Skeleton className="w-full bg-mineshaft-600" />
                </div>
              ))}
            {!isNamespaceViewLoading &&
              searchedNamespaces?.namespaces?.map((namespace, ind) =>
                renderNamespaceListItem(namespace, ind)
              )}
          </div>
        );
        break;
    }
  } else if (searchedNamespaces?.namespaces?.length === 0 && searchFilter) {
    namespacesComponents = (
      <div className="mt-4 w-full rounded-md border border-mineshaft-700 bg-mineshaft-800 px-4 py-6 text-base text-mineshaft-300">
        <FontAwesomeIcon
          icon={faSearch}
          className="mb-4 mt-2 w-full text-center text-5xl text-mineshaft-400"
        />
        <div className="text-center font-light">No namespaces match search...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex w-full flex-row items-center">
        <div className="mb-2">
          <div className="text-lg font-medium text-white">Namespaces</div>
          <div className="text-sm text-mineshaft-300">
            Organize projects with scoped access control
          </div>
        </div>
        <div className="flex-grow" />
        <div className="ml-2 flex h-10 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
          <Tooltip content="Toggle Sort Direction">
            <IconButton
              className="min-w-[2.4rem] border-none hover:bg-mineshaft-600"
              ariaLabel={`Sort ${orderDirection === "asc" ? "descending" : "ascending"}`}
              variant="plain"
              size="xs"
              colorSchema="secondary"
              onClick={toggleOrderDirection}
            >
              <FontAwesomeIcon icon={orderDirection === "asc" ? faArrowDownAZ : faArrowUpZA} />
            </IconButton>
          </Tooltip>
        </div>
        <OrgPermissionCan I={OrgPermissionActions.Create} an={OrgPermissionSubjects.Namespace}>
          {(isAllowed) => (
            <Button
              isDisabled={!isAllowed}
              colorSchema="secondary"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => {
                if (isAddingNamespacesAllowed) {
                  onAddNewNamespace();
                } else {
                  onUpgradePlan();
                }
              }}
              className="ml-2 h-10"
            >
              Add New Namespace
            </Button>
          )}
        </OrgPermissionCan>
      </div>
      {namespacesComponents}
      {!isNamespaceViewLoading && Boolean(searchedNamespaces?.namespaces?.length) && (
        <Pagination
          className={
            resourceViewMode === ResourceViewMode.GRID
              ? "col-span-full !justify-start border-transparent bg-transparent pl-2"
              : "rounded-b-md border border-mineshaft-600"
          }
          perPage={perPage}
          perPageList={[12, 24, 48, 96]}
          count={searchedNamespaces?.totalCount || 0}
          page={page}
          onChangePage={setPage}
          onChangePerPage={handlePerPageChange}
        />
      )}
      {isNamespaceEmpty && (
        <div className="mt-4 w-full rounded-md border border-mineshaft-700 bg-mineshaft-800 px-4 py-6 text-base text-mineshaft-300">
          <FontAwesomeIcon
            icon={faFolderOpen}
            className="mb-4 mt-2 w-full text-center text-5xl text-mineshaft-400"
          />
          <div className="text-center font-light">
            You are not part of any namespaces in this organization yet. When you are, they will
            appear here.
          </div>
          <div className="mt-0.5 text-center font-light">
            Create a new namespace, or ask other organization members to give you necessary
            permissions.
          </div>
        </div>
      )}
    </div>
  );
};
