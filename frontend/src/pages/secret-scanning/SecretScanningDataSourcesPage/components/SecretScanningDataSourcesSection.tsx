import { useMemo, useState } from "react";
import { ChevronDownIcon, DatabaseIcon, FilterIcon, PlusIcon, SearchIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { SecretScanningUpgradeIntent, UpgradeGate } from "@app/components/license/UpgradeGate";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  CreateSecretScanningDataSourceSheet,
  EditSecretScanningDataSourceSheet
} from "@app/components/secret-scanning";
import { DeleteSecretScanningDataSourceModal } from "@app/components/secret-scanning/DeleteSecretScanningDataSourceModal";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  ProviderIcon,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type TableSortDirection
} from "@app/components/v3";
import { ProjectPermissionSub, useProject, useSubscription } from "@app/context";
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import { SECRET_SCANNING_DATA_SOURCE_MAP } from "@app/helpers/secretScanningV2";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  SecretScanningDataSource,
  SecretScanningScanStatus,
  TSecretScanningDataSource,
  TSecretScanningDataSourceWithDetails,
  useListSecretScanningDataSources,
  useTriggerSecretScanningDataSource,
  useUpdateSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";

import { SecretScanningDataSourceRow } from "./SecretScanningDataSourceRow";

enum DataSourcesOrderBy {
  Findings = "findings",
  Name = "name",
  LastScan = "last-scan"
}

const SKELETON_ROWS = ["first", "second", "third"];
const SKELETON_CELLS = ["type", "name", "resources", "findings", "last-scan", "status", "actions"];

const sortDataSources = (
  a: TSecretScanningDataSourceWithDetails,
  b: TSecretScanningDataSourceWithDetails,
  orderBy: DataSourcesOrderBy
) => {
  switch (orderBy) {
    case DataSourcesOrderBy.LastScan:
      if (a.lastScannedAt === null && b.lastScannedAt === null) return 0;
      if (a.lastScannedAt === null) return 1;
      if (b.lastScannedAt === null) return -1;

      return new Date(b.lastScannedAt).getTime() - new Date(a.lastScannedAt).getTime();
    case DataSourcesOrderBy.Findings:
      if (a.unresolvedFindings === null && b.unresolvedFindings === null) return 0;
      if (a.unresolvedFindings === null) return 1;
      if (b.unresolvedFindings === null) return -1;

      if (a.unresolvedFindings === 0 && a.lastScanStatus === SecretScanningScanStatus.Failed)
        return 1;
      if (b.unresolvedFindings === 0 && b.lastScanStatus === SecretScanningScanStatus.Failed)
        return -1;

      return b.unresolvedFindings - a.unresolvedFindings;
    case DataSourcesOrderBy.Name:
    default:
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  }
};

