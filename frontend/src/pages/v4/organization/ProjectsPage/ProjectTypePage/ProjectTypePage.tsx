import { type ReactNode, useMemo, useState } from "react";
import { FilterBar } from "@infisical/cipher/patterns/filter-bar";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@infisical/cipher/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card, CardLink } from "@infisical/cipher/ui/card";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Halftone } from "@infisical/cipher/ui/halftone";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Grid, Inline, Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { Select } from "@infisical/cipher/ui/select";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Tabs } from "@infisical/cipher/ui/tabs";
import { SmallText } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@infisical/cipher/ui/toggle-group";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { Navigate, useNavigate, useParams } from "@tanstack/react-router";
import { format, formatDistanceToNowStrict } from "date-fns";
import { LayersIcon, LayoutGridIcon, ListIcon, StarIcon } from "lucide-react";

import {
  OrgPermissionActions,
  OrgPermissionAdminConsoleAction,
  OrgPermissionProjectActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { getProjectTitle, urlSlugToProjectType } from "@app/helpers/project";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { INTERNAL_KMS_KEY_ID } from "@app/hooks/api/kms/types";
import {
  type DeletedProject,
  type Project,
  ProjectType,
  ProjectVersion,
  SearchProjectSortBy
} from "@app/hooks/api/projects/types";
import { InfisicalProjectTemplate } from "@app/hooks/api/projectTemplates/types";

import { AccessFrame } from "../../../access/AccessFrame";
import { useDebounced } from "../../../access/org/use-debounced";
import { useOrgPermission } from "../../../access/permissions";
import { failed, saved } from "../../../access/toast";
import { GhostEmpty } from "../../../components/ghost-empty";
import { useV4Adapter } from "../../../data/adapters";
import type { TSearchedProject } from "../../../data/projects/contract";
import { v4Path } from "../../../links";
import { productHome, productOf } from "../../../shell/navigation";

enum ProjectListView {
  MyProjects = "my-projects",
  AllProjects = "all-projects"
}

enum ProjectsViewMode {
  GRID = "grid",
  LIST = "list"
}

type Sort = { columnId: string; direction: "asc" | "desc" };

const LIST_ONLY = "Disabled across All Project view.";

const homeRoute = (type: ProjectType) => {
  if (type === ProjectType.KMS)
    return v4Path("/organizations/$orgId/projects/kms/$projectId/overview");
  if (type === ProjectType.AgentVault)
    return v4Path("/organizations/$orgId/projects/agent-vault/$projectId/sessions");
  return v4Path("/organizations/$orgId/projects/secret-management/$projectId/overview");
};

const sortBy = (sort: Sort) => sort.columnId as SearchProjectSortBy;
const sortDirection = (sort: Sort) =>
  sort.direction === "asc" ? OrderByDirection.ASC : OrderByDirection.DESC;

const compareProjects = (a: Project, b: Project, sort: Sort) => {
  const column = sortBy(sort);
  if (column === SearchProjectSortBy.Description) {
    if (!a.description?.trim() && b.description?.trim()) return 1;
    if (a.description?.trim() && !b.description?.trim()) return -1;
  }
  let comparison = 0;
  if (column === SearchProjectSortBy.CreatedAt) {
    comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  } else {
    const valueA = column === SearchProjectSortBy.Description ? a.description || "" : a.name;
    const valueB = column === SearchProjectSortBy.Description ? b.description || "" : b.name;
    comparison = valueA.localeCompare(valueB, undefined, { sensitivity: "base" });
  }
  if (comparison !== 0) return sort.direction === "asc" ? comparison : -comparison;
  return (
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id)
  );
};

const created = (project: Pick<Project, "createdAt">) =>
  format(new Date(project.createdAt), "MMM d, yyyy");

const baseColumns = <Row extends Project>(
  orgId: string,
  canOpen: (row: Row) => boolean
): DataTableColumn<Row>[] => [
  {
    id: SearchProjectSortBy.Name,
    header: "Name",
    primary: true,
    sortable: true,
    grow: true,
    text: (row) => row.name,
    render: (row) => (
      <RowLink
        link={{ to: homeRoute(row.type), params: { orgId, projectId: row.id } }}
        disabled={!canOpen(row)}
      >
        {row.name}
      </RowLink>
    )
  },
  {
    id: SearchProjectSortBy.Description,
    header: "Description",
    sortable: true,
    grow: true,
    text: (row) => row.description ?? "",
    render: (row) => row.description || <SmallText muted>No description</SmallText>
  },
  {
    id: SearchProjectSortBy.CreatedAt,
    header: "Created",
    sortable: true,
    width: 128,
    render: created
  }
];

