/* eslint-disable @typescript-eslint/no-use-before-define */
import { ReactNode, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  ArrowDownAZIcon,
  ArrowUpAZIcon,
  CheckIcon,
  ChevronLeftIcon,
  ClockIcon,
  LayersIcon,
  LayoutGridIcon,
  ListIcon,
  PlusIcon,
  SearchIcon,
  StarIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { OrgPermissionCan } from "@app/components/permissions";
import { NewProjectModal } from "@app/components/projects";
import { CertManagerNotConfiguredModal } from "@app/components/projects/CertManagerNotConfiguredModal";
import { RequestProjectAccessModal } from "@app/components/projects/RequestProjectAccessModal";
import { PageHeader } from "@app/components/v2";
import {
  Badge,
  Button,
  ButtonGroup,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission,
  useSubscription
} from "@app/context";
import {
  OrgPermissionAdminConsoleAction,
  OrgPermissionProjectActions
} from "@app/context/OrgPermissionContext/types";
import {
  getProjectDescription,
  getProjectHomePage,
  getProjectLucideIcon,
  getProjectTitle,
  PROJECT_TILE_STYLE,
  urlSlugToProjectType
} from "@app/helpers/project";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import {
  useGetMyPendingProjectAccessRequests,
  useGetUserProjects,
  useOrgAdminAccessProject,
  useSearchProjects
} from "@app/hooks/api";
import { useCertManagerInstanceState } from "@app/hooks/api/certManagerInstance";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { Project, ProjectEnv, ProjectType } from "@app/hooks/api/projects/types";
import { useUpdateUserProjectFavorites } from "@app/hooks/api/users/mutation";
import { useGetUserProjectFavorites } from "@app/hooks/api/users/queries";
import {
  ProjectListToggle,
  ProjectListView
} from "@app/pages/organization/ProjectsPage/components/ProjectListToggle";

enum ProjectsViewMode {
  GRID = "grid",
  LIST = "list"
}

export const ProjectTypePage = () => {
  const navigate = useNavigate();
  const { orgId, type: typeSlug } = useParams({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/$type"
  });
  const projectType = urlSlugToProjectType(typeSlug) ?? (typeSlug as ProjectType);

  const { data: certManagerInstance } = useCertManagerInstanceState();
  const [isCertManagerSetupOpen, setIsCertManagerSetupOpen] = useState(false);

  useEffect(() => {
    if (projectType === ProjectType.CertificateManager) {
      if (certManagerInstance?.activeProjectId) {
        navigate({
          to: "/organizations/$orgId/projects/cert-manager/$projectId/overview",
          params: { orgId, projectId: certManagerInstance.activeProjectId }
        });
      } else if (certManagerInstance && !certManagerInstance.activeProjectId) {
        setIsCertManagerSetupOpen(true);
      }
    }
  }, [projectType, certManagerInstance, orgId, navigate]);

  useEffect(() => {
    if (projectType === ProjectType.PAM) {
      navigate({
        to: "/organizations/$orgId/pam/access",
        params: { orgId }
      });
    }
  }, [projectType, orgId, navigate]);

  if (projectType === ProjectType.CertificateManager) {
    return (
      <CertManagerNotConfiguredModal
        isOpen={isCertManagerSetupOpen}
        onOpenChange={(open) => {
          setIsCertManagerSetupOpen(open);
          if (!open) {
            navigate({
              to: "/organizations/$orgId/projects",
              params: { orgId }
            });
          }
        }}
      />
    );
  }

  if (projectType === ProjectType.PAM) {
    return null;
  }

  return <ProjectTypeContent projectType={projectType} orgId={orgId} />;
};

const ProjectTypeContent = ({
  projectType,
  orgId
}: {
  projectType: ProjectType;
  orgId: string;
}) => {
  const { subscription } = useSubscription();
  const { permission } = useOrgPermission();
  const canRequestAccess = permission.can(
    OrgPermissionProjectActions.RequestAccess,
    OrgPermissionSubjects.Project
  );
  const isAddingProjectsAllowed = subscription?.workspaceLimit
    ? subscription.workspacesUsed < subscription.workspaceLimit
    : true;

  const [projectListView, setProjectListView] = useState<ProjectListView>(() => {
    const storedView = localStorage.getItem("projectListView");
    if (
      storedView &&
      canRequestAccess &&
      (storedView === ProjectListView.AllProjects || storedView === ProjectListView.MyProjects)
    ) {
      return storedView;
    }
    return ProjectListView.MyProjects;
  });

  const handleSetProjectListView = (value: ProjectListView) => {
    localStorage.setItem("projectListView", value);
    setProjectListView(value);
  };

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addNewWs",
    "upgradePlan",
    "requestAccessConfirmation"
  ] as const);

  const typeTitle = getProjectTitle(projectType);

  return (
    <div className="mx-auto flex max-w-8xl flex-col">
      <Helmet>
        <title>{typeTitle} Projects</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <Link
        to="/organizations/$orgId/projects"
        params={{ orgId }}
        className="mb-4 flex w-fit items-center gap-x-1 text-sm text-mineshaft-400 transition duration-100 hover:text-mineshaft-400/80"
      >
        <ChevronLeftIcon size={16} />
        Organization
      </Link>
      <PageHeader
        title={typeTitle}
        description={getProjectDescription(projectType)}
        scope={projectType}
        icon={getProjectLucideIcon(projectType)}
      />
      {projectListView === ProjectListView.MyProjects || !canRequestAccess ? (
        <MyProjectsForType
          projectType={projectType}
          projectListView={projectListView}
          onProjectListViewChange={handleSetProjectListView}
          onAddNewProject={() => handlePopUpOpen("addNewWs")}
          onUpgradePlan={() => handlePopUpOpen("upgradePlan")}
          isAddingProjectsAllowed={isAddingProjectsAllowed}
          hideProjectListToggle={!canRequestAccess}
        />
      ) : (
        <AllProjectsForType
          projectType={projectType}
          projectListView={projectListView}
          onProjectListViewChange={handleSetProjectListView}
          onAddNewProject={() => handlePopUpOpen("addNewWs")}
          onUpgradePlan={() => handlePopUpOpen("upgradePlan")}
          isAddingProjectsAllowed={isAddingProjectsAllowed}
          hideProjectListToggle={!canRequestAccess}
        />
      )}
      <NewProjectModal
        isOpen={popUp.addNewWs.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addNewWs", isOpen)}
        projectType={projectType}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You have reached the maximum number of projects allowed on your current plan. Upgrade to Infisical Pro plan to add more projects."
      />
    </div>
  );
};

