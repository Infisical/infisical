import { useMemo } from "react";
import {
  faArrowDown,
  faArrowUp,
  faBan,
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
import { RESOURCE_DESCRIPTION_HELPER } from "@app/helpers/secretScanningV2";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  SecretScanningScanStatus,
  TSecretScanningDataSource,
  useListSecretScanningResources
} from "@app/hooks/api/secretScanningV2";

import { SecretScanningResourceRow } from "./SecretScanningResourceRow";

enum ResourcesOrderBy {
  Name = "name",
  Findings = "findings",
  LastScanned = "last-scanned"
}

type Props = {
  dataSource: TSecretScanningDataSource;
};

export const SecretScanningResourcesTable = ({ dataSource }: Props) => {
  const { permission } = useProjectPermission();

  const canReadResources = permission.can(
    ProjectPermissionSecretScanningDataSourceActions.ReadResources,
    ProjectPermissionSub.SecretScanningDataSources
  );

  const { data: resources = [], isPending: isResourcesPending } = useListSecretScanningResources(
    { dataSourceId: dataSource.id, type: dataSource.type },
    {
      refetchInterval: 30000,
      enabled: canReadResources
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
  } = usePagination<ResourcesOrderBy>(ResourcesOrderBy.Name, { initPerPage: 10 });

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
            case ResourcesOrderBy.Findings:
              if (
                resourceOne.unresolvedFindings === 0 &&
                resourceOne.lastScanStatus === SecretScanningScanStatus.Failed
              )
                return 1;
              if (
                resourceTwo.unresolvedFindings === 0 &&
                resourceTwo.lastScanStatus === SecretScanningScanStatus.Failed
              )
                return -1;

              return resourceTwo.unresolvedFindings - resourceOne.unresolvedFindings;
            case ResourcesOrderBy.LastScanned:
              return (
                new Date(resourceTwo.lastScannedAt).getTime() -
                new Date(resourceOne.lastScannedAt).getTime()
              );
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

  const resourceDetails = RESOURCE_DESCRIPTION_HELPER[dataSource.type];

  return (
    <div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder={`Search ${resourceDetails.pluralNoun}...`}
        className="flex-1"
      />
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-1/2">
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
              <Th className="w-1/4">
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
              <Th className="w-1/4 whitespace-nowrap">
                <div className="flex items-center">
                  Last Scan
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
            {canReadResources && isResourcesPending && (
              <TableSkeleton columns={5} innerKey="resource" />
            )}
            {filteredResources.slice(offset, perPage * page).map((resource) => (
              <SecretScanningResourceRow
                key={resource.id}
                resource={resource}
                dataSource={dataSource}
              />
            ))}
          </TBody>
        </Table>
        {!canReadResources && (
          <EmptyState
            icon={faBan}
            title={`You do not have permission to view data source ${resourceDetails.pluralNoun}`}
          />
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
        {!isResourcesPending && !filteredResources?.length && (
          <EmptyState
            title={
              resources.length
                ? "No resources match search..."
                : `This data source has no ${resourceDetails.pluralNoun} associated with it.`
            }
            icon={resources.length ? faSearch : undefined}
          />
        )}
      </TableContainer>
    </div>
  );
};
