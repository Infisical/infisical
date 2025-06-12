import { useMemo, useState } from "react";
import {
  faArrowDown,
  faArrowUp,
  faCheckCircle,
  faFilter,
  faMagnifyingGlass,
  faSearch
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useSearch } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  Checkbox,
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
  ProjectPermissionSecretScanningFindingActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  SECRET_SCANNING_DATA_SOURCE_MAP,
  SECRET_SCANNING_FINDING_STATUS_ICON_MAP
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

  const getClassName = (col: FindingsOrderBy) =>
    twMerge("ml-2", orderBy === col ? "" : "opacity-30");

  const getColSortIcon = (col: FindingsOrderBy) =>
    orderDirection === OrderByDirection.DESC && orderBy === col ? faArrowUp : faArrowDown;

  const isTableFiltered = Boolean(filters.dataSourceTypes.length || filters.status.length);

  return (
    <div>
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search findings..."
          className="flex-1"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              ariaLabel="Filter findings"
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
          <DropdownMenuContent className="thin-scrollbar max-h-[70vh] overflow-y-auto" align="end">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            {Object.values(SecretScanningFindingStatus).map((status) => (
              <DropdownMenuItem
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
                icon={
                  filters.status.includes(status) && (
                    <FontAwesomeIcon className="text-primary" icon={faCheckCircle} />
                  )
                }
                iconPos="right"
              >
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon
                    icon={SECRET_SCANNING_FINDING_STATUS_ICON_MAP[status].icon}
                    className={SECRET_SCANNING_FINDING_STATUS_ICON_MAP[status].className}
                  />
                  <span className="capitalize">{status.replace("-", " ")}</span>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuLabel>Platform</DropdownMenuLabel>
            {findings.length ? (
              [...new Set(findings.map(({ dataSourceType: type }) => type))].map((type) => {
                const { name, image } = SECRET_SCANNING_DATA_SOURCE_MAP[type];

                return (
                  <DropdownMenuItem
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
                    icon={
                      filters.dataSourceTypes.includes(type) && (
                        <FontAwesomeIcon className="text-primary" icon={faCheckCircle} />
                      )
                    }
                    iconPos="right"
                  >
                    <div className="flex items-center gap-2">
                      <img
                        alt={`${name} integration`}
                        src={`/images/integrations/${image}`}
                        className="h-4 w-4"
                      />
                      <span>{name}</span>
                    </div>
                  </DropdownMenuItem>
                );
              })
            ) : (
              <DropdownMenuItem isDisabled>No Data Source Findings</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="">
                <Checkbox
                  id="checkbox-select-all"
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
              </Th>
              <Th className="min-w-[10rem]">Platform</Th>
              <Th className="w-1/4">
                <div className="flex items-center">
                  Timestamp
                  <IconButton
                    variant="plain"
                    className={getClassName(FindingsOrderBy.Timestamp)}
                    ariaLabel="sort"
                    onClick={() => handleSort(FindingsOrderBy.Timestamp)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(FindingsOrderBy.Timestamp)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/3 whitespace-nowrap">
                <div className="flex items-center">
                  Resource Name
                  <IconButton
                    variant="plain"
                    className={getClassName(FindingsOrderBy.ResourceName)}
                    ariaLabel="sort"
                    onClick={() => handleSort(FindingsOrderBy.ResourceName)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(FindingsOrderBy.ResourceName)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/4">
                <div className="flex items-center">
                  Rule
                  <IconButton
                    variant="plain"
                    className={getClassName(FindingsOrderBy.Rule)}
                    ariaLabel="sort"
                    onClick={() => handleSort(FindingsOrderBy.Rule)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(FindingsOrderBy.Rule)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/4">
                <div className="flex items-center">
                  Status
                  <IconButton
                    variant="plain"
                    className={getClassName(FindingsOrderBy.Status)}
                    ariaLabel="sort"
                    onClick={() => handleSort(FindingsOrderBy.Status)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(FindingsOrderBy.Status)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
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
          </TBody>
        </Table>
        {Boolean(filteredFindings.length) && (
          <Pagination
            count={filteredFindings.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={setPerPage}
          />
        )}
        {!filteredFindings?.length && (
          <EmptyState
            title={
              findings.length
                ? "No findings match search..."
                : "This project has not uncovered any secret leaks"
            }
            icon={faSearch}
          />
        )}
      </TableContainer>
      <SecretScanningUpdateFindingModal
        isOpen={popUp.updateFinding.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("updateFinding", isOpen)}
        onComplete={() => setSelectedRows([])}
        findings={popUp.updateFinding.data}
      />
      {selectedRows.length > 0 && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-2 pl-4">
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
                  colorSchema="secondary"
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
