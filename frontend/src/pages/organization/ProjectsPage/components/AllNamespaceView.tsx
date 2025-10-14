import { faCheck, faFolderOpen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { Badge, Pagination, Skeleton } from "@app/components/v2";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, usePagination, useResetPageHelper } from "@app/hooks";
import { namespacesQueryKeys, SearchNamespaceSortBy, TNamespace } from "@app/hooks/api/namespaces";
import { OrderByDirection } from "@app/hooks/api/generic/types";

type Props = {
  searchValue: string;
  orderDirection: OrderByDirection;
};

export const AllNamespaceView = ({ orderDirection, searchValue }: Props) => {
  const navigate = useNavigate();
  const [debouncedSearch] = useDebounce(searchValue);
  const { setPage, perPage, setPerPage, page, offset, limit } = usePagination("name", {
    initPerPage: getUserTablePreference("allNamespacesTable", PreferenceKey.PerPage, 1)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("allNamespacesTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data: searchedNamespaces, isPending: isNamespaceLoading } = useQuery({
    ...namespacesQueryKeys.search({
      limit,
      offset,
      name: debouncedSearch || undefined,
      orderDirection,
      orderBy: SearchNamespaceSortBy.NAME
    }),
    placeholderData: (prev) => prev
  });

  useResetPageHelper({
    setPage,
    offset,
    totalCount: searchedNamespaces?.totalCount || 0
  });

  return (
    <div>
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
                    to: "/organization/namespaces/$namespaceId/projects",
                    params: {
                      namespaceId: namespace.id
                    }
                  });
                }
              }}
              onClick={() => {
                if (namespace.isMember) {
                  navigate({
                    to: "/organization/namespaces/$namespaceId/projects",
                    params: {
                      namespaceId: namespace.id
                    }
                  });
                }
              }}
              key={namespace.id}
              className={twMerge(
                "group flex min-w-72 items-center justify-center border-t border-r border-l border-mineshaft-600 bg-mineshaft-800 px-6 py-3 first:rounded-t-md",
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
            className="mt-2 mb-4 w-full text-center text-5xl text-mineshaft-400"
          />
          <div className="text-center font-light">No Namespaces Found</div>
        </div>
      )}
    </div>
  );
};