const Toolbar = ({
  search,
  onSearchChange,
  listView,
  onListViewChange,
  showListToggle,
  viewMode,
  onViewModeChange
}: {
  search: string;
  onSearchChange: (value: string) => void;
  listView: ProjectListView;
  onListViewChange: (value: ProjectListView) => void;
  showListToggle: boolean;
  viewMode: ProjectsViewMode;
  onViewModeChange?: (mode: ProjectsViewMode) => void;
}) => (
  <FilterBar
    label="Project filters"
    fields={[]}
    value={[]}
    onChange={() => undefined}
    search={
      <Input
        icon="search"
        aria-label="Search projects"
        placeholder="Search by project name..."
        kbd="/"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
    }
    actions={
      <>
        {showListToggle && (
          <Tabs
            variant="segmented"
            label="Project list views"
            value={listView}
            onChange={(value) => onListViewChange(value as ProjectListView)}
            tabs={[
              { value: ProjectListView.MyProjects, label: "My projects" },
              { value: ProjectListView.AllProjects, label: "All projects" }
            ]}
          />
        )}
        <ToggleGroup
          type="single"
          size="sm"
          aria-label="Project layout"
          value={viewMode}
          disabled={!onViewModeChange}
          onValueChange={(value) => value && onViewModeChange?.(value as ProjectsViewMode)}
        >
          <Tooltip content={onViewModeChange ? "Grid" : LIST_ONLY}>
            <ToggleGroupItem value={ProjectsViewMode.GRID} aria-label="Grid view">
              <Icon icon={LayoutGridIcon} />
            </ToggleGroupItem>
          </Tooltip>
          <Tooltip content="List">
            <ToggleGroupItem value={ProjectsViewMode.LIST} aria-label="List view">
              <Icon icon={ListIcon} />
            </ToggleGroupItem>
          </Tooltip>
        </ToggleGroup>
      </>
    }
  />
);

const FavoriteButton = ({
  project,
  isFavorite,
  onToggle
}: {
  project: Project;
  isFavorite: boolean;
  onToggle: () => void;
}) => (
  <Tooltip content={isFavorite ? "Remove from favorites" : "Add to favorites"}>
    <Button
      variant="ghost"
      size="icon-row"
      aria-label={
        isFavorite ? `Remove ${project.name} from favorites` : `Add ${project.name} to favorites`
      }
      aria-pressed={isFavorite}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <Icon icon={StarIcon} filled={isFavorite} />
    </Button>
  </Tooltip>
);

const ProjectCard = ({
  orgId,
  project,
  favorite,
  isFavorite
}: {
  orgId: string;
  project: Project;
  favorite: ReactNode;
  isFavorite: boolean;
}) => {
  const environmentCount = project.environments?.length ?? 0;
  return (
    <Card
      variant="framed"
      footerPlacement="frame"
      title={
        <CardLink link={{ to: homeRoute(project.type), params: { orgId, projectId: project.id } }}>
          {project.name}
        </CardLink>
      }
      action={favorite}
      backdrop={
        isFavorite ? (
          <Halftone reach={280} depth={2} intensity={1.35} seed={project.type} />
        ) : (
          <Halftone reach={200} depth={1.4} seed={project.type} />
        )
      }
      footer={
        <Inline gap={16} justify="between">
          {project.type !== ProjectType.AgentVault && (
            <Inline gap={4} align="center">
              <Icon icon={LayersIcon} size={14} />
              <span>
                <strong>{environmentCount}</strong>{" "}
                {environmentCount === 1 ? "Environment" : "Environments"}
              </span>
            </Inline>
          )}
          <span>
            Created <strong>{created(project)}</strong>
          </span>
        </Inline>
      }
    >
      <SmallText muted={!project.description}>{project.description || "No description"}</SmallText>
    </Card>
  );
};

