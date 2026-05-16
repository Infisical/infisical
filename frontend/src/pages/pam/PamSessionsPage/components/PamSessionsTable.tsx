import { useEffect, useMemo, useState } from "react";
import { faCircleXmark } from "@fortawesome/free-regular-svg-icons";
import { faArrowDown, faArrowUp, faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { FilterIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  EmptyState,
  IconButton as IconButtonV2,
  Pagination,
  Table,
  TableContainer,
  TBody,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
  const [filters, setFilters] = useState<Filters>({
    resourceType: [],
    status: []
  });

  const {
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
    initPerPage: 20
  });

  useEffect(() => {
    setOrderDirection(OrderByDirection.DESC);
  }, []);

  const filteredSessions = useMemo(
    () =>
      sessions
        .filter((session) => {
          const { resourceType, status } = session;
          if (
            (filters.resourceType.length && !filters.resourceType.includes(resourceType)) ||
            (filters.status.length && !filters.status.includes(status))
          ) {
            return false;
          }
          return true;
        })
        .sort((a, b) => {
          const [one, two] = orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

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
    [sessions, orderDirection, orderBy, filters]
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
  const isFilteredEmpty = isContentEmpty && isTableFiltered;

  const availableStatuses = [...new Set(sessions.map(({ status }) => status))];
  const availableResourceTypes = [...new Set(sessions.map(({ resourceType }) => resourceType))];

  return (
    <div>
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger className="outline-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  className="relative"
                  size="md"
                  variant={isTableFiltered ? "project" : "outline"}
                >
                  <FilterIcon />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>Filter sessions</TooltipContent>
            </Tooltip>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-[70vh] thin-scrollbar overflow-y-auto" align="end">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            {availableStatuses.length ? (
              availableStatuses.map((status) => (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={filters.status.includes(status)}
                  onClick={(e) => {
                    e.preventDefault();
                    setFilters((prev) => ({
                      ...prev,
                      status: prev.status.includes(status)
                        ? prev.status.filter((a) => a !== status)
                        : [...prev.status, status]
                    }));
                  }}
                >
                  {status[0].toUpperCase() + status.slice(1)}
                </DropdownMenuCheckboxItem>
              ))
            ) : (
              <p className="px-2 py-1.5 text-sm text-muted">No sessions</p>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Resource Type</DropdownMenuLabel>
            {availableResourceTypes.length ? (
              availableResourceTypes.map((type) => {
                const { name, image } = PAM_RESOURCE_TYPE_MAP[type];

                return (
                  <DropdownMenuCheckboxItem
                    key={type}
                    checked={filters.resourceType.includes(type)}
                    onClick={(e) => {
                      e.preventDefault();
                      setFilters((prev) => ({
                        ...prev,
                        resourceType: prev.resourceType.includes(type)
                          ? prev.resourceType.filter((a) => a !== type)
                          : [...prev.resourceType, type]
                      }));
                    }}
                  >
                    <img
                      alt={`${name} resource type`}
                      src={`/images/integrations/${image}`}
                      className="h-4 w-4"
                    />
                    {name}
                  </DropdownMenuCheckboxItem>
                );
              })
            ) : (
              <p className="px-2 py-1.5 text-sm text-muted">No sessions</p>
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
                  <IconButtonV2
                    variant="plain"
                    className={getClassName(OrderBy.Account)}
                    ariaLabel="Sort"
                    onClick={() => handleSort(OrderBy.Account)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(OrderBy.Account)} />
                  </IconButtonV2>
                </div>
              </Th>
              <Th>
                <div className="flex items-center">
                  Actor
                  <IconButtonV2
                    variant="plain"
                    className={getClassName(OrderBy.Actor)}
                    ariaLabel="Sort"
                    onClick={() => handleSort(OrderBy.Actor)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(OrderBy.Actor)} />
                  </IconButtonV2>
                </div>
              </Th>
              <Th>
                <div className="flex items-center">
                  Created At
                  <IconButtonV2
                    variant="plain"
                    className={getClassName(OrderBy.CreatedAt)}
                    ariaLabel="Sort"
                    onClick={() => handleSort(OrderBy.CreatedAt)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(OrderBy.CreatedAt)} />
                  </IconButtonV2>
                </div>
              </Th>
              <Th>
                <div className="flex items-center">
                  Ended At
                  <IconButtonV2
                    variant="plain"
                    className={getClassName(OrderBy.EndedAt)}
                    ariaLabel="Sort"
                    onClick={() => handleSort(OrderBy.EndedAt)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(OrderBy.EndedAt)} />
                  </IconButtonV2>
                </div>
              </Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {currentPageData.map((session) => (
              <PamSessionRow key={session.id} session={session} />
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
            title={isFilteredEmpty ? "No sessions match filters" : "No sessions"}
            icon={isFilteredEmpty ? faSearch : faCircleXmark}
          />
        )}
      </TableContainer>
    </div>
  );
};
