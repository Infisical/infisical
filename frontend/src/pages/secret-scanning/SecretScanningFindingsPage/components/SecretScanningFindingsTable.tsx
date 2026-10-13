import { useMemo, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { ChevronDownIcon, FilterIcon, SearchIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  ProviderIcon,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  ProjectPermissionSecretScanningFindingActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  SECRET_SCANNING_DATA_SOURCE_MAP,
  SECRET_SCANNING_FINDING_STATUS_MAP
} from "@app/helpers/secretScanningV2";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  SecretScanningDataSource,
  SecretScanningFindingStatus,
  TSecretScanningFinding
} from "@app/hooks/api/secretScanningV2";

import { SecretScanningFindingRow } from "./SecretScanningFindingRow";
import { SecretScanningUpdateFindingModal } from "./SecretScanningUpdateFindingModal";

enum FindingsOrderBy {
  ResourceName = "resource-name",
  Status = "status",
  Rule = "rule",
  Timestamp = "timestamp"
}

type DataSourceFilters = {
  dataSourceTypes: SecretScanningDataSource[];
  status: SecretScanningFindingStatus[];
};

type Props = {
  findings: TSecretScanningFinding[];
};

const getStatusOrderValue = (status: SecretScanningFindingStatus) => {
  switch (status) {
    case SecretScanningFindingStatus.Unresolved:
      return 0;
    case SecretScanningFindingStatus.Ignore:
      return 1;
    case SecretScanningFindingStatus.FalsePositive:
      return 2;
    default:
      return 3;
  }
};