const NoProjects = ({
  projectType,
  layout,
  canCreate,
  onCreate
}: {
  projectType: ProjectType;
  layout: "cards" | "rows";
  canCreate: boolean;
  onCreate: () => void;
}) => (
  <GhostEmpty
    layout={layout}
    icon={productOf(projectType).icon}
    title={`No ${getProjectTitle(projectType)} projects yet`}
    action={
      <Button variant="outline" icon="plus" disabled={!canCreate} onClick={onCreate}>
        Create project
      </Button>
    }
  />
);

const NoMatch = () => <EmptyState size="sm" icon="search" title="No projects match your search" />;

type ListProps = {
  orgId: string;
  projectType: ProjectType;
  listView: ProjectListView;
  onListViewChange: (value: ProjectListView) => void;
  showListToggle: boolean;
  canCreate: boolean;
  onCreate: () => void;
};

const MyProjects = ({
  orgId,
  projectType,
  listView,
  onListViewChange,
  showListToggle,
  canCreate,
  onCreate
}: ListProps) => {
  const adapter = useV4Adapter("projects");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ProjectsViewMode>(
    () => (localStorage.getItem("projectsViewMode") as ProjectsViewMode) || ProjectsViewMode.GRID
  );
  const [sort, setSort] = useState<Sort>({ columnId: SearchProjectSortBy.Name, direction: "asc" });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference("myProjectsTable", PreferenceKey.PerPage, 24)
  );
  const { data: userProjects, isPending: projectsPending } = adapter.useUserProjects();
  const { data: favorites, isPending: favoritesPending } = adapter.useProjectFavorites(orgId);
  const updateFavorites = adapter.useUpdateProjectFavorites();
  const isPending = projectsPending || favoritesPending;

  const projects = useMemo(
    () => (userProjects ?? []).filter((project) => project.type === projectType),
    [userProjects, projectType]
  );
  const filtered = useMemo(
    () =>
      projects
        .filter((project) => project.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => compareProjects(a, b, sort)),
    [projects, search, sort]
  );
  const lastPage = Math.max(1, Math.ceil(filtered.length / perPage));
  const currentPage = Math.min(page, lastPage);
  const isFavorite = (project: Project) => Boolean(favorites?.includes(project.id));
  const rows = [...filtered]
    .sort((a, b) => Number(isFavorite(b)) - Number(isFavorite(a)))
    .slice((currentPage - 1) * perPage, currentPage * perPage);

  const toggleFavorite = (project: Project) =>
    updateFavorites
      .mutateAsync({
        orgId,
        projectFavorites: isFavorite(project)
          ? (favorites ?? []).filter((id) => id !== project.id)
          : [...(favorites ?? []), project.id]
      })
      .catch((error) => failed("Failed to update favorite projects", error));
  const favorite = (project: Project) => (
    <FavoriteButton
      project={project}
      isFavorite={isFavorite(project)}
      onToggle={() => toggleFavorite(project)}
    />
  );

  const pagination =
    filtered.length > 0 ? (
      <Pagination
        label="Project pages"
        variant="compact"
        page={currentPage}
        onPageChange={setPage}
        total={filtered.length}
        pageSize={perPage}
        pageSizeOptions={[12, 24, 48, 96]}
        onPageSizeChange={(next) => {
          setPerPage(next);
          setUserTablePreference("myProjectsTable", PreferenceKey.PerPage, next);
        }}
      />
    ) : undefined;

  const columns: DataTableColumn<Project>[] = [
    ...baseColumns<Project>(orgId, () => true),
    {
      id: "favorite",
      header: "Favorite",
      hideHeader: true,
      actions: true,
      render: favorite
    }
  ];

  const isEmpty = !isPending && !projects.length;
  let body: ReactNode;
  if (isEmpty) {
    body = (
      <NoProjects
        projectType={projectType}
        layout={viewMode === ProjectsViewMode.GRID ? "cards" : "rows"}
        canCreate={canCreate}
        onCreate={onCreate}
      />
    );
  } else if (viewMode === ProjectsViewMode.LIST) {
    body = (
      <DataTable
        label={`${getProjectTitle(projectType)} projects`}
        rows={rows}
        columns={columns}
        loading={isPending}
        getRowId={(row) => row.id}
        rowLabel={(row) => row.name}
        sort={sort}
        onSortChange={setSort}
        empty={<NoMatch />}
        pagination={pagination}
      />
    );
  } else if (isPending) {
    body = (
      <Grid columns={3} gap={16}>
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} height={132} />
        ))}
      </Grid>
    );
  } else if (!filtered.length) {
    body = <NoMatch />;
  } else {
    body = (
      <Stack gap={16}>
        <Grid columns={3} gap={16}>
          {rows.map((project) => (
            <ProjectCard
              key={project.id}
              orgId={orgId}
              project={project}
              favorite={favorite(project)}
              isFavorite={isFavorite(project)}
            />
          ))}
        </Grid>
        {pagination}
      </Stack>
    );
  }

  return (
    <Stack gap={16}>
      {(!isEmpty || showListToggle) && (
        <Toolbar
          search={search}
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          listView={listView}
          onListViewChange={onListViewChange}
          showListToggle={showListToggle}
          viewMode={viewMode}
          onViewModeChange={(mode) => {
            localStorage.setItem("projectsViewMode", mode);
            setViewMode(mode);
          }}
        />
      )}
      {body}
    </Stack>
  );
};

