import { ChevronDownIcon, FolderGitIcon, LockIcon, SearchIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type TableSortDirection
} from "@app/components/v3";
import { ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import {
  canAddSecretScanningResources,
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_MAP
} from "@app/helpers/secretScanningV2";
import { useDebounce, usePagination, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  SecretScanningResourceOrderBy,
  TSecretScanningDataSource,
  useListSecretScanningResources
} from "@app/hooks/api/secretScanningV2";

import { AddSecretScanningResourcesButton } from "./AddSecretScanningResourcesButton";
import { SecretScanningResourceRow } from "./SecretScanningResourceRow";

const SKELETON_ROWS = ["first", "second", "third"];
const SKELETON_CELLS = ["name", "status", "last-scan", "actions"];

type Props = {
  dataSource: TSecretScanningDataSource;
  onViewFindings: (resourceId: string) => void;
};

export const SecretScanningResourcesTable = ({ dataSource, onViewFindings }: Props) => {
  const { permission } = useProjectPermission();

  const canReadResources = permission.can(
    ProjectPermissionSecretScanningDataSourceActions.ReadResources,
    ProjectPermissionSub.SecretScanningDataSources
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
  } = usePagination<SecretScanningResourceOrderBy>(SecretScanningResourceOrderBy.Name, {
    initPerPage: 20
  });

  const [debouncedSearch] = useDebounce(search.trim());

  const { data, isPending } = useListSecretScanningResources(
    {
      dataSourceId: dataSource.id,
      type: dataSource.type,
      search: debouncedSearch || undefined,
      orderBy,
      orderDirection,
      offset,
      limit: perPage
    },
    {
      refetchInterval: 30000,
      enabled: canReadResources
    }
  );
  const isLoading = canReadResources && isPending;
  const resources = data?.resources ?? [];
  const totalCount = data?.totalCount ?? 0;

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  const resourceDetails = RESOURCE_DESCRIPTION_HELPER[dataSource.type];

  const handleSortChange = (column: SecretScanningResourceOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    // status ascends from what needs attention first; last scan starts at the most recent
    setOrderDirection(
      column === SecretScanningResourceOrderBy.LastScanned
        ? OrderByDirection.DESC
        : OrderByDirection.ASC
    );
  };

  const getSortDirection = (column: SecretScanningResourceOrderBy): TableSortDirection => {
    if (orderBy !== column) return "none";
    return orderDirection === OrderByDirection.ASC ? "ascending" : "descending";
  };

  const renderSortableHead = (
    column: SecretScanningResourceOrderBy,
    label: string,
    className?: string
  ) => {
    const direction = getSortDirection(column);
    return (
      <TableHead
        className={className}
        sortDirection={direction}
        onSortChange={() => handleSortChange(column)}
      >
        {label}
        <ChevronDownIcon
          className={twMerge(
            "transition-transform",
            direction === "descending" && "rotate-180",
            direction === "none" && "opacity-30"
          )}
        />
      </TableHead>
    );
  };

  const renderEmpty = () => {
    if (!canReadResources) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LockIcon />
            </EmptyMedia>
            <EmptyTitle>Access restricted</EmptyTitle>
            <EmptyDescription>
              You don&apos;t have permission to view this data source&apos;s{" "}
              {resourceDetails.pluralNoun}.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    if (debouncedSearch) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>No {resourceDetails.pluralNoun} match your search</EmptyTitle>
            <EmptyDescription>Try a different search term.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderGitIcon />
          </EmptyMedia>
          <EmptyTitle>No {resourceDetails.pluralNoun} yet</EmptyTitle>
          <EmptyDescription>
            Add a {resourceDetails.singularNoun} to start scanning it for secrets.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  };

  const canAddResources = canAddSecretScanningResources(dataSource);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{resourceDetails.pluralTitle}</CardTitle>
        <CardDescription>
          {resourceDetails.pluralTitle} in this{" "}
          {SECRET_SCANNING_DATA_SOURCE_MAP[dataSource.type].name} data source. Select one to see its
          findings.
        </CardDescription>
        {canAddResources && (
          <CardAction>
            <AddSecretScanningResourcesButton dataSource={dataSource} />
          </CardAction>
        )}
        <div className="col-span-full flex gap-2">
          <InputGroup className="flex-1">
            <InputGroupAddon align="inline-start">
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${resourceDetails.pluralNoun}...`}
            />
          </InputGroup>
        </div>
      </CardHeader>
      <CardContent>
        {!isLoading && !resources.length ? (
          renderEmpty()
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {renderSortableHead(
                  SecretScanningResourceOrderBy.Name,
                  resourceDetails.singularTitle,
                  "w-1/2"
                )}
                {renderSortableHead(SecretScanningResourceOrderBy.Status, "Status")}
                {renderSortableHead(SecretScanningResourceOrderBy.LastScanned, "Last Scan")}
                <TableHead variant="action" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                SKELETON_ROWS.map((row) => (
                  <TableRow key={`resource-skeleton-${row}`}>
                    {SKELETON_CELLS.map((cell) => (
                      <TableCell key={`resource-skeleton-${row}-${cell}`}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!isLoading &&
                resources.map((resource) => (
                  <SecretScanningResourceRow
                    key={resource.id}
                    resource={resource}
                    dataSource={dataSource}
                    onViewFindings={onViewFindings}
                  />
                ))}
            </TableBody>
          </Table>
        )}
        {!isLoading && Boolean(totalCount) && (
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={setPerPage}
          />
        )}
      </CardContent>
    </Card>
  );
};
