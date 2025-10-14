import { ReactNode } from "react";
import { faCubes, faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { Pagination, Skeleton } from "@app/components/v2";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, usePagination, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { namespacesQueryKeys, SearchNamespaceSortBy, TNamespace } from "@app/hooks/api/namespaces";

import { ResourceViewMode } from "./ResourceListToolbar";

type Props = {
  searchValue: string;
  orderDirection: OrderByDirection;
  resourceViewMode: ResourceViewMode;
};

export const MyNamespaceView = ({ resourceViewMode, orderDirection, searchValue }: Props) => {
  const navigate = useNavigate();
  const [debouncedSearch] = useDebounce(searchValue);

  const { setPage, perPage, setPerPage, page, offset, limit } = usePagination(
    SearchNamespaceSortBy.NAME,
    {
      initPerPage: getUserTablePreference("myNamespacesTable", PreferenceKey.PerPage, 1)
    }
  );

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("myNamespacesTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data: searchedNamespaces, isPending: isNamespaceLoading } = useQuery({
    ...namespacesQueryKeys.list({
      search: debouncedSearch || undefined,
      limit,
      offset,
      orderDirection
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
            to: "/organization/namespaces/$namespaceId/projects",
            params: {
              namespaceId: namespace.id
            }
          });
        }
      }}
      onClick={() => {
        navigate({
          to: "/organization/namespaces/$namespaceId/projects",
          params: {
            namespaceId: namespace.id
          }
        });
      }}
      key={namespace.id}
      className="cursor-pointer overflow-clip rounded border border-l-[4px] border-mineshaft-600 border-l-mineshaft-400 bg-mineshaft-800 p-4 transition-transform duration-100 hover:scale-[103%] hover:border-l-primary hover:bg-mineshaft-700"
    >
      <div className="mb-2 w-min rounded border border-mineshaft-500 bg-mineshaft-600 p-1.5 shadow-inner">
        <div className="flex h-3 w-3 items-center justify-center">
          <FontAwesomeIcon icon={faCubes} className="text-mineshaft-300" />
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
          to: "/organization/namespaces/$namespaceId/projects",
          params: {
            namespaceId: namespace.id
          }
        });
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          navigate({
            to: "/organization/namespaces/$namespaceId/projects",
            params: {
              namespaceId: namespace.id
            }
          });
        }
      }}
      key={namespace.id}
      className={`group flex min-w-72 cursor-pointer border-t border-r border-l border-mineshaft-600 bg-mineshaft-800 px-6 py-3 hover:bg-mineshaft-700 ${
        index === 0 && "rounded-t-md"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="rounded border border-mineshaft-500 bg-mineshaft-600 p-1 shadow-inner">
          <div className="flex h-[1.35rem] w-[1.35rem] items-center justify-center">
            <FontAwesomeIcon icon={faCubes} className="text-mineshaft-300" />
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
  } else if (searchedNamespaces?.namespaces?.length === 0 && searchValue) {
    namespacesComponents = (
      <div className="mt-4 w-full rounded-md border border-mineshaft-700 bg-mineshaft-800 px-4 py-6 text-base text-mineshaft-300">
        <FontAwesomeIcon
          icon={faSearch}
          className="mt-2 mb-4 w-full text-center text-5xl text-mineshaft-400"
        />
        <div className="text-center font-light">No namespaces match search...</div>
      </div>
    );
  }

  return (
    <div>
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
            icon={faCubes}
            className="mt-2 mb-4 w-full text-center text-5xl text-mineshaft-400"
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