type SubViewProps = {
  projectType: ProjectType;
  projectListView: ProjectListView;
  onProjectListViewChange: (value: ProjectListView) => void;
  onAddNewProject: () => void;
  onUpgradePlan: () => void;
  isAddingProjectsAllowed: boolean;
  hideProjectListToggle: boolean;
};

const MyProjectsForType = ({
  projectType,
  projectListView,
  onProjectListViewChange,
  hideProjectListToggle,
  onAddNewProject,
  onUpgradePlan,
  isAddingProjectsAllowed
}: SubViewProps) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const [searchFilter, setSearchFilter] = useState("");
  const [projectsViewMode, setProjectsViewMode] = useState<ProjectsViewMode>(
    (localStorage.getItem("projectsViewMode") as ProjectsViewMode) || ProjectsViewMode.GRID
  );

  const { data: rawWorkspaces = [], isPending: isWorkspaceLoading } = useGetUserProjects();
  const workspaces = useMemo(
    () => rawWorkspaces.filter((w) => w.type === projectType),
    [rawWorkspaces, projectType]
  );

  const {
    setPage,
    perPage,
    setPerPage,
    page,
    offset,
    limit,
    toggleOrderDirection,
    orderDirection
  } = usePagination("name", {
    initPerPage: getUserTablePreference("myProjectsTable", PreferenceKey.PerPage, 24)
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("myProjectsTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data: projectFavorites, isPending: isProjectFavoritesLoading } =
    useGetUserProjectFavorites(currentOrg?.id);
  const { mutateAsync: updateUserProjectFavorites } = useUpdateUserProjectFavorites();

  const isProjectViewLoading = isWorkspaceLoading || isProjectFavoritesLoading;

  const filteredWorkspaces = useMemo(
    () =>
      workspaces
        .filter((ws) => ws?.name?.toLowerCase().includes(searchFilter.toLowerCase()))
        .sort((a, b) =>
          orderDirection === OrderByDirection.ASC
            ? a.name.toLowerCase().localeCompare(b.name.toLowerCase())
            : b.name.toLowerCase().localeCompare(a.name.toLowerCase())
        ),
    [searchFilter, orderDirection, workspaces]
  );

  useResetPageHelper({
    setPage,
    offset,
    totalCount: filteredWorkspaces.length
  });

  const workspacesWithFaveProp = useMemo(
    () =>
      filteredWorkspaces
        .map((w): Project & { isFavorite: boolean } => ({
          ...w,
          isFavorite: Boolean(projectFavorites?.includes(w.id))
        }))
        .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite))
        .slice(offset, limit * page),
    [filteredWorkspaces, projectFavorites, offset, limit, page]
  );

  const addProjectToFavorites = async (projectId: string) => {
    if (currentOrg?.id) {
      await updateUserProjectFavorites({
        orgId: currentOrg.id,
        projectFavorites: [...(projectFavorites || []), projectId]
      });
    }
  };

  const removeProjectFromFavorites = async (projectId: string) => {
    if (currentOrg?.id) {
      await updateUserProjectFavorites({
        orgId: currentOrg.id,
        projectFavorites: (projectFavorites || []).filter((entry) => entry !== projectId)
      });
    }
  };

  const navigateToProject = (workspace: Project) => {
    navigate({
      to: getProjectHomePage(workspace.type, workspace.environments),
      params: { orgId: currentOrg?.id || "", projectId: workspace.id }
    });
  };

  const renderFavoriteButton = (workspace: Project & { isFavorite: boolean }) =>
    workspace.isFavorite ? (
      <IconButton
        variant="ghost"
        size="xs"
        aria-label="Remove from favorites"
        className="text-warning hover:text-warning/75"
        onClick={(e) => {
          e.stopPropagation();
          removeProjectFromFavorites(workspace.id);
        }}
      >
        <StarIcon fill="currentColor" />
      </IconButton>
    ) : (
      <IconButton
        variant="ghost-muted"
        size="xs"
        aria-label="Add to favorites"
        onClick={(e) => {
          e.stopPropagation();
          addProjectToFavorites(workspace.id);
        }}
      >
        <StarIcon />
      </IconButton>
    );

  const ProductIcon = getProjectLucideIcon(projectType);

  const renderProjectGridItem = (workspace: Project & { isFavorite: boolean }) => {
    const WorkspaceIcon = getProjectLucideIcon(workspace.type);
    const tileStyle = PROJECT_TILE_STYLE;
    const environmentCount = workspace.environments?.length ?? 0;
    return (
      <Card
        key={workspace.id}
        role="button"
        tabIndex={0}
        onClick={() => navigateToProject(workspace)}
        onKeyDown={(e) => {
          if (e.key === "Enter") navigateToProject(workspace);
        }}
        className={`group h-full cursor-pointer bg-container transition-all duration-200 ease-out ${tileStyle.cardHoverClassName}`}
      >
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="shrink-0 rounded-sm border border-border bg-muted/10 p-2 transition-colors duration-200 ease-out group-hover:border-project/20 group-hover:bg-gradient-to-br group-hover:from-project/5 group-hover:to-transparent">
              <WorkspaceIcon className="size-5.5 shrink-0 text-accent transition-colors duration-200 ease-out group-hover:text-project" />
            </div>
            <div className="min-w-0 flex-1">
              <CardDescription className="truncate text-base font-semibold text-foreground">
                {workspace.name}
              </CardDescription>
              <p className="truncate text-sm leading-5 text-muted">
                {getProjectTitle(workspace.type)}
              </p>
            </div>
          </div>
          <CardAction>{renderFavoriteButton(workspace)}</CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="line-clamp-2 text-sm leading-relaxed text-accent">
            {workspace.description || <span className="text-muted italic">No description</span>}
          </p>
          <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
            <span className="flex items-center gap-1.5 text-muted">
              <LayersIcon className="h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="text-xs font-medium text-foreground">{environmentCount}</span>{" "}
                <span className="text-xs">
                  {environmentCount === 1 ? "Environment" : "Environments"}
                </span>
              </span>
            </span>
            <span className="text-muted">
              <span className="text-xs">Created </span>
              <span className="text-xs font-medium text-foreground">
                {format(new Date(workspace.createdAt), "MMM d, yyyy")}
              </span>
            </span>
          </div>
        </CardContent>
      </Card>
    );
  };

  const hasProjects =
    !isProjectViewLoading && filteredWorkspaces.length > 0 && workspacesWithFaveProp.length > 0;
  const isWorkspaceEmpty = !isProjectViewLoading && workspaces.length === 0;
  const isNoSearchMatch =
    !isProjectViewLoading && workspaces.length > 0 && !filteredWorkspaces.length;

  let contentBody: ReactNode;
  if (isProjectViewLoading) {
    contentBody =
      projectsViewMode === ProjectsViewMode.GRID ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {Array.apply(0, Array(3)).map((_x, i) => (
            <Card key={`workspace-cards-loading-${i + 1}`} className="h-full bg-container">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <Skeleton className="h-9 w-9 shrink-0 rounded-sm bg-mineshaft-600" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-1/2 bg-mineshaft-600" />
                    <Skeleton className="h-3 w-1/3 bg-mineshaft-600" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-3 w-full bg-mineshaft-600" />
                  <Skeleton className="h-3 w-2/3 bg-mineshaft-600" />
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3">
                  <Skeleton className="h-3 w-16 bg-mineshaft-600" />
                  <Skeleton className="h-3 w-24 bg-mineshaft-600" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead aria-label="Icon" className="w-0" />
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-40">Created</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.apply(0, Array(3)).map((_x, i) => (
              <TableRow key={`workspace-rows-loading-${i + 1}`}>
                <TableCell>
                  <Skeleton className="h-4 w-4 bg-mineshaft-600" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-1/2 bg-mineshaft-600" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-3/4 bg-mineshaft-600" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24 bg-mineshaft-600" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-7 bg-mineshaft-600" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
  } else if (hasProjects) {
    contentBody =
      projectsViewMode === ProjectsViewMode.GRID ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {workspacesWithFaveProp.map((workspace) => renderProjectGridItem(workspace))}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead aria-label="Icon" className="w-0" />
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-40">Created</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {workspacesWithFaveProp.map((workspace) => {
              const WorkspaceIcon = getProjectLucideIcon(workspace.type);
              return (
                <TableRow
                  key={workspace.id}
                  className="group"
                  onClick={() => navigateToProject(workspace)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") navigateToProject(workspace);
                  }}
                  tabIndex={0}
                >
                  <TableCell className="w-0 pr-0">
                    <div className="inline-flex shrink-0 items-center justify-center rounded-sm border border-border bg-muted/10 p-1 transition-colors group-hover:border-project/20 group-hover:bg-gradient-to-br group-hover:from-project/5 group-hover:to-transparent">
                      <WorkspaceIcon className="h-3.5 w-3.5 shrink-0 text-accent transition-colors duration-200 group-hover:text-project" />
                    </div>
                  </TableCell>
                  <TableCell isTruncatable>{workspace.name}</TableCell>
                  <TableCell isTruncatable>
                    {workspace.description || <span className="text-muted">—</span>}
                  </TableCell>
                  <TableCell className="w-0 text-xs whitespace-nowrap">
                    {format(new Date(workspace.createdAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="w-0 pr-3 text-right">
                    {renderFavoriteButton(workspace)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      );
  } else if (isNoSearchMatch) {
    contentBody = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchIcon />
          </EmptyMedia>
          <EmptyTitle>No projects match your search</EmptyTitle>
          <EmptyDescription>Try a different search term.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else if (isWorkspaceEmpty) {
    contentBody = (
      <EmptyState
        projectType={projectType}
        ProductIcon={ProductIcon}
        onAddNewProject={onAddNewProject}
        onUpgradePlan={onUpgradePlan}
        isAddingProjectsAllowed={isAddingProjectsAllowed}
      />
    );
  }

  return (
    <Card
      className={twMerge(
        projectsViewMode === ProjectsViewMode.GRID ? "border-transparent bg-transparent p-0" : "",
        "transition-all duration-100"
      )}
    >
      <CardHeader>
        <Toolbar
          searchFilter={searchFilter}
          onSearchChange={setSearchFilter}
          orderDirection={orderDirection}
          onToggleOrderDirection={toggleOrderDirection}
          projectsViewMode={projectsViewMode}
          onViewModeChange={(mode) => {
            localStorage.setItem("projectsViewMode", mode);
            setProjectsViewMode(mode);
          }}
          projectListView={projectListView}
          onProjectListViewChange={onProjectListViewChange}
          hideProjectListToggle={hideProjectListToggle}
          onAddNewProject={onAddNewProject}
          onUpgradePlan={onUpgradePlan}
          isAddingProjectsAllowed={isAddingProjectsAllowed}
        />
      </CardHeader>
      <CardContent>
        {contentBody}
        {hasProjects && (
          <Pagination
            perPage={perPage}
            perPageList={[12, 24, 48, 96]}
            count={filteredWorkspaces.length}
            page={page}
            onChangePage={setPage}
            onChangePerPage={handlePerPageChange}
          />
        )}
      </CardContent>
    </Card>
  );
};

const AllProjectsForType = ({
  projectType,
  projectListView,
  onProjectListViewChange,
  hideProjectListToggle,
  onAddNewProject,
  onUpgradePlan,
  isAddingProjectsAllowed
}: SubViewProps) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const [searchFilter, setSearchFilter] = useState("");
  const [debouncedSearch] = useDebounce(searchFilter);

  const {
    setPage,
    perPage,
    setPerPage,
    page,
    offset,
    limit,
    toggleOrderDirection,
    orderDirection
  } = usePagination("name", {
    initPerPage: getUserTablePreference("allProjectsTable", PreferenceKey.PerPage, 50)
  });

  const orgAdminAccessProject = useOrgAdminAccessProject();
  const { permission } = useOrgPermission();
  const canAccessAllProjects = permission.can(
    OrgPermissionAdminConsoleAction.AccessAllProjects,
    OrgPermissionSubjects.AdminConsole
  );

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("allProjectsTable", PreferenceKey.PerPage, newPerPage);
  };

  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp([
    "requestAccessConfirmation"
  ] as const);

  const { data: searchedProjects, isPending: isProjectLoading } = useSearchProjects({
    limit,
    offset,
    name: debouncedSearch || undefined,
    orderDirection,
    type: projectType
  });

  const { data: pendingAccessRequestByProjectId } = useGetMyPendingProjectAccessRequests({
    enabled: !canAccessAllProjects
  });

  const handleAccessProject = async (
    type: ProjectType,
    projectId: string,
    environments: ProjectEnv[],
    projectOrgId: string
  ) => {
    await orgAdminAccessProject.mutateAsync({ projectId });
    await navigate({
      to: getProjectHomePage(type, environments),
      params: { orgId: projectOrgId, projectId }
    });
  };

  useResetPageHelper({
    setPage,
    offset,
    totalCount: searchedProjects?.totalCount || 0
  });

  const requestedWorkspaceDetails = (popUp.requestAccessConfirmation.data || {}) as Project;
  const ProductIcon = getProjectLucideIcon(projectType);

  const hasProjects = !isProjectLoading && Boolean(searchedProjects?.totalCount);
  const isEmpty = !isProjectLoading && !searchedProjects?.totalCount;

  let contentBody: ReactNode;
  if (isProjectLoading) {
    contentBody = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead aria-label="Icon" className="w-0" />
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-0">Created</TableHead>
            <TableHead className="w-0">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.apply(0, Array(3)).map((_x, i) => (
            <TableRow key={`workspace-rows-loading-${i + 1}`}>
              <TableCell>
                <Skeleton className="h-4 w-4 bg-mineshaft-600" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-1/2 bg-mineshaft-600" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-3/4 bg-mineshaft-600" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24 bg-mineshaft-600" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20 bg-mineshaft-600" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  } else if (hasProjects) {
    contentBody = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead aria-label="Icon" className="w-0" />
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="w-40">Created</TableHead>
            <TableHead className="w-0" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {searchedProjects?.projects?.map((workspace) => {
            const WorkspaceIcon = getProjectLucideIcon(workspace.type);
            const goToProject = () =>
              navigate({
                to: getProjectHomePage(workspace.type, workspace.environments),
                params: { orgId: currentOrg?.id || "", projectId: workspace.id }
              });
            return (
              <TableRow
                key={workspace.id}
                className="group"
                onClick={workspace.isMember ? goToProject : undefined}
                onKeyDown={(evt) => {
                  if (evt.key === "Enter" && workspace.isMember) goToProject();
                }}
                tabIndex={workspace.isMember ? 0 : -1}
              >
                <TableCell className="w-0 pr-0">
                  <div className="inline-flex shrink-0 items-center justify-center rounded-sm border border-border bg-muted/10 p-1 transition-colors group-hover:border-project/20 group-hover:bg-gradient-to-br group-hover:from-project/5 group-hover:to-transparent">
                    <WorkspaceIcon className="h-3.5 w-3.5 shrink-0 text-accent transition-colors duration-200 group-hover:text-project" />
                  </div>
                </TableCell>
                <TableCell isTruncatable>{workspace.name}</TableCell>
                <TableCell isTruncatable>
                  {workspace.description || <span className="text-muted">—</span>}
                </TableCell>
                <TableCell className="w-0 text-xs whitespace-nowrap">
                  {format(new Date(workspace.createdAt), "MMM d, yyyy")}
                </TableCell>
                <TableCell className="w-0 pr-3 text-right">
                  {(() => {
                    if (workspace.isMember) {
                      return (
                        <Badge variant="info">
                          <CheckIcon />
                          Joined
                        </Badge>
                      );
                    }
                    if (canAccessAllProjects) {
                      return (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            handleAccessProject(
                              workspace.type,
                              workspace.id,
                              workspace.environments,
                              workspace.orgId
                            );
                          }}
                          isDisabled={
                            orgAdminAccessProject.variables?.projectId === workspace.id &&
                            orgAdminAccessProject.isPending
                          }
                        >
                          Join as Admin
                        </Button>
                      );
                    }
                    const requestedAt = pendingAccessRequestByProjectId?.get(workspace.id);
                    if (requestedAt) {
                      return (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="warning" asChild>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("requestAccessConfirmation", workspace);
                                }}
                              >
                                <ClockIcon />
                                Requested
                              </button>
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            Requested on {format(requestedAt, "MMM d, yyyy 'at' h:mm a")}. Click to
                            resend.
                          </TooltipContent>
                        </Tooltip>
                      );
                    }
                    return (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePopUpOpen("requestAccessConfirmation", workspace);
                        }}
                      >
                        Request Access
                      </Button>
                    );
                  })()}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  } else if (isEmpty) {
    contentBody = debouncedSearch ? (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchIcon />
          </EmptyMedia>
          <EmptyTitle>No projects match your search</EmptyTitle>
          <EmptyDescription>Try a different search term.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    ) : (
      <EmptyState
        projectType={projectType}
        ProductIcon={ProductIcon}
        onAddNewProject={onAddNewProject}
        onUpgradePlan={onUpgradePlan}
        isAddingProjectsAllowed={isAddingProjectsAllowed}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <Toolbar
          searchFilter={searchFilter}
          onSearchChange={setSearchFilter}
          orderDirection={orderDirection}
          onToggleOrderDirection={toggleOrderDirection}
          projectsViewMode={ProjectsViewMode.LIST}
          onViewModeChange={() => {}}
          projectListView={projectListView}
          onProjectListViewChange={onProjectListViewChange}
          hideProjectListToggle={hideProjectListToggle}
          onAddNewProject={onAddNewProject}
          onUpgradePlan={onUpgradePlan}
          isAddingProjectsAllowed={isAddingProjectsAllowed}
          isGridDisabled
        />
      </CardHeader>
      <CardContent>
        {contentBody}
        {hasProjects && (
          <Pagination
            perPage={perPage}
            perPageList={[12, 24, 48, 96]}
            count={searchedProjects?.totalCount || 0}
            page={page}
            onChangePage={setPage}
            onChangePerPage={handlePerPageChange}
          />
        )}
      </CardContent>
      <RequestProjectAccessModal
        isOpen={popUp.requestAccessConfirmation.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("requestAccessConfirmation", isOpen)}
        project={requestedWorkspaceDetails}
      />
    </Card>
  );
};

const Toolbar = ({
  searchFilter,
  onSearchChange,
  orderDirection,
  onToggleOrderDirection,
  projectsViewMode,
  onViewModeChange,
  projectListView,
  onProjectListViewChange,
  hideProjectListToggle,
  onAddNewProject,
  onUpgradePlan,
  isAddingProjectsAllowed,
  isGridDisabled
}: {
  searchFilter: string;
  onSearchChange: (value: string) => void;
  orderDirection: OrderByDirection;
  onToggleOrderDirection: () => void;
  projectsViewMode: ProjectsViewMode;
  onViewModeChange: (mode: ProjectsViewMode) => void;
  projectListView: ProjectListView;
  onProjectListViewChange: (value: ProjectListView) => void;
  hideProjectListToggle: boolean;
  onAddNewProject: () => void;
  onUpgradePlan: () => void;
  isAddingProjectsAllowed: boolean;
  isGridDisabled?: boolean;
}) => (
  <div className="flex w-full flex-row flex-wrap items-center gap-2 md:flex-nowrap">
    {!hideProjectListToggle && (
      <ProjectListToggle value={projectListView} onChange={onProjectListViewChange} />
    )}
    <InputGroup className="flex-1">
      <InputGroupAddon align="inline-start">
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        placeholder="Search by project name..."
        value={searchFilter}
        onChange={(e) => onSearchChange(e.target.value)}
      />
    </InputGroup>
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton
          variant="outline"
          size="sm"
          aria-label={`Sort ${
            orderDirection === OrderByDirection.ASC ? "descending" : "ascending"
          }`}
          onClick={onToggleOrderDirection}
        >
          {orderDirection === OrderByDirection.ASC ? <ArrowDownAZIcon /> : <ArrowUpAZIcon />}
        </IconButton>
      </TooltipTrigger>
      <TooltipContent>Toggle Sort Direction</TooltipContent>
    </Tooltip>
    <ButtonGroup>
      {isGridDisabled ? (
        <Tooltip>
          <TooltipTrigger tabIndex={-1} asChild>
            <span className="cursor-not-allowed">
              <IconButton variant="outline" size="sm" aria-label="Grid view" isDisabled>
                <LayoutGridIcon />
              </IconButton>
            </span>
          </TooltipTrigger>
          <TooltipContent>Disabled across All Project view.</TooltipContent>
        </Tooltip>
      ) : (
        <IconButton
          variant={projectsViewMode === ProjectsViewMode.GRID ? "project" : "outline"}
          size="sm"
          aria-label="Grid view"
          className={projectsViewMode === ProjectsViewMode.GRID ? "z-10" : ""}
          onClick={() => onViewModeChange(ProjectsViewMode.GRID)}
        >
          <LayoutGridIcon />
        </IconButton>
      )}
      <IconButton
        variant={projectsViewMode === ProjectsViewMode.LIST ? "project" : "outline"}
        size="sm"
        aria-label="List view"
        onClick={() => onViewModeChange(ProjectsViewMode.LIST)}
      >
        <ListIcon />
      </IconButton>
    </ButtonGroup>
    <OrgPermissionCan I={OrgPermissionActions.Create} an={OrgPermissionSubjects.Workspace}>
      {(isOldProjectV1Allowed) => (
        <OrgPermissionCan I={OrgPermissionActions.Create} an={OrgPermissionSubjects.Project}>
          {(isAllowed) => (
            <Button
              isDisabled={!isAllowed && !isOldProjectV1Allowed}
              size="sm"
              variant="project"
              onClick={() => {
                if (isAddingProjectsAllowed) {
                  onAddNewProject();
                } else {
                  onUpgradePlan();
                }
              }}
            >
              <PlusIcon />
              Add New Project
            </Button>
          )}
        </OrgPermissionCan>
      )}
    </OrgPermissionCan>
  </div>
);

const EmptyState = ({
  projectType,
  ProductIcon,
  onAddNewProject,
  onUpgradePlan,
  isAddingProjectsAllowed
}: {
  projectType: ProjectType;
  ProductIcon: ReturnType<typeof getProjectLucideIcon>;
  onAddNewProject: () => void;
  onUpgradePlan: () => void;
  isAddingProjectsAllowed: boolean;
}) => {
  const typeTitle = getProjectTitle(projectType);

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ProductIcon />
        </EmptyMedia>
        <EmptyTitle>No {typeTitle} projects yet</EmptyTitle>
        <EmptyDescription>Create your first {typeTitle} project to get started.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <OrgPermissionCan I={OrgPermissionActions.Create} an={OrgPermissionSubjects.Project}>
          {(isAllowed) => (
            <Button
              variant="project"
              isDisabled={!isAllowed}
              onClick={() => {
                if (isAddingProjectsAllowed) {
                  onAddNewProject();
                } else {
                  onUpgradePlan();
                }
              }}
            >
              <PlusIcon />
              Create Project
            </Button>
          )}
        </OrgPermissionCan>
      </EmptyContent>
    </Empty>
  );
};
