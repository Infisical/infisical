import { type ReactNode, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowDownAZIcon,
  ArrowUpAZIcon,
  Clock3Icon,
  Layers3Icon,
  LayoutGridIcon,
  ListIcon,
  PlusIcon,
  SearchIcon,
  StarIcon
} from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { NewProjectModal } from "@app/components/projects";
import {
  Button,
  ButtonGroup,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
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
import { OrgPermissionProjectActions } from "@app/context/OrgPermissionContext/types";
import { getProjectHomePage, getProjectLucideIcon, getProjectTitle } from "@app/helpers/project";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { useGetUserProjects } from "@app/hooks/api";
import { Project, ProjectType } from "@app/hooks/api/projects/types";
import { useUpdateUserProjectFavorites } from "@app/hooks/api/users/mutation";
import { useGetUserProjectFavorites } from "@app/hooks/api/users/queries";

const PROJECT_TYPES = [
  ProjectType.SecretManager,
  ProjectType.CertificateManager,
  ProjectType.KMS,
  ProjectType.SecretScanning
] as const;

const CREATABLE_PROJECT_TYPES = [
  ProjectType.SecretManager,
  ProjectType.KMS,
  ProjectType.SecretScanning
] as const;

type DashboardProjectType = (typeof PROJECT_TYPES)[number];
type ProjectFilter = "all" | DashboardProjectType;
type ProjectSort = "recent" | "name-asc" | "name-desc";
type ProjectView = "grid" | "list";
type DashboardProject = Project & { type: DashboardProjectType };
type ProjectWithFavorite = DashboardProject & { isFavorite: boolean };

const PROJECT_LABELS: Record<DashboardProjectType, string> = {
  [ProjectType.SecretManager]: "Secrets",
  [ProjectType.CertificateManager]: "PKI",
  [ProjectType.KMS]: "KMS",
  [ProjectType.SecretScanning]: "Scanners"
};

const PROJECT_ICON_STYLES: Record<ProjectType, string> = {
  [ProjectType.SecretManager]: "bg-product-sm/15 text-product-sm",
  [ProjectType.CertificateManager]: "bg-product-pki/15 text-product-pki",
  [ProjectType.KMS]: "bg-product-kms/15 text-product-kms",
  [ProjectType.SecretScanning]: "bg-product-ss/15 text-product-ss",
  [ProjectType.PAM]: "bg-product-pam/15 text-product-pam"
};

const formatUpdatedAt = (updatedAt: string) =>
  formatDistanceToNow(new Date(updatedAt), { addSuffix: true });

const ProjectProductIcon = ({ type }: { type: ProjectType }) => {
  const Icon = getProjectLucideIcon(type);

  return (
    <div
      className={`flex size-8 shrink-0 items-center justify-center rounded-sm ${PROJECT_ICON_STYLES[type]}`}
    >
      <Icon className="size-4" aria-hidden />
    </div>
  );
};

export const ProjectCategoryOverview = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { permission } = useOrgPermission();
  const { subscription } = useSubscription();
  const [search, setSearch] = useState("");
  const [productFilter, setProductFilter] = useState<ProjectFilter>("all");
  const [sort, setSort] = useState<ProjectSort>("recent");
  const [view, setView] = useState<ProjectView>(() => {
    const savedView = localStorage.getItem("organizationProjectsView");
    return savedView === "list" ? "list" : "grid";
  });
  const [createProjectType, setCreateProjectType] = useState<ProjectType | null>(null);
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);

  const { data: projects = [], isPending: isProjectsLoading } = useGetUserProjects();
  const { data: projectFavorites = [], isPending: isFavoritesLoading } = useGetUserProjectFavorites(
    currentOrg.id
  );
  const { mutate: updateProjectFavorites } = useUpdateUserProjectFavorites();

  const { page, perPage, offset, setPage, setPerPage } = usePagination("updatedAt", {
    initPerPage: getUserTablePreference("organizationProjects", PreferenceKey.PerPage, 24)
  });

  const dashboardProjects = useMemo(
    () =>
      projects.filter((project): project is DashboardProject =>
        PROJECT_TYPES.includes(project.type as DashboardProjectType)
      ),
    [projects]
  );

  const projectCounts = useMemo(
    () =>
      dashboardProjects.reduce<Record<DashboardProjectType, number>>(
        (counts, project) => ({ ...counts, [project.type]: counts[project.type] + 1 }),
        {
          [ProjectType.SecretManager]: 0,
          [ProjectType.CertificateManager]: 0,
          [ProjectType.KMS]: 0,
          [ProjectType.SecretScanning]: 0
        }
      ),
    [dashboardProjects]
  );

  const filteredProjects = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return dashboardProjects
      .filter((project) => productFilter === "all" || project.type === productFilter)
      .filter((project) => {
        if (!normalizedSearch) return true;

        return [
          project.name,
          project.slug,
          project.description,
          getProjectTitle(project.type),
          PROJECT_LABELS[project.type]
        ]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(normalizedSearch));
      })
      .map(
        (project): ProjectWithFavorite => ({
          ...project,
          isFavorite: projectFavorites.includes(project.id)
        })
      )
      .sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) return Number(b.isFavorite) - Number(a.isFavorite);
        if (sort === "name-asc") return a.name.localeCompare(b.name);
        if (sort === "name-desc") return b.name.localeCompare(a.name);
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [dashboardProjects, productFilter, projectFavorites, search, sort]);

  useResetPageHelper({ setPage, offset, totalCount: filteredProjects.length });

  const visibleProjects = filteredProjects.slice(offset, offset + perPage);
  const isLoading = isProjectsLoading || isFavoritesLoading;
  const canCreateProject =
    permission.can(OrgPermissionProjectActions.Create, OrgPermissionSubjects.Project) ||
    permission.can(OrgPermissionActions.Create, OrgPermissionSubjects.Workspace);
  const isAddingProjectsAllowed = subscription?.workspaceLimit
    ? subscription.workspacesUsed < subscription.workspaceLimit
    : true;
  const navigateToProject = (project: Project) => {
    navigate({
      to: getProjectHomePage(project.type, project.environments),
      params: { orgId: currentOrg.id, projectId: project.id }
    });
  };

  const toggleFavorite = (project: ProjectWithFavorite) => {
    const nextFavorites = project.isFavorite
      ? projectFavorites.filter((projectId) => projectId !== project.id)
      : [...projectFavorites, project.id];

    updateProjectFavorites({ orgId: currentOrg.id, projectFavorites: nextFavorites });
  };

  const updateView = (nextView: ProjectView) => {
    localStorage.setItem("organizationProjectsView", nextView);
    setView(nextView);
  };

  const handleCreateProject = (type: ProjectType) => {
    if (!isAddingProjectsAllowed) {
      setIsUpgradeOpen(true);
      return;
    }

    setCreateProjectType(type);
  };

  const renderFavoriteButton = (project: ProjectWithFavorite) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton
          variant={project.isFavorite ? "ghost" : "ghost-muted"}
          size="xs"
          aria-label={project.isFavorite ? "Remove from favorites" : "Add to favorites"}
          className={project.isFavorite ? "text-warning hover:text-warning/75" : ""}
          onClick={() => toggleFavorite(project)}
        >
          <StarIcon fill={project.isFavorite ? "currentColor" : "none"} />
        </IconButton>
      </TooltipTrigger>
      <TooltipContent>
        {project.isFavorite ? "Remove from favorites" : "Add to favorites"}
      </TooltipContent>
    </Tooltip>
  );

  const renderProjectCard = (project: ProjectWithFavorite) => (
    <Card
      key={project.id}
      className="group/card relative h-full gap-0 overflow-hidden p-0 transition-colors focus-within:border-ring hover:border-container-hover hover:bg-container-hover/40"
    >
      <button
        type="button"
        aria-label={`Open ${project.name}`}
        className="flex h-full min-h-48 w-full flex-col p-5 pr-14 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
        onClick={() => navigateToProject(project)}
      >
        <div className="flex items-center gap-2">
          <ProjectProductIcon type={project.type} />
          <span className="truncate text-xs font-medium tracking-wide text-muted uppercase">
            {PROJECT_LABELS[project.type]}
          </span>
        </div>
        <div className="mt-5 min-w-0">
          <span className="block truncate text-base font-semibold text-foreground">
            {project.name}
          </span>
          <p className="mt-1 line-clamp-2 text-sm text-muted">
            {project.description || <span className="italic">no description</span>}
          </p>
        </div>
        <Separator className="mt-auto" />
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <Layers3Icon className="size-3.5" aria-hidden />
            {project.environments.length}{" "}
            {project.environments.length === 1 ? "environment" : "environments"}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock3Icon className="size-3.5" aria-hidden />
            Updated {formatUpdatedAt(project.updatedAt)}
          </span>
        </div>
      </button>
      <div className="absolute top-5 right-5 z-10">{renderFavoriteButton(project)}</div>
    </Card>
  );

  const hasFilters = Boolean(search) || productFilter !== "all";
  let projectContent: ReactNode;

  if (isLoading) {
    projectContent = (
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3 @7xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={`project-loading-${index + 1}`} className="h-48 gap-4">
            <div className="flex items-center gap-2">
              <Skeleton className="size-8" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <div className="mt-auto flex justify-between border-t border-border pt-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-28" />
            </div>
          </Card>
        ))}
      </div>
    );
  } else if (!visibleProjects.length) {
    projectContent = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchIcon />
          </EmptyMedia>
          <EmptyTitle>
            {hasFilters ? "No projects match these filters" : "No projects yet"}
          </EmptyTitle>
          <EmptyDescription>
            {hasFilters
              ? "Try another search term or product filter."
              : "Create a project to start managing your organization's resources."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else if (view === "grid") {
    projectContent = (
      <div className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3 @7xl:grid-cols-4">
        {visibleProjects.map(renderProjectCard)}
      </div>
    );
  } else {
    projectContent = (
      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Environments</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead aria-label="Favorite" className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody className="[&_td]:h-fit [&_td]:py-2">
            {visibleProjects.map((project) => (
              <TableRow key={project.id}>
                <TableCell>
                  <button
                    type="button"
                    className="flex max-w-full items-center gap-3 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    onClick={() => navigateToProject(project)}
                  >
                    <ProjectProductIcon type={project.type} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground">
                        {project.name}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {currentOrg.name} / {project.slug}
                      </span>
                    </span>
                  </button>
                </TableCell>
                <TableCell>{PROJECT_LABELS[project.type]}</TableCell>
                <TableCell>{project.environments.length}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatUpdatedAt(project.updatedAt)}
                </TableCell>
                <TableCell className="text-right">{renderFavoriteButton(project)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    );
  }

  return (
    <section
      aria-labelledby="projects-inventory-heading"
      className="@container flex flex-col gap-7"
    >
      <h2 id="projects-inventory-heading" className="sr-only">
        Project inventory
      </h2>

      <div className="flex flex-col gap-3 @4xl:flex-row @4xl:items-center">
        <InputGroup className="min-w-0 flex-1">
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search projects"
            placeholder="Search projects..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </InputGroup>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={sort} onValueChange={(value) => setSort(value as ProjectSort)}>
            <SelectTrigger className="w-44" aria-label="Sort projects">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">
                <Clock3Icon />
                Recent activity
              </SelectItem>
              <SelectItem value="name-asc">
                <ArrowDownAZIcon />
                Name, A to Z
              </SelectItem>
              <SelectItem value="name-desc">
                <ArrowUpAZIcon />
                Name, Z to A
              </SelectItem>
            </SelectContent>
          </Select>
          <ButtonGroup>
            <IconButton
              variant={view === "grid" ? "project" : "outline"}
              size="sm"
              aria-label="Grid view"
              onClick={() => updateView("grid")}
            >
              <LayoutGridIcon />
            </IconButton>
            <IconButton
              variant={view === "list" ? "project" : "outline"}
              size="sm"
              aria-label="List view"
              onClick={() => updateView("list")}
            >
              <ListIcon />
            </IconButton>
          </ButtonGroup>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="project" size="sm" isDisabled={!canCreateProject}>
                <PlusIcon />
                Add project
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {CREATABLE_PROJECT_TYPES.map((type) => {
                const Icon = getProjectLucideIcon(type);
                return (
                  <DropdownMenuItem key={type} onSelect={() => handleCreateProject(type)}>
                    <Icon />
                    {PROJECT_LABELS[type]}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs
        value={productFilter}
        onValueChange={(value) => {
          setProductFilter(value as ProjectFilter);
          setPage(1);
        }}
      >
        <TabsList variant="filled" className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="all">
            All <span className="text-muted">{dashboardProjects.length}</span>
          </TabsTrigger>
          {PROJECT_TYPES.map((type) => {
            const Icon = getProjectLucideIcon(type);
            return (
              <TabsTrigger key={type} value={type}>
                <Icon aria-hidden />
                {PROJECT_LABELS[type]} <span className="text-muted">{projectCounts[type]}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {projectContent}

      {!isLoading && filteredProjects.length > 0 && (
        <Pagination
          page={page}
          perPage={perPage}
          perPageList={[12, 24, 48, 96]}
          count={filteredProjects.length}
          onChangePage={setPage}
          onChangePerPage={(nextPerPage) => {
            setPerPage(nextPerPage);
            setUserTablePreference("organizationProjects", PreferenceKey.PerPage, nextPerPage);
          }}
        />
      )}

      {createProjectType && (
        <NewProjectModal
          isOpen
          projectType={createProjectType}
          onOpenChange={(isOpen) => {
            if (!isOpen) setCreateProjectType(null);
          }}
        />
      )}
      <UpgradePlanModal
        isOpen={isUpgradeOpen}
        onOpenChange={setIsUpgradeOpen}
        text="You have reached the maximum number of projects allowed on your current plan. Upgrade your plan to add more projects."
      />
    </section>
  );
};
