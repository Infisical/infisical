import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ChevronDownIcon, FilterIcon, PlusIcon, SearchIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { VariablePermissionCan } from "@app/components/permissions";
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { OrgPermissionSubjects, ProjectPermissionSub } from "@app/context";
import { OrgPermissionAppConnectionActions } from "@app/context/OrgPermissionContext/types";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, usePopUp, useResetPageHelper, useScopeVariant } from "@app/hooks";
import {
  TAppConnection,
  useListAppConnections,
  useRotateAppConnectionCredentials,
  useUpdateAppConnection
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { AddAppConnectionModal } from "./AddAppConnectionModal";
import { AppConnectionRow } from "./AppConnectionRow";
import { DeleteAppConnectionModal } from "./DeleteAppConnectionModal";
import { EditAppConnectionCredentialsModal } from "./EditAppConnectionCredentialsModal";
import { EditAppConnectionDetailsModal } from "./EditAppConnectionDetailsModal";

enum AppConnectionsOrderBy {
  App = "app",
  Name = "name",
  Method = "method",
  ManagedBy = "managed-by"
}

type AppConnectionFilters = {
  apps: AppConnection[];
};

enum View {
  All = "all",
  Scope = "scope"
}

const APP_CONNECTION_VIEW_STORAGE_KEY = "app-connection-view";

type Props = {
  projectId?: string;
  projectType?: ProjectType;
};

export const AppConnectionsTable = ({ projectId, projectType }: Props) => {
  const isProjectView = Boolean(projectId);
  const isCertManagerView = projectType === ProjectType.CertificateManager;
  const scopeVariant = useScopeVariant();
  const { isPending, data: appConnections = [] } = useListAppConnections(projectId);
  const rotateCredentials = useRotateAppConnectionCredentials();
  const updateAppConnection = useUpdateAppConnection();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addConnection",
    "deleteConnection",
    "editCredentials",
    "editDetails"
  ] as const);

  // When returning from the "Create new GitHub App" flow, reopen the Add Connection modal straight
  // into that app's form (the param is set by the GitHub manifest callback).
  const routeSearch = useSearch({ strict: false }) as { addConnectionApp?: AppConnection };
  const navigate = useNavigate();
  const [presetApp, setPresetApp] = useState<AppConnection | undefined>();

  useEffect(() => {
    if (!routeSearch.addConnectionApp) return;
    setPresetApp(routeSearch.addConnectionApp);
    handlePopUpOpen("addConnection");
    navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({ ...prev, addConnectionApp: undefined }),
      replace: true
    });
  }, [routeSearch.addConnectionApp]);

  const [view, setView] = useState<View>(() => {
    const storedView = localStorage.getItem(APP_CONNECTION_VIEW_STORAGE_KEY) as View | null;

    if (storedView && Object.values(View).includes(storedView)) return storedView;

    return View.Scope;
  });

  const [filters, setFilters] = useState<AppConnectionFilters>({
    apps: []
  });

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

          if (view === View.Scope && !isProjectView && appConnection.projectId) {
            return false;
          }

          if (filters.apps.length && !filters.apps.includes(app)) return false;

          const searchValue = search.trim().toLowerCase();

          return (
            APP_CONNECTION_MAP[app].name.toLowerCase().includes(searchValue) ||
            getAppConnectionMethodDetails(method).name.toLowerCase().includes(searchValue) ||
            name.toLowerCase().includes(searchValue)
          );
        })
        .sort((a, b) => {
          const [connectionOne, connectionTwo] =
            orderDirection === OrderByDirection.ASC ? [a, b] : [b, a];

          switch (orderBy) {
            case AppConnectionsOrderBy.Name:
              return connectionOne.name
                .toLowerCase()
                .localeCompare(connectionTwo.name.toLowerCase());
            case AppConnectionsOrderBy.Method:
              return getAppConnectionMethodDetails(connectionOne.method)
                .name.toLowerCase()
                .localeCompare(
                  getAppConnectionMethodDetails(connectionTwo.method).name.toLowerCase()
                );
            case AppConnectionsOrderBy.ManagedBy:
              if (!connectionOne.project) return 1;
              if (!connectionTwo.project) return -1;

              return connectionOne.project.name
                .toLowerCase()
                .localeCompare(connectionTwo.project.name.toLowerCase());
            case AppConnectionsOrderBy.App:
            default:
              return APP_CONNECTION_MAP[connectionOne.app].name
                .toLowerCase()
                .localeCompare(APP_CONNECTION_MAP[connectionTwo.app].name.toLowerCase());
          }
        }),
    [appConnections, orderDirection, search, orderBy, filters, view]
  );

  useResetPageHelper({
    totalCount: filteredAppConnections.length,
    offset,
    setPage
  });

  const handleSort = (column: AppConnectionsOrderBy) => {
    if (column === orderBy) {
      toggleOrderDirection();
      return;
    }

    setOrderBy(column);
    setOrderDirection(OrderByDirection.ASC);
  };

  const renderSortIcon = (col: AppConnectionsOrderBy) =>
    orderBy === col ? (
      <ChevronDownIcon
        className={twMerge(
          "ml-1 size-3.5 transition-transform",
          orderDirection === OrderByDirection.DESC && "rotate-180"
        )}
      />
    ) : null;

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
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            App Connections
            <DocumentationLinkBadge href="https://infisical.com/docs/integrations/app-connections/overview" />
          </CardTitle>
          <CardDescription>
            {isCertManagerView
              ? "Create and configure connections with third-party apps for your Applications and Signers."
              : `Create and configure connections with third-party apps for re-use across your project${
                  isProjectView ? "" : "s"
                }.`}
          </CardDescription>
          <CardAction>
            <VariablePermissionCan
              type={isProjectView ? "project" : "org"}
              I={
                isProjectView
                  ? ProjectPermissionAppConnectionActions.Create
                  : OrgPermissionAppConnectionActions.Create
              }
              a={
                isProjectView
                  ? ProjectPermissionSub.AppConnections
                  : OrgPermissionSubjects.AppConnections
              }
            >
              {(isAllowed) => (
                <Button
                  variant={scopeVariant}
                  onClick={() => handlePopUpOpen("addConnection")}
                  isDisabled={!isAllowed}
                >
                  <PlusIcon />
                  Add Connection
                </Button>
              )}
            </VariablePermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {!isProjectView && (
              <Tabs
                value={view}
                onValueChange={(next) => {
                  setView(next as View);
                  localStorage.setItem(APP_CONNECTION_VIEW_STORAGE_KEY, next);
                }}
              >
                <TabsList variant="filled">
                  <TabsTrigger value={View.Scope}>Organization</TabsTrigger>
                  <TabsTrigger value={View.All}>All</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <InputGroup className="flex-1">
              <InputGroupAddon align="inline-start">
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Search connections..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  aria-label="Filter Connections"
                  variant={isTableFiltered ? scopeVariant : "outline"}
                >
                  <FilterIcon />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                sideOffset={2}
                className="max-h-[70vh] thin-scrollbar overflow-y-auto"
                align="end"
              >
                <DropdownMenuLabel>Filter by Apps</DropdownMenuLabel>
                {appConnections.length ? (
                  [...new Set(appConnections.map(({ app }) => app))]
                    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
                    .map((app) => (
                      <DropdownMenuCheckboxItem
                        key={app}
                        checked={filters.apps.includes(app)}
                        onClick={(e) => {
                          e.preventDefault();
                          setFilters((prev) => ({
                            ...prev,
                            apps: prev.apps.includes(app)
                              ? prev.apps.filter((a) => a !== app)
                              : [...prev.apps, app]
                          }));
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <img
                            alt={`${APP_CONNECTION_MAP[app].name} integration`}
                            src={`/images/integrations/${APP_CONNECTION_MAP[app].image}`}
                            className="h-4 w-4"
                          />
                          <span>{APP_CONNECTION_MAP[app].name}</span>
                        </div>
                      </DropdownMenuCheckboxItem>
                    ))
                ) : (
                  <DropdownMenuLabel className="font-normal text-mineshaft-400">
                    No Connections Configured
                  </DropdownMenuLabel>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="mt-4">
            {!isPending && !filteredAppConnections.length ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>
                    {appConnections.length
                      ? "No App Connections match search"
                      : "No App Connections have been configured"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {appConnections.length
                      ? "Adjust your search or filters to view connections."
                      : "Add a connection to a third-party app to get started."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        className="w-1/4 cursor-pointer"
                        onClick={() => handleSort(AppConnectionsOrderBy.App)}
                      >
                        App
                        {renderSortIcon(AppConnectionsOrderBy.App)}
                      </TableHead>
                      <TableHead
                        className="w-1/3 cursor-pointer"
                        onClick={() => handleSort(AppConnectionsOrderBy.Name)}
                      >
                        Name
                        {renderSortIcon(AppConnectionsOrderBy.Name)}
                      </TableHead>
                      <TableHead
                        className="cursor-pointer"
                        onClick={() => handleSort(AppConnectionsOrderBy.Method)}
                      >
                        Method
                        {renderSortIcon(AppConnectionsOrderBy.Method)}
                      </TableHead>
                      {!isProjectView && (
                        <TableHead
                          className="cursor-pointer"
                          onClick={() => handleSort(AppConnectionsOrderBy.ManagedBy)}
                        >
                          Managed By
                          {renderSortIcon(AppConnectionsOrderBy.ManagedBy)}
                        </TableHead>
                      )}
                      <TableHead className="w-5" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isPending &&
                      Array.from({ length: 10 }).map((_, i) => (
                        <TableRow key={`skeleton-${i + 1}`}>
                          <TableCell>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                          <TableCell>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                          {!isProjectView && (
                            <TableCell>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                          )}
                          <TableCell>
                            <Skeleton className="h-4 w-4" />
                          </TableCell>
                        </TableRow>
                      ))}
                    {!isPending &&
                      visibleConnections.map((connection) => (
                        <AppConnectionRow
                          appConnection={connection}
                          key={connection.id}
                          onDelete={handleDelete}
                          onEditCredentials={handleEditCredentials}
                          onEditDetails={handleEditDetails}
                          onRotateCredentials={handleRotateCredentials}
                          onToggleAutoRotation={handleToggleAutoRotation}
                          isProjectView={isProjectView}
                        />
                      ))}
                  </TableBody>
                </Table>
                {!isPending && (
                  <Pagination
                    count={filteredAppConnections.length}
                    page={page}
                    perPage={perPage}
                    onChangePage={setPage}
                    onChangePerPage={handlePerPageChange}
                  />
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
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
        onOpenChange={(isOpen) => {
          handlePopUpToggle("addConnection", isOpen);
          if (!isOpen) setPresetApp(undefined);
        }}
        app={presetApp}
        projectId={projectId}
        projectType={projectType}
      />
    </>
  );
};
