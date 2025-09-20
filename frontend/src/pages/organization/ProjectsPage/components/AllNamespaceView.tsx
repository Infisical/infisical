import { useState } from "react";
import {
  faArrowDownAZ,
  faBorderAll,
  faCheck,
  faFolderOpen,
  faList,
  faMagnifyingGlass,
  faPlus
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { twMerge } from "tailwind-merge";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Button,
  IconButton,
  Input,
  Pagination,
  Skeleton,
  Tooltip
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, usePagination, useResetPageHelper } from "@app/hooks";
import { namespacesQueryKeys, SearchNamespaceSortBy, TNamespace } from "@app/hooks/api/namespaces";
import { NamespaceListToggle, NamespaceListView } from "./NamespacetListToggle";

type Props = {
  onAddNewNamespace: () => void;
  onUpgradePlan: () => void;
  isAddingNamespacesAllowed: boolean;
  namespaceListView: NamespaceListView;
  onNamespaceListViewChange: (value: NamespaceListView) => void;
};

export const AllNamespaceView = ({
  onAddNewNamespace,
  onUpgradePlan,
  isAddingNamespacesAllowed,
  namespaceListView,
  onNamespaceListViewChange
}: Props) => {
  const navigate = useNavigate();
  const [searchFilter, setSearchFilter] = useState("");
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
  } = usePagination("name", {
    initPerPage: getUserTablePreference("allNamespacesTable", PreferenceKey.PerPage, 50)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("allNamespacesTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data: searchedNamespaces, isPending: isNamespaceLoading } = useQuery(
    namespacesQueryKeys.search({
      limit,
      offset,
      name: debouncedSearch || undefined,
      orderDirection,
      orderBy: SearchNamespaceSortBy.NAME
    })
  );

  useResetPageHelper({
    setPage,
    offset,
    totalCount: searchedNamespaces?.totalCount || 0
  });

  return (
    <div>
      <div className="flex w-full flex-row">
        <NamespaceListToggle value={namespaceListView} onChange={onNamespaceListViewChange} />
        <Input
          className="h-[2.3rem] bg-mineshaft-800 text-sm placeholder-mineshaft-50 duration-200 focus:bg-mineshaft-700/80"
          containerClassName="w-full ml-2"
          placeholder="Search by namespace name..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        />
        <div className="ml-2 flex rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
          <Tooltip content="Toggle Sort Direction">
            <IconButton
              className="min-w-[2.4rem] border-none hover:bg-mineshaft-600"
              ariaLabel="Sort asc"
              variant="plain"
              size="xs"
              colorSchema="secondary"
              onClick={toggleOrderDirection}
            >
              <FontAwesomeIcon icon={faArrowDownAZ} />
            </IconButton>
          </Tooltip>
        </div>
        <div className="ml-2 flex gap-x-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
          <Tooltip content="Disabled across All Namespace view.">
            <div className="flex cursor-not-allowed items-center justify-center">
              <IconButton
                variant="outline_bg"
                ariaLabel="grid"
                size="xs"
                isDisabled
                className="pointer-events-none min-w-[2.4rem] border-none bg-transparent hover:bg-mineshaft-600"
              >
                <FontAwesomeIcon icon={faBorderAll} />
              </IconButton>
            </div>
          </Tooltip>
          <IconButton
            variant="outline_bg"
            ariaLabel="list"
            size="xs"
            className="min-w-[2.4rem] border-none bg-mineshaft-500 hover:bg-mineshaft-600"
          >
            <FontAwesomeIcon icon={faList} />
          </IconButton>
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
              className="ml-2"
            >
              Add New Namespace
            </Button>
          )}
        </OrgPermissionCan>
      </div>
      <div className="mt-4 w-full rounded-md">
        {isNamespaceLoading &&
          Array.apply(0, Array(3)).map((_x, i) => (
            <div
              key={`namespace-cards-loading-${i + 1}`}
              className={twMerge(
                "flex h-12 min-w-72 cursor-pointer flex-row items-center justify-between border border-mineshaft-600 bg-mineshaft-800 px-6 hover:bg-mineshaft-700",
                i === 0 && "rounded-t-md",
                i === 2 && "rounded-b-md border-b"
              )}
            >
              <Skeleton className="w-full bg-mineshaft-600" />
            </div>
          ))}
        {!isNamespaceLoading &&
          searchedNamespaces?.namespaces?.map((namespace: TNamespace & { isMember: boolean }) => (
            <div
              role="button"
              tabIndex={0}
              onKeyDown={(evt) => {
                if (evt.key === "Enter" && namespace.isMember) {
                  navigate({
                    to: `/organization/namespaces/${namespace.name}`,
                    params: {
                      namespaceId: namespace.id
                    }
                  });
                }
              }}
              onClick={() => {
                if (namespace.isMember) {
                  navigate({
                    to: `/organization/namespaces/${namespace.name}`,
                    params: {
                      namespaceId: namespace.id
                    }
                  });
                }
              }}
              key={namespace.id}
              className={twMerge(
                "group flex min-w-72 items-center justify-center border-l border-r border-t border-mineshaft-600 bg-mineshaft-800 px-6 py-3 first:rounded-t-md",
                namespace.isMember ? "cursor-pointer hover:bg-mineshaft-700" : "cursor-default"
              )}
            >
              <div className="mr-3 flex min-w-0 flex-1 items-center gap-3">
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
              {namespace.isMember && (
                <Badge className="flex items-center" variant="success">
                  <FontAwesomeIcon icon={faCheck} className="mr-1" />
                  <span>Member</span>
                </Badge>
              )}
            </div>
          ))}
      </div>
      {!isNamespaceLoading && Boolean(searchedNamespaces?.totalCount) && (
        <Pagination
          className="rounded-b-md border border-mineshaft-600"
          perPage={perPage}
          perPageList={[12, 24, 48, 96]}
          count={searchedNamespaces?.totalCount || 0}
          page={page}
          onChangePage={setPage}
          onChangePerPage={handlePerPageChange}
        />
      )}
      {!isNamespaceLoading && !searchedNamespaces?.totalCount && (
        <div className="mt-4 w-full rounded-md border border-mineshaft-700 bg-mineshaft-800 px-4 py-6 text-base text-mineshaft-300">
          <FontAwesomeIcon
            icon={faFolderOpen}
            className="mb-4 mt-2 w-full text-center text-5xl text-mineshaft-400"
          />
          <div className="text-center font-light">No Namespaces Found</div>
        </div>
      )}
    </div>
  );
};