const RequestAccessDialog = ({
  project,
  onOpenChange
}: {
  project?: Project;
  onOpenChange: (open: boolean) => void;
}) => {
  const requestAccess = useV4Adapter("projects").useRequestProjectAccess();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const close = () => {
    setNote("");
    onOpenChange(false);
  };
  const submit = async () => {
    if (!project) return;
    setPending(true);
    try {
      await requestAccess.mutateAsync({ projectId: project.id, comment: note.trim() || undefined });
      saved("Access request sent. Admins will receive an email of your request.");
      close();
    } catch (error) {
      failed("Failed to request project access", error);
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={Boolean(project)} onOpenChange={(open) => (open ? undefined : close())}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>Confirm access request</DialogTitle>
          <DialogDescription>
            {`Admins of ${project?.name ?? ""} review this request.`}
          </DialogDescription>
        </DialogHeader>
        <form
          id="request-project-access"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Field label="Note" optional wide>
            <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="request-project-access" loading={pending}>
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const LeaveProjectDialog = ({
  project,
  onOpenChange
}: {
  project?: Project;
  onOpenChange: (open: boolean) => void;
}) => {
  const leaveProject = useV4Adapter("projects").useLeaveProject();
  return (
    <AlertDialog open={Boolean(project)} onOpenChange={onOpenChange}>
      <AlertDialogContent tone="danger" confirmText="confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>{`Leave ${project?.name ?? ""}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            Removes your direct membership. Access through a group stays.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async () => {
              if (!project) return;
              onOpenChange(false);
              try {
                await leaveProject.mutateAsync({ projectId: project.id });
                saved("Removed your direct project membership");
              } catch (error) {
                failed("Failed to leave project", error);
              }
            }}
          >
            Leave project
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const AllProjects = ({
  orgId,
  projectType,
  listView,
  onListViewChange,
  showListToggle,
  canCreate,
  onCreate
}: ListProps) => {
  const navigate = useNavigate();
  const adapter = useV4Adapter("projects");
  const { permission } = useOrgPermission();
  const canAccessAllProjects = permission.can(
    OrgPermissionAdminConsoleAction.AccessAllProjects,
    OrgPermissionSubjects.AdminConsole
  );
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search);
  const [sort, setSort] = useState<Sort>({ columnId: SearchProjectSortBy.Name, direction: "asc" });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference("allProjectsTable", PreferenceKey.PerPage, 50)
  );
  const [requesting, setRequesting] = useState<Project>();
  const [leaving, setLeaving] = useState<Project>();
  const [joining, setJoining] = useState<string>();
  const { data, isPending } = adapter.useSearchProjects({
    limit: perPage,
    offset: (page - 1) * perPage,
    name: debouncedSearch || undefined,
    orderBy: sortBy(sort),
    orderDirection: sortDirection(sort),
    type: projectType
  });
  const { data: pendingRequests } = adapter.useMyPendingAccessRequests({
    enabled: !canAccessAllProjects
  });
  const adminAccess = adapter.useOrgAdminAccessProject();
  const totalCount = data?.totalCount ?? 0;

  const join = async (project: TSearchedProject) => {
    setJoining(project.id);
    try {
      await adminAccess.mutateAsync({ projectId: project.id });
      await navigate({ to: homeRoute(project.type), params: { orgId, projectId: project.id } });
    } catch (error) {
      failed("Failed to access project", error);
    } finally {
      setJoining(undefined);
    }
  };

  const joined = (project: TSearchedProject) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          layout="trigger"
          variant="outline"
          size="xs"
          icon="check"

          aria-label={`Membership options for ${project.name}`}
        >
          Joined
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {project.isDirectMember && project.version !== ProjectVersion.V1 ? (
          <DropdownMenuItem variant="destructive" onSelect={() => setLeaving(project)}>
            <Icon name="x" />
            Leave project
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            disabled
            description={
              project.isDirectMember
                ? "Ask a project admin to upgrade this project first."
                : "You have access through a group. Ask a group admin to remove your access."
            }
          >
            <Icon name="x" />
            Leave project
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const adminButton = (project: TSearchedProject, label: string) => (
    <Button
      variant="outline"
      size="xs"
      loading={joining === project.id}
      onClick={(event) => {
        event.stopPropagation();
        join(project);
      }}
    >
      {label}
    </Button>
  );

  const status = (project: TSearchedProject) => {
    if (project.isDirectMember) return joined(project);
    if (project.isMember) {
      if (!canAccessAllProjects) return joined(project);
      return (
        <Inline gap={8} align="center" wrap={false}>
          {joined(project)}
          <Tooltip content="You have access through a group. Become a direct admin.">
            {adminButton(project, "Become admin")}
          </Tooltip>
        </Inline>
      );
    }
    if (canAccessAllProjects) return adminButton(project, "Join as admin");
    const requestedAt = pendingRequests?.get(project.id);
    if (requestedAt)
      return (
        <Tooltip
          content={`Requested on ${format(requestedAt, "MMM d, yyyy 'at' h:mm a")}. Select to resend.`}
        >
          <Button variant="ghost" size="xs" icon="clock" onClick={() => setRequesting(project)}>
            Requested
          </Button>
        </Tooltip>
      );
    return (
      <Button variant="outline" size="xs" onClick={() => setRequesting(project)}>
        Request access
      </Button>
    );
  };

  const columns: DataTableColumn<TSearchedProject>[] = [
    ...baseColumns<TSearchedProject>(orgId, (row) => row.isMember),
    { id: "status", header: "Status", width: 248, align: "end", render: status }
  ];

  return (
    <Stack gap={16}>
      <Toolbar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        listView={listView}
        onListViewChange={onListViewChange}
        showListToggle={showListToggle}
        viewMode={ProjectsViewMode.LIST}
      />
      {!isPending && !totalCount && !debouncedSearch ? (
        <NoProjects
          projectType={projectType}
          layout="rows"
          canCreate={canCreate}
          onCreate={onCreate}
        />
      ) : (
        <DataTable
          label={`All ${getProjectTitle(projectType)} projects`}
          rows={data?.projects ?? []}
          columns={columns}
          loading={isPending}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name}
          sort={sort}
          onSortChange={(next) => {
            setSort(next);
            setPage(1);
          }}
          empty={<NoMatch />}
          pagination={
            totalCount > 0 ? (
              <Pagination
                label="Project pages"
                variant="compact"
                page={page}
                onPageChange={setPage}
                total={totalCount}
                pageSize={perPage}
                pageSizeOptions={[12, 24, 48, 96]}
                onPageSizeChange={(next) => {
                  setPerPage(next);
                  setUserTablePreference("allProjectsTable", PreferenceKey.PerPage, next);
                }}
              />
            ) : undefined
          }
        />
      )}
      <RequestAccessDialog project={requesting} onOpenChange={() => setRequesting(undefined)} />
      <LeaveProjectDialog project={leaving} onOpenChange={() => setLeaving(undefined)} />
    </Stack>
  );
};

const actorLabel = (actor: DeletedProject["deletedBy"]) => {
  if (!actor) return "Unknown";
  if (actor.type === "identity") return actor.name;
  return (
    [actor.firstName, actor.lastName].filter(Boolean).join(" ") ||
    actor.email ||
    actor.username ||
    "Unknown"
  );
};

const DeletedProjects = ({ projectType }: { projectType: ProjectType }) => {
  const adapter = useV4Adapter("projects");
  const { data: deleted = [], error, refetch } = adapter.useDeletedProjects(projectType);
  const restoreProject = adapter.useRestoreProject();
  const permanentlyDelete = adapter.usePermanentlyDeleteProject();
  const [restoring, setRestoring] = useState<DeletedProject>();
  const [deleting, setDeleting] = useState<DeletedProject>();

  if (!error && !deleted.length) return null;

  const columns: DataTableColumn<DeletedProject>[] = [
    { id: "name", header: "Name", primary: true, grow: true, render: (row) => row.name },
    {
      id: "deleted",
      header: "Deleted",
      grow: true,
      render: (row) =>
        `${format(new Date(row.softDeletedAt), "MMM d, yyyy")} by ${actorLabel(row.deletedBy)}`
    },
    {
      id: "remaining",
      header: "Permanent deletion",
      width: 176,
      render: (row) => (
        <Badge tone="warn">
          <Icon name="clock" size={12} />
          {`In ${formatDistanceToNowStrict(new Date(row.deleteAfter))}`}
        </Badge>
      )
    }
  ];

  return (
    <Card variant="framed" title="Recently deleted" flush>
      {error ? (
        <EmptyState
          size="sm"
          icon="alert"
          title="Deleted projects could not be loaded"
          actions={
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      ) : (
        <DataTable
          label="Recently deleted projects"
          rows={deleted}
          columns={columns}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.name}
          rowActions={{
            inline: [{ label: "Restore project", icon: "history", onSelect: setRestoring }],
            renderMenu: (row) => (
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(row)}>
                <Icon name="trash" />
                Permanently delete project
              </DropdownMenuItem>
            )
          }}
        />
      )}
      <AlertDialog open={Boolean(restoring)} onOpenChange={() => setRestoring(undefined)}>
        <AlertDialogContent tone="neutral">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Restore ${restoring?.name ?? ""}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              The project returns to your project list with its data and members.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="primary"
              onClick={async () => {
                if (!restoring) return;
                setRestoring(undefined);
                try {
                  await restoreProject.mutateAsync({ projectId: restoring.id });
                  saved("Successfully restored project");
                } catch (restoreError) {
                  failed("Failed to restore project", restoreError);
                }
              }}
            >
              Restore project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(deleting)} onOpenChange={() => setDeleting(undefined)}>
        <AlertDialogContent tone="danger" confirmText="confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Permanently delete ${deleting?.name ?? ""}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the project and all of its data now. It cannot be restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async () => {
                if (!deleting) return;
                setDeleting(undefined);
                try {
                  await permanentlyDelete.mutateAsync({ projectId: deleting.id });
                  saved("Successfully deleted project");
                } catch (deleteError) {
                  failed("Failed to delete project", deleteError);
                }
              }}
            >
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

