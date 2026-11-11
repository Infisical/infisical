import { useEffect, useMemo, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";

import { FilterBar } from "@app/components/v4/patterns/filter-bar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Button } from "@app/components/v4/ui/button";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { List, ListRow } from "@app/components/v4/ui/list";
import { Pagination } from "@app/components/v4/ui/pagination";
import { RowLink } from "@app/components/v4/ui/row-link";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetSubheader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import { Meta, StatusText } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";
import {
  ProjectPermissionSecretScanningDataSourceActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import {
  canAddSecretScanningResources,
  getAddedResourceScanDescription,
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_MAP
} from "@app/helpers/secretScanningV2";
import { useDebounce } from "@app/hooks";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  SecretScanningDataSource,
  SecretScanningResourceOrderBy,
  SecretScanningScanStatus
} from "@app/hooks/api/secretScanningV2/enums";
import type {
  TSecretScanningDataSource,
  TSecretScanningResourceWithDetails
} from "@app/hooks/api/secretScanningV2/types";
import { GitLabDataSourceScope } from "@app/hooks/api/secretScanningV2/types/gitlab-data-source";

import { useProjectPermission } from "../../access/permissions";
import { errorMessage, failed, toast } from "../../access/toast";
import { AccessRestricted, RESTRICTED } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";

const route = v4Path("/organizations/$orgId/secret-scanning/data-sources/$type/$dataSourceId");

const ResourceStatus = ({ resource }: { resource: TSecretScanningResourceWithDetails }) => {
  const { lastScanStatus, lastScanStatusMessage, lastScannedAt, unresolvedFindings } = resource;
  if (lastScanStatus === SecretScanningScanStatus.Failed)
    return (
      <Tooltip content={lastScanStatusMessage ?? "The scan failed."} side="left">
        <StatusText tone="bad" icon="x" tabIndex={0}>
          Scan error
        </StatusText>
      </Tooltip>
    );
  if (lastScanStatus === SecretScanningScanStatus.Queued)
    return <StatusText icon="clock">Queued</StatusText>;
  if (lastScanStatus === SecretScanningScanStatus.Scanning)
    return <StatusText icon="sync">Scanning</StatusText>;
  if (!lastScannedAt) return <Meta mono={false}>Not scanned</Meta>;
  if (unresolvedFindings)
    return (
      <StatusText tone="warn" icon="alert">
        {unresolvedFindings} {unresolvedFindings === 1 ? "finding" : "findings"}
      </StatusText>
    );
  return (
    <StatusText tone="ok" icon="check-c">
      No secrets detected
    </StatusText>
  );
};

const AddResourceSheet = ({
  dataSource,
  open,
  onClose
}: {
  dataSource: TSecretScanningDataSource;
  open: boolean;
  onClose: () => void;
}) => {
  const scanning = useV4Adapter("secretScanning");
  const [query, setQuery] = useState("");
  const [pendingName, setPendingName] = useState<string>();
  const {
    data: resources = [],
    isPending,
    error,
    refetch
  } = scanning.useAvailableResources(
    { dataSourceId: dataSource.id, type: dataSource.type },
    { enabled: open }
  );
  const addResource = scanning.useAddResource();
  const resource = RESOURCE_DESCRIPTION_HELPER[dataSource.type];
  const platform = SECRET_SCANNING_DATA_SOURCE_MAP[dataSource.type].name;
  const available = useMemo(() => {
    const search = query.trim().toLowerCase();
    return resources.filter(
      ({ name, isIncluded }) => !isIncluded && name.toLowerCase().includes(search)
    );
  }, [resources, query]);
  const hasExcluded = resources.some(({ isIncluded }) => !isIncluded);

  const add = async (resourceName: string) => {
    setPendingName(resourceName);
    try {
      await addResource.mutateAsync({
        dataSourceId: dataSource.id,
        type: dataSource.type,
        projectId: dataSource.projectId,
        resourceName
      });
    } catch (cause) {
      failed(`Failed to add ${resourceName}`, cause);
      return;
    } finally {
      setPendingName(undefined);
    }
    toast({
      tone: "ok",
      title: `Added ${resourceName}`,
      description: getAddedResourceScanDescription(dataSource)
    });
  };

  const body = () => {
    if (isPending)
      return (
        <Stack gap={8}>
          {["first", "second", "third"].map((row) => (
            <Skeleton key={row} style={{ height: 40 }} />
          ))}
        </Stack>
      );
    if (error)
      return (
        <EmptyState
          size="sm"
          icon="alert"
          title={`Couldn't load ${resource.pluralNoun}`}
          description={
            errorMessage(error) ??
            `Check that the app connection still has access to ${platform}, then try again.`
          }
          actions={
            <Button variant="outline" icon="sync" onClick={() => refetch()}>
              Try again
            </Button>
          }
        />
      );
    if (!available.length)
      return (
        <EmptyState
          size="sm"
          media="bare"
          icon={hasExcluded ? "search" : "git"}
          title={
            hasExcluded
              ? `No ${resource.pluralNoun} match your search`
              : `No ${resource.pluralNoun} left to add`
          }
          description={
            hasExcluded
              ? undefined
              : `Every ${resource.singularNoun} this connection can access is already scanned.`
          }
        />
      );
    return (
      <List label={`Available ${resource.pluralNoun}`}>
        {available.map(({ externalId, name }) => (
          <ListRow
            key={externalId}
            value={externalId}
            label={name}
            title={<code>{name}</code>}
            actions={
              <Button
                variant="outline"
                size="sm"
                loading={pendingName === name}
                disabled={Boolean(pendingName) && pendingName !== name}
                onClick={() => add(name)}
              >
                Enable scanning
              </Button>
            }
          />
        ))}
      </List>
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        setQuery("");
        onClose();
      }}
    >
      <SheetContent onOpenAutoFocus={(event) => event.preventDefault()}>
        <SheetHeader>
          <SheetTitle>Add {resource.singularNoun}</SheetTitle>
          <SheetDescription>
            {dataSource.isHistoricalScanEnabled
              ? `Its full history is scanned as soon as it's added.`
              : getAddedResourceScanDescription(dataSource)}
          </SheetDescription>
        </SheetHeader>
        <SheetSubheader>
          <Input
            icon="search"
            aria-label={`Search ${resource.pluralNoun}`}
            placeholder={`Search ${resource.pluralNoun}...`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </SheetSubheader>
        <SheetBody>{body()}</SheetBody>
        <SheetFooter>
          <Inline gap={8} justify="end">
            <Button variant="outline" onClick={onClose}>
              Done
            </Button>
          </Inline>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export const ResourcesTab = ({ dataSource }: { dataSource: TSecretScanningDataSource }) => {
  const { orgId } = useParams({ from: route });
  const scanning = useV4Adapter("secretScanning");
  const { permission } = useProjectPermission(dataSource.projectId);
  const can = (action: ProjectPermissionSecretScanningDataSourceActions) =>
    permission.can(action, ProjectPermissionSub.SecretScanningDataSources);
  const canRead = can(ProjectPermissionSecretScanningDataSourceActions.ReadResources);
  const canScan = can(ProjectPermissionSecretScanningDataSourceActions.TriggerScans);
  const canEdit = can(ProjectPermissionSecretScanningDataSourceActions.Edit);
  const [query, setQuery] = useState("");
  const [debounced] = useDebounce(query.trim());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" }>({
    columnId: SecretScanningResourceOrderBy.Name,
    direction: "asc"
  });
  const [adding, setAdding] = useState(false);
  const [addingAll, setAddingAll] = useState(false);
  const [removing, setRemoving] = useState<TSecretScanningResourceWithDetails>();
  const [pending, setPending] = useState(false);
  const { data, isPending } = scanning.useResourcesWithDetails(
    {
      dataSourceId: dataSource.id,
      type: dataSource.type,
      search: debounced || undefined,
      orderBy: sort.columnId as SecretScanningResourceOrderBy,
      orderDirection: sort.direction === "asc" ? OrderByDirection.ASC : OrderByDirection.DESC,
      offset: (page - 1) * pageSize,
      limit: pageSize
    },
    { enabled: canRead, refetchInterval: 30000 }
  );
  const triggerScan = scanning.useTriggerScan();
  const removeResource = scanning.useRemoveResource();
  const addAllResources = scanning.useAddAllResources();
  const rows = data?.resources ?? [];
  const totalCount = data?.totalCount ?? 0;
  const resource = RESOURCE_DESCRIPTION_HELPER[dataSource.type];
  const canChangeResources = canAddSecretScanningResources(dataSource);
  const addAllUnsupported =
    dataSource.type === SecretScanningDataSource.GitLab &&
    dataSource.config.scope === GitLabDataSourceScope.Account;

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(totalCount / pageSize));
    if (page > lastPage) setPage(lastPage);
  }, [totalCount, page, pageSize]);

  if (!canRead) return <AccessRestricted requirement={`Read ${resource.pluralNoun}`} />;

  let scanReason: string | undefined;
  if (!canScan) scanReason = RESTRICTED;
  else if (dataSource.isDisconnected) scanReason = "This data source is disconnected";
  let addReason: string | undefined;
  if (!canEdit) addReason = RESTRICTED;
  else if (dataSource.isDisconnected) addReason = "This data source is disconnected";

  const columns: DataTableColumn<TSecretScanningResourceWithDetails>[] = [
    {
      id: SecretScanningResourceOrderBy.Name,
      header: resource.singularTitle,
      primary: true,
      sortable: true,
      grow: true,
      text: (row) => row.name,
      render: (row) => (
        <RowLink
          to={route}
          params={{ orgId, type: dataSource.type, dataSourceId: dataSource.id }}
          search={{ resourceId: row.id }}
          title={row.name}
        >
          <code>{row.name}</code>
        </RowLink>
      )
    },
    {
      id: SecretScanningResourceOrderBy.Status,
      header: "Status",
      sortable: true,
      width: 200,
      render: (row) => <ResourceStatus resource={row} />
    },
    {
      id: SecretScanningResourceOrderBy.LastScanned,
      header: "Last scan",
      sortable: true,
      width: 160,
      render: (row) => (
        <Meta mono={false}>
          {row.lastScannedAt
            ? formatDistanceToNowStrict(new Date(row.lastScannedAt), { addSuffix: true })
            : "Never"}
        </Meta>
      )
    }
  ];

  const scan = async (row: TSecretScanningResourceWithDetails) => {
    try {
      await triggerScan.mutateAsync({
        dataSourceId: dataSource.id,
        type: dataSource.type,
        projectId: dataSource.projectId,
        resourceId: row.id
      });
    } catch (error) {
      failed("Failed to trigger scan", error);
      return;
    }
    toast({ tone: "ok", title: `Scan triggered for ${row.name}` });
  };

  return (
    <Stack gap={16}>
      <FilterBar
        label={`${resource.singularTitle} filters`}
        fields={[]}
        value={[]}
        onChange={() => undefined}
        search={
          <Input
            icon="search"
            aria-label={`Search ${resource.pluralNoun}`}
            placeholder={`Search ${resource.pluralNoun}...`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        }
        actions={
          canChangeResources ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button layout="trigger" variant="accent" icon="plus" disabledReason={addReason}>
                  Add {resource.singularNoun}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setAdding(true)}>
                  <Icon name="plus" />
                  Add {resource.singularNoun}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabledReason={
                    addAllUnsupported
                      ? "Without a group, add projects one at a time so each one is watched for new commits."
                      : undefined
                  }
                  onSelect={() => setAddingAll(true)}
                >
                  <Icon name="download" />
                  Add all {resource.pluralNoun}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined
        }
      />
      <DataTable
        label={resource.pluralTitle}
        rows={rows}
        columns={columns}
        loading={isPending}
        loadingRows={3}
        getRowId={(row) => row.id}
        rowLabel={(row) => row.name}
        sort={sort}
        onSortChange={(next) => {
          setSort({
            ...next,
            direction:
              next.columnId !== sort.columnId &&
              next.columnId === SecretScanningResourceOrderBy.LastScanned
                ? "desc"
                : next.direction
          });
          setPage(1);
        }}
        rowActions={{
          inline: [
            {
              label: "Trigger scan",
              icon: "sync",
              disabledReason: () => scanReason,
              onSelect: scan
            }
          ],
          menuLabel: `${resource.singularTitle} options`,
          renderMenu: (row) => (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  navigator.clipboard.writeText(row.id);
                  toast({ tone: "ok", title: `${resource.singularTitle} ID copied to clipboard` });
                }}
              >
                Copy {resource.singularNoun} ID
              </DropdownMenuItem>
              {canChangeResources && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabledReason={canEdit ? undefined : RESTRICTED}
                    onSelect={() => setRemoving(row)}
                  >
                    Remove {resource.singularNoun}
                  </DropdownMenuItem>
                </>
              )}
            </>
          )
        }}
        empty={
          debounced ? (
            <EmptyState
              size="sm"
              media="bare"
              icon="search"
              title={`No ${resource.pluralNoun} match your search`}
            />
          ) : (
            <EmptyState
              size="sm"
              media="bare"
              icon="git"
              title={`No ${resource.pluralNoun} yet`}
              description={`Add a ${resource.singularNoun} to start scanning it for secrets.`}
            />
          )
        }
        pagination={
          totalCount > 0 ? (
            <Pagination
              label={`${resource.singularTitle} pages`}
              variant="compact"
              page={page}
              onPageChange={setPage}
              total={totalCount}
              pageSize={pageSize}
              pageSizeOptions={[10, 20, 50, 100]}
              onPageSizeChange={(next) => {
                setPageSize(next);
                setPage(1);
              }}
            />
          ) : undefined
        }
      />
      <AddResourceSheet dataSource={dataSource} open={adding} onClose={() => setAdding(false)} />
      <AlertDialog open={addingAll} onOpenChange={setAddingAll}>
        <AlertDialogContent pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Add all {resource.pluralNoun}?</AlertDialogTitle>
            <AlertDialogDescription>
              {`Every ${resource.singularNoun} the ${SECRET_SCANNING_DATA_SOURCE_MAP[dataSource.type].name} connection can access is added. ${getAddedResourceScanDescription(dataSource)}${dataSource.isDiscoveryEnabled ? ` ${resource.pluralTitle} created later are added automatically.` : ""}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (event) => {
                event.preventDefault();
                setPending(true);
                let added: { id: string; name: string }[];
                try {
                  added = await addAllResources.mutateAsync({
                    dataSourceId: dataSource.id,
                    type: dataSource.type,
                    projectId: dataSource.projectId
                  });
                } catch (error) {
                  failed(`Failed to add ${resource.pluralNoun}`, error);
                  return;
                } finally {
                  setPending(false);
                }
                setAddingAll(false);
                toast({
                  tone: "ok",
                  title: added.length
                    ? `Added ${added.length} ${added.length === 1 ? resource.singularNoun : resource.pluralNoun}`
                    : `Every ${resource.singularNoun} the connection can access is already added`,
                  description: added.length
                    ? getAddedResourceScanDescription(dataSource)
                    : undefined
                });
              }}
            >
              Add all {resource.pluralNoun}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(removing)}
        onOpenChange={(next) => !next && setRemoving(undefined)}
      >
        <AlertDialogContent tone="danger" pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Remove ${removing?.name ?? resource.singularNoun}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {`This ${resource.singularNoun} won't be scanned anymore, and its scans and findings are permanently deleted.${dataSource.isDiscoveryEnabled ? " Discovery is on, so it's added back the next time someone pushes to it." : ""}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async (event) => {
                event.preventDefault();
                if (!removing) return;
                setPending(true);
                try {
                  await removeResource.mutateAsync({
                    dataSourceId: dataSource.id,
                    type: dataSource.type,
                    projectId: dataSource.projectId,
                    resourceId: removing.id
                  });
                } catch (error) {
                  failed(`Failed to remove ${removing.name}`, error);
                  return;
                } finally {
                  setPending(false);
                }
                toast({ tone: "ok", title: `Removed ${removing.name}` });
                setRemoving(undefined);
              }}
            >
              Remove {resource.singularNoun}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Stack>
  );
};
