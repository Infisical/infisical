import { useEffect, useMemo, useState } from "react";
import { faCircleXmark } from "@fortawesome/free-regular-svg-icons";
import {
  faArrowDown,
  faArrowUp,
  faCheckCircle,
  faFilter,
  faMagnifyingGlass,
  faSearch
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import {
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
import { usePagination, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  PAM_RESOURCE_TYPE_MAP,
  PamResourceType,
  PamSessionStatus,
  TPamSession
} from "@app/hooks/api/pam";

import { PamSessionRow } from "./PamSessionRow";

enum OrderBy {
  Account = "account",
  Actor = "actor",
  CreatedAt = "createdAt",
  EndedAt = "endedAt"
}

type Filters = {
  resourceType: PamResourceType[];
  status: PamSessionStatus[];
};

type Props = {
  sessions: TPamSession[];
};

export const PamSessionsTable = ({ sessions }: Props) => {
  const navigate = useNavigate({ from: ROUTE_PATHS.Pam.SessionsPage.path });

  const { search: initSearch } = useSearch({
    from: ROUTE_PATHS.Pam.SessionsPage.id
  });

  const [filters, setFilters] = useState<Filters>({
    resourceType: [],
    status: []
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
  } = usePagination<OrderBy>(OrderBy.CreatedAt, {
    initPerPage: 20,
    initSearch
  });

  useEffect(() => {
    setOrderDirection(OrderByDirection.DESC);
  }, []);

  const sessionsWithMatches = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    if (!searchValue) {
      return sessions.map((session) => ({
        session,
        isMatch: true,
        filteredLogs: []
      }));
    }

    return sessions.map((session) => {
      const {
        resourceType,
        accountName,
        actorEmail,
        actorIp,
        actorName,
        actorUserAgent,
        id,
        resourceName,
        userId,
        logs
      } = session;

      const { name: resourceTypeName } = PAM_RESOURCE_TYPE_MAP[resourceType];

      const isMetaMatch =
        resourceTypeName.toLowerCase().includes(searchValue) ||
        accountName.toLowerCase().includes(searchValue) ||
        actorEmail.toLowerCase().includes(searchValue) ||
        actorIp.toLowerCase().includes(searchValue) ||
        actorName.toLowerCase().includes(searchValue) ||
        actorUserAgent.toLowerCase().includes(searchValue) ||
        id.toLowerCase().includes(searchValue) ||
        (userId ?? "").toLowerCase().includes(searchValue) ||
        resourceName.toLowerCase().includes(searchValue);

      const filteredLogs =
        searchValue.length >= 2
          ? logs.filter((log) => {
              // Handle command logs (database sessions)
              if ("input" in log && "output" in log) {
                return (
                  log.input.toLowerCase().includes(searchValue) ||
                  log.output.toLowerCase().includes(searchValue)
                );
              }
              // Handle terminal events (SSH sessions)
              if ("data" in log) {
                try {
                  const decodedData = atob(log.data);
                  return decodedData.toLowerCase().includes(searchValue);
                } catch {
                  return false;
                }
              }
              return false;
            })
          : [];

      return {
        session,
        isMatch: isMetaMatch || filteredLogs.length > 0,
        filteredLogs
      };
    });
  }, [sessions, search]);

  const filteredSessions = useMemo(
    () =>
      sessionsWithMatches
        .filter((item) => {
          if (!item.isMatch) return false;

          const { resourceType, status } = item.session;
          if (
            (filters.resourceType.length && !filters.resourceType.includes(resourceType)) ||
            (filters.status.length && !filters.status.includes(status))
          ) {
            return false;
          }
          return true;
        })
        .sort((a, b) => {
          const [one, two] =
            orderDirection === OrderByDirection.ASC
              ? [a.session, b.session]
              : [b.session, a.session];

          switch (orderBy) {
            case OrderBy.Account:
              return one.accountName.toLowerCase().localeCompare(two.accountName.toLowerCase());
            case OrderBy.Actor:
              return one.actorName.toLowerCase().localeCompare(two.actorName.toLowerCase());
            case OrderBy.EndedAt: {
              const dateOne = one.endedAt || one.createdAt;
              const dateTwo = two.endedAt || two.createdAt;
              return new Date(dateOne).getTime() - new Date(dateTwo).getTime();
            }
            case OrderBy.CreatedAt:
            default: {
              const dateOne = one.createdAt;
              const dateTwo = two.createdAt;
              return new Date(dateOne).getTime() - new Date(dateTwo).getTime();
            }
          }
        }),
    [sessionsWithMatches, orderDirection, orderBy, filters]
  );

  useResetPageHelper({
    totalCount: filteredSessions.length,
    offset,
    setPage
  });

  const currentPageData = useMemo(
    () => filteredSessions.slice(offset, perPage * page),
    [filteredSessions, offset, perPage, page]
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

  const isTableFiltered = Boolean(filters.resourceType.length || filters.status.length);
  const isContentEmpty = !filteredSessions.length;
  const isSearchEmpty = isContentEmpty && (Boolean(search) || isTableFiltered);

  return (
    <div>
      <div className="flex gap-2">
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
          placeholder="Search sessions and logs..."
          className="flex-1"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              ariaLabel="Filter sessions"
              variant="plain"
              size="sm"
              className={twMerge(
                "flex h-10 w-11 items-center justify-center overflow-hidden border border-mineshaft-600 bg-mineshaft-800 p-0 transition-all hover:border-primary/60 hover:bg-primary/10",
                isTableFiltered && "border-primary/50 text-primary"
              )}
            >
              <FontAwesomeIcon icon={faFilter} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-[70vh] thin-scrollbar overflow-y-auto" align="end">
            <DropdownMenuLabel>Session Status</DropdownMenuLabel>
            {sessions.length ? (
              [...new Set(sessions.map(({ status }) => status))].map((status) => {
                return (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      setFilters((prev) => ({
                        ...prev,
                        status: prev.status.includes(status)
                          ? prev.status.filter((a) => a !== status)
                          : [...prev.status, status]
                      }));
                    }}
                    key={status}
                    icon={
                      filters.status.includes(status) && (
                        <FontAwesomeIcon className="text-primary" icon={faCheckCircle} />
                      )
                    }
                    iconPos="right"
                  >
                    {status[0].toUpperCase() + status.slice(1)}
                  </DropdownMenuItem>
                );
              })
            ) : (
              <DropdownMenuItem isDisabled>No Sessions</DropdownMenuItem>
            )}
            <DropdownMenuLabel>Resource Type</DropdownMenuLabel>
            {sessions.length ? (
              [...new Set(sessions.map(({ resourceType }) => resourceType))].map((type) => {
                const { name, image } = PAM_RESOURCE_TYPE_MAP[type];

                return (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.preventDefault();
                      setFilters((prev) => ({
                        ...prev,
                        resourceType: prev.resourceType.includes(type)
                          ? prev.resourceType.filter((a) => a !== type)
                          : [...prev.resourceType, type]
                      }));
                    }}
                    key={type}
                    icon={
                      filters.resourceType.includes(type) && (
                        <FontAwesomeIcon className="text-primary" icon={faCheckCircle} />
                      )
                    }
                    iconPos="right"
                  >
                    <div className="flex items-center gap-2">
                      <img
                        alt={`${name} resource type`}
                        src={`/images/integrations/${image}`}
                        className="h-4 w-4"
                      />
                      <span>{name}</span>
                    </div>
                  </DropdownMenuItem>
                );
              })
            ) : (
              <DropdownMenuItem isDisabled>No Sessions</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th>
                <div className="flex items-center">
                  Account
                  <IconButton
                    variant="plain"
                    className={getClassName(OrderBy.Account)}
                    ariaLabel="sort"
                    onClick={() => handleSort(OrderBy.Account)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(OrderBy.Account)} />
                  </IconButton>
                </div>
              </Th>
              <Th>
                <div className="flex items-center">
                  Actor
                  <IconButton
                    variant="plain"
                    className={getClassName(OrderBy.Actor)}
                    ariaLabel="sort"
                    onClick={() => handleSort(OrderBy.Actor)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(OrderBy.Actor)} />
                  </IconButton>
                </div>
              </Th>
              <Th>
                <div className="flex items-center">
                  Created At
                  <IconButton
                    variant="plain"
                    className={getClassName(OrderBy.CreatedAt)}
                    ariaLabel="sort"
                    onClick={() => handleSort(OrderBy.CreatedAt)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(OrderBy.CreatedAt)} />
                  </IconButton>
                </div>
              </Th>
              <Th>
                <div className="flex items-center">
                  Ended At
                  <IconButton
                    variant="plain"
                    className={getClassName(OrderBy.EndedAt)}
                    ariaLabel="sort"
                    onClick={() => handleSort(OrderBy.EndedAt)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(OrderBy.EndedAt)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {currentPageData.map(({ session, filteredLogs }) => (
              <PamSessionRow
                key={session.id}
                session={session}
                search={search.trim().toLowerCase()}
                filteredLogs={filteredLogs}
              />
            ))}
          </TBody>
        </Table>
        {Boolean(filteredSessions.length) && (
          <Pagination
            count={filteredSessions.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={setPerPage}
          />
        )}
        {isContentEmpty && (
          <EmptyState
            title={isSearchEmpty ? "No sessions match search" : "No sessions"}
            icon={isSearchEmpty ? faSearch : faCircleXmark}
          />
        )}
      </TableContainer>
    </div>
  );
};
