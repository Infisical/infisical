import { useMemo } from "react";
import {
  faArrowDown,
  faArrowUp,
  faBan,
  faExpand,
  faMagnifyingGlass,
  faSearch
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import {
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
import { ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  TSecretScanningDataSource,
  useListSecretScanningScans
} from "@app/hooks/api/secretScanningV2";

import { SecretScanningScanRow } from "./SecretScanningScanRow";

enum ScansOrderBy {
  ResourceName = "resource-name",
  Findings = "findings",
  Timestamp = "timestamp",
  Status = "status"
}

type Props = {
  dataSource: TSecretScanningDataSource;
};

export const SecretScanningScanTable = ({ dataSource }: Props) => {
  const { permission } = useProjectPermission();

  const canReadScans = permission.can(
    ProjectPermissionSecretScanningDataSourceActions.ReadScans,
    ProjectPermissionSub.SecretScanningDataSources
  );

  const { data: scans = [], isPending: isScansPending } = useListSecretScanningScans(
    { dataSourceId: dataSource.id, type: dataSource.type },
    {
      refetchInterval: 30000,
      enabled: canReadScans
    }
  );

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
  } = usePagination<ScansOrderBy>(ScansOrderBy.Timestamp, { initPerPage: 10 });

  const filteredResources = useMemo(
    () =>
      scans
        .filter((scan) => {
          const { resourceName } = scan;

          const searchValue = search.trim().toLowerCase();

          return resourceName.toLowerCase().includes(searchValue);
        })
        .sort((a, b) => {
          const [scanOne, scanTwo] = orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          switch (orderBy) {
            case ScansOrderBy.Findings:
              return scanOne.unresolvedFindings - scanTwo.unresolvedFindings;
            case ScansOrderBy.Timestamp:
              return new Date(scanTwo.createdAt).getTime() - new Date(scanOne.createdAt).getTime();
            case ScansOrderBy.ResourceName:
            default:
              return scanOne.resourceName
                .toLowerCase()
                .localeCompare(scanTwo.resourceName.toLowerCase());
          }
        }),
    [scans, orderDirection, search, orderBy]
  );

  useResetPageHelper({
    totalCount: filteredResources.length,
    offset,
    setPage
  });

  const handleSort = (column: ScansOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const getClassName = (col: ScansOrderBy) => twMerge("ml-2", orderBy === col ? "" : "opacity-30");

  const getColSortIcon = (col: ScansOrderBy) =>
    orderDirection === OrderByDirection.DESC && orderBy === col ? faArrowUp : faArrowDown;

  return (
    <div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search scans..."
        className="flex-1"
      />
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-4" />
              <Th className="w-min whitespace-nowrap">
                <div className="flex items-center">
                  Timestamp
                  <IconButton
                    variant="plain"
                    className={getClassName(ScansOrderBy.Timestamp)}
                    ariaLabel="sort"
                    onClick={() => handleSort(ScansOrderBy.Timestamp)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(ScansOrderBy.Timestamp)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-full">
                <div className="flex items-center">
                  Name
                  <IconButton
                    variant="plain"
                    className={getClassName(ScansOrderBy.ResourceName)}
                    ariaLabel="sort"
                    onClick={() => handleSort(ScansOrderBy.ResourceName)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(ScansOrderBy.ResourceName)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/5 whitespace-nowrap">
                <div className="flex items-center">
                  Findings
                  <IconButton
                    variant="plain"
                    className={getClassName(ScansOrderBy.Findings)}
                    ariaLabel="sort"
                    onClick={() => handleSort(ScansOrderBy.Findings)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(ScansOrderBy.Findings)} />
                  </IconButton>
                </div>
              </Th>
              <Th>
                <div className="flex items-center">
                  Status
                  <IconButton
                    variant="plain"
                    className={getClassName(ScansOrderBy.Findings)}
                    ariaLabel="sort"
                    onClick={() => handleSort(ScansOrderBy.Findings)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(ScansOrderBy.Findings)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {canReadScans && isScansPending && <TableSkeleton columns={5} innerKey="resource" />}
            {filteredResources.slice(offset, perPage * page).map((scan) => (
              <SecretScanningScanRow key={scan.id} scan={scan} />
            ))}
          </TBody>
        </Table>
        {!canReadScans && (
          <EmptyState icon={faBan} title="You do not have permission to view data source scans" />
        )}
        {Boolean(filteredResources.length) && (
          <Pagination
            count={filteredResources.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={setPerPage}
          />
        )}
        {!isScansPending && !filteredResources?.length && (
          <EmptyState
            title={
              scans.length
                ? "No scans match search..."
                : "This data source has no scans associated with it."
            }
            icon={scans.length ? faSearch : faExpand}
          />
        )}
      </TableContainer>
    </div>
  );
};