const NewProjectDialog = ({
  orgId,
  projectType,
  open,
  onOpenChange
}: {
  orgId: string;
  projectType: ProjectType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const navigate = useNavigate();
  const createProject = useV4Adapter("projects").useCreateProject();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState<string>(InfisicalProjectTemplate.Default);
  const [kmsKeyId, setKmsKeyId] = useState(INTERNAL_KMS_KEY_ID);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const title = getProjectTitle(projectType);

  let nameError: string | undefined;
  if (!name.trim()) nameError = "Required";
  else if (name.trim().length > 64) nameError = "Too long, maximum length is 64 characters";
  const descriptionError =
    description.trim().length > 1024
      ? "Description too long, max length is 1024 characters"
      : undefined;

  const close = () => {
    setName("");
    setDescription("");
    setTemplate(InfisicalProjectTemplate.Default);
    setKmsKeyId(INTERNAL_KMS_KEY_ID);
    setSubmitted(false);
    onOpenChange(false);
  };

  const submit = async () => {
    setSubmitted(true);
    if (nameError || descriptionError) return;
    setPending(true);
    try {
      const {
        data: { project }
      } = await createProject.mutateAsync({
        projectName: name.trim(),
        projectDescription: description.trim() || undefined,
        kmsKeyId: kmsKeyId !== INTERNAL_KMS_KEY_ID ? kmsKeyId : undefined,
        template,
        type: projectType
      });
      saved("Project created");
      close();
      navigate({ to: homeRoute(project.type), params: { orgId, projectId: project.id } });
    } catch (error) {
      failed("Failed to create project", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent pending={pending}>
        <DialogHeader>
          <DialogTitle>{`Create a new ${title} project`}</DialogTitle>
        </DialogHeader>
        <form
          id="new-project-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Stack gap={16}>
            <Field label="Project name" error={submitted ? nameError : undefined} wide>
              <Input
                placeholder="Type your project name"
                autoComplete="off"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field
              label="Project description"
              optional
              error={submitted ? descriptionError : undefined}
              wide
            >
              <Textarea
                rows={3}
                placeholder="Project description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Accordion type="single" collapsible>
              <AccordionItem value="advanced-settings">
                <AccordionTrigger>Advanced settings</AccordionTrigger>
                <AccordionContent>
                  <Stack gap={16}>
                    <Field
                      label="Project template"
                      description="Provisions the project with the template's environments and roles."
                      wide
                    >
                      <Select
                        label="Project template"
                        options={Object.values(InfisicalProjectTemplate).map((value) => ({
                          value,
                          label: value
                        }))}
                        value={template}
                        onChange={setTemplate}
                      />
                    </Field>
                    <Field label="KMS" wide>
                      <Select
                        label="KMS"
                        options={[{ value: INTERNAL_KMS_KEY_ID, label: "Default Infisical KMS" }]}
                        value={kmsKeyId}
                        onChange={setKmsKeyId}
                      />
                    </Field>
                  </Stack>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Stack>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="new-project-form" loading={pending}>
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ProjectTypeContent = ({
  orgId,
  projectType
}: {
  orgId: string;
  projectType: ProjectType;
}) => {
  const { permission } = useOrgPermission();
  const canRequestAccess = permission.can(
    OrgPermissionProjectActions.RequestAccess,
    OrgPermissionSubjects.Project
  );
  const canCreate =
    permission.can(OrgPermissionProjectActions.Create, OrgPermissionSubjects.Project) ||
    permission.can(OrgPermissionActions.Create, OrgPermissionSubjects.Workspace);
  const canAccessAllProjects = permission.can(
    OrgPermissionAdminConsoleAction.AccessAllProjects,
    OrgPermissionSubjects.AdminConsole
  );
  const [listView, setListView] = useState<ProjectListView>(() =>
    localStorage.getItem("projectListView") === ProjectListView.AllProjects
      ? ProjectListView.AllProjects
      : ProjectListView.MyProjects
  );
  const [creating, setCreating] = useState(false);
  const props: ListProps = {
    orgId,
    projectType,
    listView,
    onListViewChange: (value) => {
      localStorage.setItem("projectListView", value);
      setListView(value);
    },
    showListToggle: canRequestAccess,
    canCreate,
    onCreate: () => setCreating(true)
  };
  const newProject = (
    <Button variant="accent" icon="plus" disabled={!canCreate} onClick={() => setCreating(true)}>
      New project
    </Button>
  );
  return (
    <AccessFrame>
      <Stack gap={24}>
        <PageHeader
          title={getProjectTitle(projectType)}
          description={productOf(projectType).blurb}
          actions={
            canCreate ? (
              newProject
            ) : (
              <Tooltip content="You don't have permission to create projects">
                <span>{newProject}</span>
              </Tooltip>
            )
          }
        />
        {listView === ProjectListView.AllProjects && canRequestAccess ? (
          <AllProjects {...props} />
        ) : (
          <MyProjects {...props} />
        )}
        {projectType === ProjectType.SecretManager && canAccessAllProjects && (
          <DeletedProjects projectType={projectType} />
        )}
      </Stack>
      <NewProjectDialog
        orgId={orgId}
        projectType={projectType}
        open={creating}
        onOpenChange={setCreating}
      />
    </AccessFrame>
  );
};

export const ProjectTypePage = () => {
  const { orgId, type } = useParams({ from: "/v4/organizations/$orgId/projects/$type/" });
  const projectType = urlSlugToProjectType(type);
  if (!projectType)
    return <Navigate replace to={v4Path("/organizations/$orgId/projects")} params={{ orgId }} />;
  if (
    projectType !== ProjectType.SecretManager &&
    projectType !== ProjectType.KMS &&
    projectType !== ProjectType.AgentVault
  )
    return (
      <Navigate
        replace
        to={v4Path("/organizations/$orgId/$")}
        params={{ orgId, _splat: productHome(productOf(projectType)).slice(1) }}
      />
    );
  return <ProjectTypeContent key={projectType} orgId={orgId} projectType={projectType} />;
};
