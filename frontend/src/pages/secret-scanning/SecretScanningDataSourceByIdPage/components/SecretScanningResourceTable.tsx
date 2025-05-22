import { useMemo } from "react";
import {
  faArrowDown,
  faArrowUp,
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
  TBody,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  TSecretScanningDataSource,
  useListSecretScanningResources
} from "@app/hooks/api/secretScanningV2";

import { SecretScanningResourceRow } from "./SecretScanningResourceRow";

// import { getSecretSyncDestinationColValues } from "./helpers";

enum ResourcesOrderBy {
  Name = "name",
  Findings = "status",
  LastScanned = "last-scanned"
}

type Props = {
  dataSource: TSecretScanningDataSource;
};

export const SecretScanningResourcesTable = ({ dataSource }: Props) => {
  const { data: resources = [], isPending: isDataSourcesPending } = useListSecretScanningResources(
    { dataSourceId: dataSource.id, type: dataSource.type },
    {
      refetchInterval: 30000
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
  } = usePagination<ResourcesOrderBy>(ResourcesOrderBy.Name, { initPerPage: 20 });

  const filteredResources = useMemo(
    () =>
      resources
        .filter((resource) => {
          const { name } = resource;

          const searchValue = search.trim().toLowerCase();

          return name.toLowerCase().includes(searchValue);
        })
        .sort((a, b) => {
          const [resourceOne, resourceTwo] =
            orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          switch (orderBy) {
            // case DataSourcesOrderBy.Type:
            //   return getSecretSyncDestinationColValues(dataSourceOne)
            //     .primaryText.toLowerCase()
            //     .localeCompare(
            //       getSecretSyncDestinationColValues(dataSourceTwo).primaryText.toLowerCase()
            //     );
            // case DataSourcesOrderBy.Status:
            //   if (!syncOne.syncStatus && syncTwo.syncStatus) return 1;
            //   if (syncOne.syncStatus && !syncTwo.syncStatus) return -1;
            //   if (!syncOne.syncStatus && !syncTwo.syncStatus) return 0;

            //   return (
            //     getSyncStatusOrderValue(syncOne.syncStatus) -
            //     getSyncStatusOrderValue(syncTwo.syncStatus)
            //   );
            case ResourcesOrderBy.Name:
            default:
              return resourceOne.name.toLowerCase().localeCompare(resourceTwo.name.toLowerCase());
          }
        }),
    [resources, orderDirection, search, orderBy]
  );

  useResetPageHelper({
    totalCount: filteredResources.length,
    offset,
    setPage
  });

  const handleSort = (column: ResourcesOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const getClassName = (col: ResourcesOrderBy) =>
    twMerge("ml-2", orderBy === col ? "" : "opacity-30");

  const getColSortIcon = (col: ResourcesOrderBy) =>
    orderDirection === OrderByDirection.DESC && orderBy === col ? faArrowUp : faArrowDown;

  return (
    <div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search data sources..."
        className="flex-1"
      />
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-1/3">
                <div className="flex items-center">
                  Name
                  <IconButton
                    variant="plain"
                    className={getClassName(ResourcesOrderBy.Name)}
                    ariaLabel="sort"
                    onClick={() => handleSort(ResourcesOrderBy.Name)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(ResourcesOrderBy.Name)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/3">
                <div className="flex items-center">
                  Findings
                  <IconButton
                    variant="plain"
                    className={getClassName(ResourcesOrderBy.Findings)}
                    ariaLabel="sort"
                    onClick={() => handleSort(ResourcesOrderBy.Findings)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(ResourcesOrderBy.Findings)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-1/3">
                <div className="flex items-center">
                  Last Scanned
                  <IconButton
                    variant="plain"
                    className={getClassName(ResourcesOrderBy.LastScanned)}
                    ariaLabel="sort"
                    onClick={() => handleSort(ResourcesOrderBy.LastScanned)}
                  >
                    <FontAwesomeIcon icon={getColSortIcon(ResourcesOrderBy.LastScanned)} />
                  </IconButton>
                </div>
              </Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {filteredResources.slice(offset, perPage * page).map((resource) => (
              <SecretScanningResourceRow
                key={dataSource.id}
                resource={resource}
                onTriggerScan={() => {}} // TODO
              />
            ))}
          </TBody>
        </Table>
        {Boolean(filteredResources.length) && (
          <Pagination
            count={filteredResources.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={setPerPage}
          />
        )}
        {!filteredResources?.length && (
          <EmptyState
            title={
              resources.length
                ? "No resources match search..."
                : "This data source has no resources associated with it."
            }
            icon={resources.length ? faSearch : undefined}
          />
        )}
      </TableContainer>
    </div>
  );
};
