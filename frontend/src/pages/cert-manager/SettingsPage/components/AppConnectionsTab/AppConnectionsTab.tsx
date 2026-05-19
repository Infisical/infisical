import { useMemo, useState } from "react";
import { ArrowDownIcon, ArrowUpIcon, FilterIcon, PlusIcon, SearchIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Skeleton,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { ProjectPermissionSub, useProject } from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import {
  TAppConnection,
  useListAppConnections,
  useRotateAppConnectionCredentials,
  useUpdateAppConnection
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { AddAppConnectionModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components/AddAppConnectionModal";
import { DeleteAppConnectionModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components/DeleteAppConnectionModal";
import { EditAppConnectionCredentialsModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components/EditAppConnectionCredentialsModal";
import { EditAppConnectionDetailsModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components/EditAppConnectionDetailsModal";

import { AppConnectionRow } from "./AppConnectionRow";

enum AppConnectionsOrderBy {
  App = "app",
  Name = "name",
  Method = "method"
}

type AppConnectionFilters = {
  apps: AppConnection[];
};

export const AppConnectionsTab = () => {
  const { currentProject } = useProject();
  const projectId = currentProject.id;
  const projectType = currentProject.type;

  const { isPending, data: appConnections = [] } = useListAppConnections(projectId);
  const rotateCredentials = useRotateAppConnectionCredentials();
  const updateAppConnection = useUpdateAppConnection();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addConnection",
    "deleteConnection",
    "editCredentials",
    "editDetails"
  ] as const);

  const [filters, setFilters] = useState<AppConnectionFilters>({ apps: [] });

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
  } = usePagination<AppConnectionsOrderBy>(AppConnectionsOrderBy.App, {
    initPerPage: getUserTablePreference("appConnectionsTable", PreferenceKey.PerPage, 20)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("appConnectionsTable", PreferenceKey.PerPage, newPerPage);
  };

  const filteredAppConnections = useMemo(
    () =>
      appConnections
        .filter((appConnection) => {
          const { app, method, name } = appConnection;

          if (filters.apps.length && !filters.apps.includes(app)) return false;

          const searchValue = search.trim().toLowerCase();
          return (
            APP_CONNECTION_MAP[app].name.toLowerCase().includes(searchValue) ||
            getAppConnectionMethodDetails(method).name.toLowerCase().includes(searchValue) ||
            name.toLowerCase().includes(searchValue)
          );
        })
        .sort((a, b) => {
          const [one, two] = orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          switch (orderBy) {
            case AppConnectionsOrderBy.Name:
              return one.name.toLowerCase().localeCompare(two.name.toLowerCase());
            case AppConnectionsOrderBy.Method:
              return getAppConnectionMethodDetails(one.method)
                .name.toLowerCase()
                .localeCompare(getAppConnectionMethodDetails(two.method).name.toLowerCase());
            case AppConnectionsOrderBy.App:
            default:
              return APP_CONNECTION_MAP[one.app].name
                .toLowerCase()
                .localeCompare(APP_CONNECTION_MAP[two.app].name.toLowerCase());
          }
        }),
    [appConnections, orderDirection, search, orderBy, filters]
  );

  useResetPageHelper({ totalCount: filteredAppConnections.length, offset, setPage });

  const handleSort = (column: AppConnectionsOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }
    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const sortIcon = (column: AppConnectionsOrderBy) => {
    if (orderBy !== column) return <ArrowDownIcon className="opacity-30" />;
    return orderDirection === OrderByDirection.DESC ? <ArrowUpIcon /> : <ArrowDownIcon />;
  };

  const isTableFiltered = Boolean(filters.apps.length);

  const handleDelete = (appConnection: TAppConnection) =>
    handlePopUpOpen("deleteConnection", appConnection);

  const handleEditCredentials = (appConnection: TAppConnection) =>
    handlePopUpOpen("editCredentials", appConnection);

  const handleEditDetails = (appConnection: TAppConnection) =>
    handlePopUpOpen("editDetails", appConnection);

  const handleRotateCredentials = (appConnection: TAppConnection) => {
    rotateCredentials.mutate(
      { connectionId: appConnection.id, app: appConnection.app, projectId },
      {
        onSuccess: () => {
          createNotification({
            text: "Credential rotation has been triggered",
            type: "success"
          });
        },
        onError: (error) => {
          createNotification({
            text: `Failed to trigger credential rotation: ${error.message}`,
            type: "error"
          });
        }
      }
    );
  };

  const handleToggleAutoRotation = (appConnection: TAppConnection) => {
    const enabling = !appConnection.isAutoRotationEnabled;
    updateAppConnection.mutate(
      {
        connectionId: appConnection.id,
        app: appConnection.app,
        isAutoRotationEnabled: enabling
      },
      {
        onSuccess: () => {
          createNotification({
            text: `Auto-rotation ${enabling ? "enabled" : "disabled"}`,
            type: "success"
          });
        }
      }
    );
  };

  const visibleConnections = filteredAppConnections.slice(offset, perPage * page);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          App Connections
          <DocumentationLinkBadge href="https://infisical.com/docs/integrations/app-connections/overview" />
        </CardTitle>
        <CardDescription>
          Connect third-party services to issue or distribute certificates
        </CardDescription>
        <CardAction>
          <ProjectPermissionCan
            I={ProjectPermissionAppConnectionActions.Create}
            a={ProjectPermissionSub.AppConnections}
          >
            {(isAllowed) => (
              <Button
                variant="project"
                isDisabled={!isAllowed}
                onClick={() => handlePopUpOpen("addConnection")}
              >
                <PlusIcon />
                Add Connection
              </Button>
            )}
          </ProjectPermissionCan>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center gap-2">
          <InputGroup className="flex-1">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search connections..."
            />
          </InputGroup>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                aria-label="Filter Connections"
                variant={isTableFiltered ? "project" : "outline"}
                size="md"
                className={twMerge(isTableFiltered && "text-primary")}
              >
                <FilterIcon className="size-4" />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="max-h-[70vh] thin-scrollbar overflow-y-auto"
            >
              <DropdownMenuLabel>Filter by App</DropdownMenuLabel>
              {appConnections.length ? (
                [...new Set(appConnections.map(({ app }) => app))]
                  .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
                  .map((app) => {
                    const isSelected = filters.apps.includes(app);
                    return (
                      <DropdownMenuItem
                        key={app}
                        onClick={(e) => {
                          e.preventDefault();
                          setFilters((prev) => ({
                            ...prev,
                            apps: isSelected
                              ? prev.apps.filter((a) => a !== app)
                              : [...prev.apps, app]
                          }));
                        }}
                      >
                        <div className="flex w-full items-center gap-2">
                          <img
                            alt={`${APP_CONNECTION_MAP[app].name} integration`}
                            src={`/images/integrations/${APP_CONNECTION_MAP[app].image}`}
                            className="h-4 w-4"
                          />
                          <span className="flex-1">{APP_CONNECTION_MAP[app].name}</span>
                          {isSelected && <span className="text-primary">✓</span>}
                        </div>
                      </DropdownMenuItem>
                    );
                  })
              ) : (
                <DropdownMenuItem isDisabled>No Connections Configured</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* eslint-disable-next-line no-nested-ternary */}
        {isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : visibleConnections.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>
                {appConnections.length
                  ? "No connections match your filters"
                  : "No App Connections have been configured"}
              </EmptyTitle>
              <EmptyDescription>
                Create a connection to a third-party service to issue or distribute certificates
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="w-1/4"
                    onClick={() => handleSort(AppConnectionsOrderBy.App)}
                  >
                    App
                    {sortIcon(AppConnectionsOrderBy.App)}
                  </TableHead>
                  <TableHead
                    className="w-1/3"
                    onClick={() => handleSort(AppConnectionsOrderBy.Name)}
                  >
                    Name
                    {sortIcon(AppConnectionsOrderBy.Name)}
                  </TableHead>
                  <TableHead onClick={() => handleSort(AppConnectionsOrderBy.Method)}>
                    Method
                    {sortIcon(AppConnectionsOrderBy.Method)}
                  </TableHead>
                  <TableHead className="w-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleConnections.map((connection) => (
                  <AppConnectionRow
                    appConnection={connection}
                    key={connection.id}
                    onDelete={handleDelete}
                    onEditCredentials={handleEditCredentials}
                    onEditDetails={handleEditDetails}
                    onRotateCredentials={handleRotateCredentials}
                    onToggleAutoRotation={handleToggleAutoRotation}
                  />
                ))}
              </TableBody>
            </Table>
            {Boolean(filteredAppConnections.length) && (
              <div className="mt-4 flex justify-end">
                <Pagination
                  count={filteredAppConnections.length}
                  page={page}
                  perPage={perPage}
                  onChangePage={setPage}
                  onChangePerPage={handlePerPageChange}
                />
              </div>
            )}
          </>
        )}
      </CardContent>

      <DeleteAppConnectionModal
        isOpen={popUp.deleteConnection.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteConnection", isOpen)}
        appConnection={popUp.deleteConnection.data}
      />
      <EditAppConnectionCredentialsModal
        isOpen={popUp.editCredentials.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("editCredentials", isOpen)}
        appConnection={popUp.editCredentials.data}
      />
      <EditAppConnectionDetailsModal
        isOpen={popUp.editDetails.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("editDetails", isOpen)}
        appConnection={popUp.editDetails.data}
      />
      <AddAppConnectionModal
        isOpen={popUp.addConnection.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addConnection", isOpen)}
        projectId={projectId}
        projectType={projectType}
      />
    </Card>
  );
};