export const SecretScanningFindingsTable = ({ findings }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["updateFinding"] as const);

  const { search: initSearch, status: initStatus } = useSearch({
    from: ROUTE_PATHS.SecretScanning.FindingsPage.id
  });

  const [filters, setFilters] = useState<DataSourceFilters>({
    dataSourceTypes: [],
    status: initStatus ? [initStatus] : []
  });

  const [selectedRows, setSelectedRows] = useState<string[]>([]);

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
  } = usePagination<FindingsOrderBy>(FindingsOrderBy.Timestamp, { initPerPage: 20, initSearch });

  const filteredFindings = useMemo(
    () =>
      findings
        .filter((finding) => {
          const { rule, resourceName, dataSourceType, dataSourceName, status, scanId } = finding;

          if (filters.dataSourceTypes.length && !filters.dataSourceTypes.includes(dataSourceType))
            return false;

          if (filters.status.length && !filters.status.includes(status)) {
            return false;
          }

          if (search.includes("scanId")) {
            return search.split(":")[1] === scanId;
          }

          const searchValue = search.trim().toLowerCase();

          return (
            SECRET_SCANNING_DATA_SOURCE_MAP[dataSourceType].name
              .toLowerCase()
              .includes(searchValue) ||
            resourceName.toLowerCase().includes(searchValue) ||
            dataSourceName.toLowerCase().includes(searchValue) ||
            rule.toLowerCase().includes(searchValue)
          );
        })
        .sort((a, b) => {
          const [findingOne, findingTwo] =
            orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          switch (orderBy) {
            case FindingsOrderBy.Timestamp:
              return (
                new Date(findingTwo.createdAt).getTime() - new Date(findingOne.createdAt).getTime()
              );
            case FindingsOrderBy.Rule:
              return findingOne.rule.toLowerCase().localeCompare(findingTwo.rule.toLowerCase());
            case FindingsOrderBy.Status:
              return (
                getStatusOrderValue(findingOne.status) - getStatusOrderValue(findingTwo.status)
              );
            case FindingsOrderBy.ResourceName:
            default:
              return findingOne.resourceName
                .toLowerCase()
                .localeCompare(findingTwo.resourceName.toLowerCase());
          }
        }),
    [findings, orderDirection, search, orderBy, filters]
  );

  useResetPageHelper({
    totalCount: filteredFindings.length,
    offset,
    setPage
  });

  const currentPageData = useMemo(
    () => filteredFindings.slice(offset, perPage * page),
    [filteredFindings, offset, perPage, page]
  );

  const currentPageDataIds = useMemo(() => currentPageData.map((f) => f.id), [currentPageData]);

  const handleSort = (column: FindingsOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const getSortDirection = (col: FindingsOrderBy) => {
    if (orderBy !== col) return "none" as const;
    const sortsLargestFirst = col === FindingsOrderBy.Timestamp;
    return (orderDirection === OrderByDirection.ASC) !== sortsLargestFirst
      ? ("ascending" as const)
      : ("descending" as const);
  };

  const getSortIconClassName = (col: FindingsOrderBy) =>
    twMerge(
      "transition-transform",
      orderDirection === OrderByDirection.DESC && orderBy === col && "rotate-180",
      orderBy !== col && "opacity-30"
    );

  const isTableFiltered = Boolean(filters.dataSourceTypes.length || filters.status.length);

  return (
    <div>
      <div className="flex gap-2">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search findings..."
          />
        </InputGroup>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              aria-label="Filter findings"
              variant={isTableFiltered ? "project" : "outline"}
            >
              <FilterIcon />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-[70vh] thin-scrollbar overflow-y-auto" align="end">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            {Object.values(SecretScanningFindingStatus).map((status) => {
              const { Icon } = SECRET_SCANNING_FINDING_STATUS_MAP[status];

              return (
                <DropdownMenuCheckboxItem
                  checked={filters.status.includes(status)}
                  onClick={(e) => {
                    e.preventDefault();
                    setFilters((prev) => ({
                      ...prev,
                      status: prev.status.includes(status)
                        ? prev.status.filter((s) => s !== status)
                        : [...prev.status, status]
                    }));
                  }}
                  key={status}
                >
                  <Icon
                    className={twMerge(
                      SECRET_SCANNING_FINDING_STATUS_MAP[status].className,
                      "size-3.5"
                    )}
                  />
                  <span className="capitalize">{status.replace("-", " ")}</span>
                </DropdownMenuCheckboxItem>
              );
            })}
            <DropdownMenuLabel>Platform</DropdownMenuLabel>
            {findings.length ? (
              [...new Set(findings.map(({ dataSourceType: type }) => type))].map((type) => {
                const { name, image } = SECRET_SCANNING_DATA_SOURCE_MAP[type];

                return (
                  <DropdownMenuCheckboxItem
                    checked={filters.dataSourceTypes.includes(type)}
                    onClick={(e) => {
                      e.preventDefault();
                      setFilters((prev) => ({
                        ...prev,
                        dataSourceTypes: prev.dataSourceTypes.includes(type)
                          ? prev.dataSourceTypes.filter((a) => a !== type)
                          : [...prev.dataSourceTypes, type]
                      }));
                    }}
                    key={type}
                  >
                    <ProviderIcon alt={`${name} integration`} icon={image} className="h-4 w-4" />
                    {name}
                  </DropdownMenuCheckboxItem>
                );
              })
            ) : (
              <DropdownMenuItem isDisabled>No Data Source Findings</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-4">
        {filteredFindings.length ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Checkbox
                      id="checkbox-select-all"
                      aria-label="Select all findings on this page"
                      isChecked={
                        currentPageDataIds.length > 0 &&
                        currentPageDataIds.every((id) => selectedRows.includes(id))
                      }
                      onCheckedChange={() => {
                        const allCurrentlySelectedOnPage =
                          currentPageDataIds.length > 0 &&
                          currentPageDataIds.every((id) => selectedRows.includes(id));

                        if (allCurrentlySelectedOnPage) {
                          // Deselect all on current page
                          setSelectedRows((prev) =>
                            prev.filter((rowId) => !currentPageDataIds.includes(rowId))
                          );
                        } else {
                          // Select all on current page
                          setSelectedRows((prev) => {
                            const newSelectedRows = new Set(prev);
                            currentPageDataIds.forEach((id) => newSelectedRows.add(id));
                            return Array.from(newSelectedRows);
                          });
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    />
                  </TableHead>
                  <TableHead className="min-w-40">Platform</TableHead>
                  <TableHead
                    className="w-1/4"
                    sortDirection={getSortDirection(FindingsOrderBy.Timestamp)}
                    onSortChange={() => handleSort(FindingsOrderBy.Timestamp)}
                  >
                    Timestamp
                    <ChevronDownIcon className={getSortIconClassName(FindingsOrderBy.Timestamp)} />
                  </TableHead>
                  <TableHead
                    className="w-1/3"
                    sortDirection={getSortDirection(FindingsOrderBy.ResourceName)}
                    onSortChange={() => handleSort(FindingsOrderBy.ResourceName)}
                  >
                    Resource Name
                    <ChevronDownIcon
                      className={getSortIconClassName(FindingsOrderBy.ResourceName)}
                    />
                  </TableHead>
                  <TableHead
                    className="w-1/4"
                    sortDirection={getSortDirection(FindingsOrderBy.Rule)}
                    onSortChange={() => handleSort(FindingsOrderBy.Rule)}
                  >
                    Rule
                    <ChevronDownIcon className={getSortIconClassName(FindingsOrderBy.Rule)} />
                  </TableHead>
                  <TableHead
                    className="w-1/4"
                    sortDirection={getSortDirection(FindingsOrderBy.Status)}
                    onSortChange={() => handleSort(FindingsOrderBy.Status)}
                  >
                    Status
                    <ChevronDownIcon className={getSortIconClassName(FindingsOrderBy.Status)} />
                  </TableHead>
                  <TableHead variant="action" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentPageData.map((finding) => (
                  <SecretScanningFindingRow
                    isSelected={selectedRows.includes(finding.id)}
                    onToggleSelect={(v) =>
                      v
                        ? setSelectedRows((sr) => [...sr, finding.id])
                        : setSelectedRows((sr) => sr.filter((r) => r !== finding.id))
                    }
                    key={finding.id}
                    finding={finding}
                    onUpdate={() => handlePopUpOpen("updateFinding", [finding])}
                  />
                ))}
              </TableBody>
            </Table>
            <Pagination
              count={filteredFindings.length}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={setPerPage}
            />
          </>
        ) : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyTitle>
                {findings.length
                  ? "No findings match search..."
                  : "This project has not uncovered any secret leaks"}
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </div>
      <SecretScanningUpdateFindingModal
        isOpen={popUp.updateFinding.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("updateFinding", isOpen)}
        onComplete={() => setSelectedRows([])}
        findings={popUp.updateFinding.data}
      />
      {selectedRows.length > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-border-control bg-surface-raised p-2 pl-4">
          <span>
            {selectedRows.length} finding{selectedRows.length === 1 ? "" : "s"} selected
          </span>

          <div className="flex gap-2">
            <ProjectPermissionCan
              I={ProjectPermissionSecretScanningFindingActions.Update}
              a={ProjectPermissionSub.SecretScanningFindings}
            >
              {(isAllowed) => (
                <Button
                  onClick={() =>
                    handlePopUpOpen(
                      "updateFinding",
                      findings.filter((f) => selectedRows.includes(f.id))
                    )
                  }
                  variant="outline"
                  isDisabled={!isAllowed}
                >
                  Update Status
                </Button>
              )}
            </ProjectPermissionCan>
          </div>
        </div>
      )}
    </div>
  );
};