export const SecretScanningDataSourcesSection = () => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addDataSource",
    "upgradePlan",
    "deleteDataSource",
    "editDataSource"
  ] as const);

  const { subscription } = useSubscription();
  const { currentProject } = useProject();

  const { data: dataSources = [], isPending } = useListSecretScanningDataSources(
    currentProject.id,
    {
      refetchInterval: 30000,
      enabled: subscription.secretScanning
    }
  );
  const isLoading = subscription.secretScanning && isPending;

  const triggerDataSourceScan = useTriggerSecretScanningDataSource();
  const updateDataSource = useUpdateSecretScanningDataSource();

  const [typeFilter, setTypeFilter] = useState<SecretScanningDataSource[]>([]);

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
  } = usePagination<DataSourcesOrderBy>(DataSourcesOrderBy.Name, { initPerPage: 20 });

  const filteredDataSources = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return dataSources
      .filter(({ type, name, connection }) => {
        if (typeFilter.length && !typeFilter.includes(type)) return false;

        return (
          SECRET_SCANNING_DATA_SOURCE_MAP[type].name.toLowerCase().includes(searchValue) ||
          name.toLowerCase().includes(searchValue) ||
          Boolean(connection?.name.toLowerCase().includes(searchValue))
        );
      })
      .sort((a, b) =>
        orderDirection === OrderByDirection.ASC
          ? sortDataSources(a, b, orderBy)
          : sortDataSources(b, a, orderBy)
      );
  }, [dataSources, orderDirection, search, orderBy, typeFilter]);

  useResetPageHelper({
    totalCount: filteredDataSources.length,
    offset,
    setPage
  });

  const availableTypes = [...new Set(dataSources.map(({ type }) => type))];

  const handleSortChange = (column: DataSourcesOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const getSortDirection = (column: DataSourcesOrderBy): TableSortDirection => {
    if (orderBy !== column) return "none";
    return orderDirection === OrderByDirection.ASC ? "ascending" : "descending";
  };

  const renderSortableHead = (column: DataSourcesOrderBy, label: string, className?: string) => {
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

  const handleToggleEnableAutoScan = async (dataSource: TSecretScanningDataSource) => {
    const isScanNewCommitsEnabled = !dataSource.isScanNewCommitsEnabled;

    await updateDataSource.mutateAsync({
      dataSourceId: dataSource.id,
      type: dataSource.type,
      isScanNewCommitsEnabled,
      projectId: dataSource.projectId
    });

    createNotification({
      text: `Scanning new commits ${isScanNewCommitsEnabled ? "enabled" : "disabled"} for "${dataSource.name}"`,
      type: "success"
    });
  };

  const handleTriggerScan = async (dataSource: TSecretScanningDataSource) => {
    await triggerDataSourceScan.mutateAsync({
      dataSourceId: dataSource.id,
      type: dataSource.type,
      projectId: dataSource.projectId
    });

    createNotification({
      text: `Scan triggered for "${dataSource.name}"`,
      type: "success"
    });
  };

  const renderEmpty = () => {
    if (dataSources.length) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyTitle>No data sources match your filters</EmptyTitle>
            <EmptyDescription>Try a different search term or platform filter.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <DatabaseIcon />
          </EmptyMedia>
          <EmptyTitle>No data sources yet</EmptyTitle>
          <EmptyDescription>
            Add a data source to start scanning it for leaked secrets.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            Data Sources
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/secret-scanning/overview" />
          </CardTitle>
          <CardDescription>
            Connect third-party services to scan them for leaked secrets.
          </CardDescription>
          <CardAction>
            <ProjectPermissionCan
              I={ProjectPermissionSecretScanningDataSourceActions.Create}
              a={ProjectPermissionSub.SecretScanningDataSources}
            >
              {(isAllowed) => (
                <Button
                  variant="ss"
                  isDisabled={!isAllowed}
                  onClick={() => {
                    if (!subscription.secretScanning) {
                      handlePopUpOpen("upgradePlan", { isEnterpriseFeature: true });
                      return;
                    }

                    handlePopUpOpen("addDataSource");
                  }}
                >
                  <PlusIcon />
                  Add Data Source
                </Button>
              )}
            </ProjectPermissionCan>
          </CardAction>
          <div className="col-span-full flex gap-2">
            <InputGroup className="flex-1">
              <InputGroupAddon align="inline-start">
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search data sources..."
              />
            </InputGroup>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  aria-label="Filter data sources"
                  variant={typeFilter.length ? "project" : "outline"}
                >
                  <FilterIcon />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Filter by Platform</DropdownMenuLabel>
                {availableTypes.map((type) => {
                  const { name, image } = SECRET_SCANNING_DATA_SOURCE_MAP[type];

                  return (
                    <DropdownMenuCheckboxItem
                      key={type}
                      checked={typeFilter.includes(type)}
                      onClick={(e) => {
                        e.preventDefault();
                        setTypeFilter((prev) =>
                          prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
                        );
                        setPage(1);
                      }}
                    >
                      <ProviderIcon alt={`${name} data source`} icon={image} className="size-4" />
                      {name}
                    </DropdownMenuCheckboxItem>
                  );
                })}
                {!availableTypes.length && (
                  <DropdownMenuItem isDisabled>No Data Sources Configured</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          {!isLoading && !filteredDataSources.length ? (
            renderEmpty()
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  {renderSortableHead(DataSourcesOrderBy.Name, "Name", "w-1/3")}
                  <TableHead>Resources</TableHead>
                  {renderSortableHead(DataSourcesOrderBy.Findings, "Unresolved Findings")}
                  {renderSortableHead(DataSourcesOrderBy.LastScan, "Last Scan")}
                  <TableHead>Status</TableHead>
                  <TableHead variant="action" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  SKELETON_ROWS.map((row) => (
                    <TableRow key={`data-source-skeleton-${row}`}>
                      {SKELETON_CELLS.map((cell) => (
                        <TableCell key={`data-source-skeleton-${row}-${cell}`}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                {!isLoading &&
                  filteredDataSources
                    .slice(offset, perPage * page)
                    .map((dataSource) => (
                      <SecretScanningDataSourceRow
                        key={dataSource.id}
                        dataSource={dataSource}
                        onDelete={(ds) => handlePopUpOpen("deleteDataSource", ds)}
                        onEdit={(ds) => handlePopUpOpen("editDataSource", ds)}
                        onTriggerScan={handleTriggerScan}
                        onToggleEnableAutoScan={handleToggleEnableAutoScan}
                      />
                    ))}
              </TableBody>
            </Table>
          )}
          {!isLoading && Boolean(filteredDataSources.length) && (
            <Pagination
              count={filteredDataSources.length}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={setPerPage}
            />
          )}
        </CardContent>
      </Card>
      <CreateSecretScanningDataSourceSheet
        isOpen={popUp.addDataSource.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addDataSource", isOpen)}
      />
      <DeleteSecretScanningDataSourceModal
        onOpenChange={(isOpen) => handlePopUpToggle("deleteDataSource", isOpen)}
        isOpen={popUp.deleteDataSource.isOpen}
        dataSource={popUp.deleteDataSource.data}
      />
      <EditSecretScanningDataSourceSheet
        onOpenChange={(isOpen) => handlePopUpToggle("editDataSource", isOpen)}
        isOpen={popUp.editDataSource.isOpen}
        dataSource={popUp.editDataSource.data}
      />
      <UpgradeGate
        paywallKey="secret-scanning.secret-scanning-data-sources"
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        intent={SecretScanningUpgradeIntent}
      />
    </>
  );
};
