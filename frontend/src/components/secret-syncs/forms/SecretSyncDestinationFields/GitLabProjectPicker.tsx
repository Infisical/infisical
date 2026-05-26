import { useEffect, useState } from "react";
import { Box, Check, ChevronLeft, ChevronRight, Folder, Search, User, X } from "lucide-react";

import {
  Button,
  Empty,
  EmptyDescription,
  EmptyTitle,
  IconButton,
  Input,
  Skeleton
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  TGitLabGroupTreeItem,
  TGitLabProject,
  useGitLabConnectionListGroupProjects,
  useGitLabConnectionListProjects,
  useGitLabConnectionListRootGroups,
  useGitLabConnectionListSubgroups,
  useGitLabConnectionSearchGroupsAndProjects,
  useGitLabConnectionSearchGroups
} from "@app/hooks/api/appConnections/gitlab";
import { useDebounce } from "@app/hooks/useDebounce";

const PERSONAL_PROJECTS_PER_PAGE = 20;
const GROUPS_SEARCH_PER_PAGE = 25;

type TabKey = "groups" | "yours";

type BreadcrumbEntry = {
  id: string;
  name: string;
  fullPath: string;
};

type GitLabProjectPickerProps = {
  connectionId: string;
  selectedProjectId: string;
  isError?: boolean;
  onChange: (project: { id: string; name: string }) => void;
};

const SegmentedButton = ({
  icon,
  label,
  isActive,
  count,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  count?: number;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-pressed={isActive}
    onClick={onClick}
    className={cn(
      "flex h-7 min-w-0 flex-1 items-center justify-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors",
      "@md/picker:inline-flex @md/picker:flex-none @md/picker:shrink-0 @md/picker:justify-start",
      "[&_svg]:size-3.5 [&_svg]:shrink-0",
      isActive
        ? "border border-primary/25 bg-primary/10 text-foreground"
        : "border border-transparent text-accent hover:bg-foreground/5 hover:text-foreground"
    )}
  >
    {icon}
    <span className="min-w-0 truncate">{label}</span>
    {count != null && (
      <span
        className={cn(
          "rounded-sm px-1 text-[10px] leading-tight font-medium",
          isActive ? "bg-primary/15 text-foreground" : "bg-foreground/10 text-muted"
        )}
      >
        {count}
      </span>
    )}
  </button>
);

const ListSkeleton = () => (
  <div className="flex flex-col gap-1 p-1">
    {Array.from({ length: 5 }).map((_, i) => (
      // eslint-disable-next-line react/no-array-index-key
      <Skeleton key={i} className="h-8 w-full" />
    ))}
  </div>
);

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <div className="px-2 pt-2 pb-1 text-[10px] font-medium tracking-wider text-muted uppercase">
    {children}
  </div>
);

const InlineEmpty = ({ title, description }: { title: string; description?: string }) => (
  <Empty className="border-0 bg-transparent p-6 shadow-none">
    <EmptyTitle>{title}</EmptyTitle>
    {description && <EmptyDescription>{description}</EmptyDescription>}
  </Empty>
);

const BrowserRow = ({
  icon,
  label,
  meta,
  isSelected = false,
  showChevron = false,
  onClick
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  meta?: React.ReactNode;
  isSelected?: boolean;
  showChevron?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "group flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors",
      "[&_svg]:size-3.5 [&_svg]:shrink-0",
      isSelected
        ? "bg-primary/10 text-foreground"
        : "text-accent hover:bg-foreground/5 hover:text-foreground"
    )}
  >
    <span className={cn("inline-flex shrink-0", isSelected ? "text-primary" : "text-muted")}>
      {icon}
    </span>
    <span className="min-w-0 flex-1 truncate">{label}</span>
    {meta != null && <span className="shrink-0 text-xs text-muted">{meta}</span>}
    {showChevron && <ChevronRight className="text-muted" />}
    {isSelected && !showChevron && <Check className="text-primary" />}
  </button>
);

const GroupList = ({
  groups,
  onDrillIn,
  emptyMessage,
  emptyHint
}: {
  groups: TGitLabGroupTreeItem[];
  onDrillIn: (group: TGitLabGroupTreeItem) => void;
  emptyMessage: string;
  emptyHint?: string;
}) => {
  if (groups.length === 0) {
    return <InlineEmpty title={emptyMessage} description={emptyHint} />;
  }

  return (
    <div className="flex flex-col gap-0.5 p-1">
      {groups.map((group) => (
        <BrowserRow
          key={group.id}
          icon={<Folder className="text-folder" />}
          label={group.name}
          meta={group.fullPath !== group.name ? group.fullPath : undefined}
          showChevron
          onClick={() => onDrillIn(group)}
        />
      ))}
    </div>
  );
};

const GroupDetailList = ({
  subgroups,
  projects,
  selectedProjectId,
  onDrillIn,
  onSelectProject
}: {
  subgroups: TGitLabGroupTreeItem[];
  projects: TGitLabProject[];
  selectedProjectId: string;
  onDrillIn: (group: TGitLabGroupTreeItem) => void;
  onSelectProject: (project: TGitLabProject) => void;
}) => {
  if (subgroups.length === 0 && projects.length === 0) {
    return (
      <InlineEmpty
        title="This group is empty."
        description="No subgroups or projects available to your token here."
      />
    );
  }

  return (
    <div className="flex flex-col">
      {subgroups.length > 0 && (
        <>
          <SectionHeading>Subgroups</SectionHeading>
          <div className="flex flex-col gap-0.5 p-1">
            {subgroups.map((subgroup) => (
              <BrowserRow
                key={subgroup.id}
                icon={<Folder className="text-folder" />}
                label={subgroup.name}
                meta={subgroup.fullPath}
                showChevron
                onClick={() => onDrillIn(subgroup)}
              />
            ))}
          </div>
        </>
      )}
      {projects.length > 0 && (
        <>
          <SectionHeading>Projects</SectionHeading>
          <div className="flex flex-col gap-0.5 p-1">
            {projects.map((project) => (
              <BrowserRow
                key={project.id}
                icon={<Box />}
                label={project.name}
                isSelected={project.id === selectedProjectId}
                onClick={() => onSelectProject(project)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const PersonalProjectsList = ({
  isLoading,
  projects,
  selectedProjectId,
  onSelect,
  isSearching,
  searchQuery
}: {
  isLoading: boolean;
  projects: TGitLabProject[];
  selectedProjectId: string;
  onSelect: (project: TGitLabProject) => void;
  isSearching: boolean;
  searchQuery: string;
}) => {
  if (isLoading) return <ListSkeleton />;

  if (projects.length === 0) {
    return isSearching ? (
      <InlineEmpty
        title={`No projects match "${searchQuery}".`}
        description="Try a partial name."
      />
    ) : (
      <InlineEmpty
        title="No personal projects."
        description="Projects you create outside of a group will show up here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-1">
      {projects.map((project) => (
        <BrowserRow
          key={project.id}
          icon={<Box />}
          label={project.name}
          isSelected={project.id === selectedProjectId}
          onClick={() => onSelect(project)}
        />
      ))}
    </div>
  );
};

const SearchResultsList = ({
  query,
  isLoading,
  groups,
  projects,
  selectedProjectId,
  onSelectGroup,
  onSelectProject
}: {
  query: string;
  isLoading: boolean;
  groups: TGitLabGroupTreeItem[];
  projects: TGitLabProject[];
  selectedProjectId: string;
  onSelectGroup: (group: TGitLabGroupTreeItem) => void;
  onSelectProject: (project: TGitLabProject) => void;
}) => {
  if (isLoading) return <ListSkeleton />;

  if (groups.length === 0 && projects.length === 0) {
    return (
      <InlineEmpty
        title={`No groups or projects match "${query}".`}
        description="Try a partial name or browse groups."
      />
    );
  }

  return (
    <div className="flex flex-col">
      {groups.length > 0 && (
        <>
          <SectionHeading>Groups</SectionHeading>
          <div className="flex flex-col gap-0.5 p-1">
            {groups.map((group) => (
              <BrowserRow
                key={group.id}
                icon={<Folder className="text-folder" />}
                label={<span className="truncate font-mono text-xs">{group.fullPath}</span>}
                showChevron
                onClick={() => onSelectGroup(group)}
              />
            ))}
          </div>
        </>
      )}
      {projects.length > 0 && (
        <>
          <SectionHeading>Projects</SectionHeading>
          <div className="flex flex-col gap-0.5 p-1">
            {projects.map((project) => (
              <BrowserRow
                key={project.id}
                icon={<Box />}
                label={<span className="truncate font-mono text-xs">{project.name}</span>}
                isSelected={project.id === selectedProjectId}
                onClick={() => onSelectProject(project)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const GitLabProjectPicker = ({
  connectionId,
  selectedProjectId,
  isError,
  onChange
}: GitLabProjectPickerProps) => {
  const [tab, setTab] = useState<TabKey>("groups");
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbEntry[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search.trim(), 300);
  const [personalPage, setPersonalPage] = useState(1);

  useEffect(() => {
    setPersonalPage(1);
  }, [debouncedSearch, tab]);

  const hasConnection = Boolean(connectionId);
  const isSearching = debouncedSearch.length > 0;
  const currentGroup = breadcrumb[breadcrumb.length - 1] ?? null;

  const rootGroupsQuery = useGitLabConnectionListRootGroups(connectionId, {
    enabled: hasConnection
  });

  const personalProjectsQuery = useGitLabConnectionListProjects(
    connectionId,
    { owned: true },
    { enabled: hasConnection }
  );

  const subgroupsQuery = useGitLabConnectionListSubgroups(connectionId, currentGroup?.id ?? "", {
    enabled: hasConnection && tab === "groups" && !isSearching && Boolean(currentGroup)
  });

  const groupProjectsQuery = useGitLabConnectionListGroupProjects(
    connectionId,
    currentGroup?.id ?? "",
    {
      enabled: hasConnection && tab === "groups" && !isSearching && Boolean(currentGroup)
    }
  );

  const groupsAndProjectsSearchQuery = useGitLabConnectionSearchGroupsAndProjects(
    connectionId,
    debouncedSearch,
    {
      enabled: hasConnection && tab === "groups" && isSearching
    }
  );

  const groupNameSearchQuery = useGitLabConnectionSearchGroups(connectionId, debouncedSearch, {
    enabled: hasConnection && tab === "groups" && isSearching
  });

  const handleTabChange = (next: TabKey) => {
    if (next === tab) return;
    setTab(next);
    setSearch("");
    setBreadcrumb([]);
  };

  const handleDrillIn = (group: TGitLabGroupTreeItem) => {
    setBreadcrumb((prev) => [
      ...prev,
      { id: group.id, name: group.name, fullPath: group.fullPath }
    ]);
  };

  const handleBreadcrumbJump = (index: number) => {
    setBreadcrumb((prev) => prev.slice(0, index + 1));
  };

  const handleBack = () => {
    setBreadcrumb((prev) => prev.slice(0, -1));
  };

  const handleProjectSelect = (project: TGitLabProject) => {
    onChange({ id: project.id, name: project.name });
  };

  const handleSearchGroupSelect = (group: TGitLabGroupTreeItem) => {
    setSearch("");
    setBreadcrumb([{ id: group.id, name: group.fullPath, fullPath: group.fullPath }]);
  };

  const isLoadingGroupsView =
    tab === "groups" &&
    !isSearching &&
    (currentGroup
      ? subgroupsQuery.isLoading || groupProjectsQuery.isLoading
      : rootGroupsQuery.isLoading);

  const normalizedSearch = debouncedSearch.toLowerCase();
  const personalProjects = personalProjectsQuery.data ?? [];
  const filteredPersonalProjects = personalProjects.filter((project) =>
    project.name.toLowerCase().includes(normalizedSearch)
  );
  const personalTotalCount = filteredPersonalProjects.length;
  const personalTotalPages = Math.ceil(personalTotalCount / PERSONAL_PROJECTS_PER_PAGE);
  const paginatedPersonalProjects = filteredPersonalProjects.slice(
    (personalPage - 1) * PERSONAL_PROJECTS_PER_PAGE,
    personalPage * PERSONAL_PROJECTS_PER_PAGE
  );
  const searchedGroupIds = new Set((groupNameSearchQuery.data ?? []).map((group) => group.id));
  const searchedGroupProjects = (groupsAndProjectsSearchQuery.data ?? [])
    .filter((item) => !searchedGroupIds.has(item.id))
    .filter((project) => project.name.toLowerCase().includes(normalizedSearch))
    .map((project) => ({ id: project.id, name: project.name }))
    .slice(0, GROUPS_SEARCH_PER_PAGE);

  useEffect(() => {
    if (personalTotalPages === 0) {
      if (personalPage !== 1) setPersonalPage(1);
      return;
    }

    if (personalPage > personalTotalPages) {
      setPersonalPage(personalTotalPages);
    }
  }, [personalPage, personalTotalPages]);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        className={cn(
          "@container/picker flex min-w-0 flex-col gap-2 rounded-md border bg-container",
          isError ? "border-danger" : "border-border"
        )}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border p-2">
          <div className="flex w-full items-center gap-0.5 rounded-md border border-border bg-bunker-700/30 p-0.5 @md/picker:inline-flex @md/picker:w-auto @md/picker:shrink-0">
            <SegmentedButton
              icon={<Folder />}
              label="Groups"
              isActive={tab === "groups"}
              count={rootGroupsQuery.data?.length}
              onClick={() => handleTabChange("groups")}
            />
            <SegmentedButton
              icon={<User />}
              label="Your projects"
              isActive={tab === "yours"}
              count={personalProjects.length}
              onClick={() => handleTabChange("yours")}
            />
          </div>
          <div className="relative flex min-w-0 flex-1 items-center @md/picker:min-w-[160px]">
            <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                tab === "yours" ? "Search your projects..." : "Search groups & projects..."
              }
              className="h-8 w-full min-w-0 pr-7 pl-8 text-sm"
              disabled={!hasConnection}
            />
            {search.length > 0 && (
              <IconButton
                aria-label="Clear search"
                variant="ghost-muted"
                size="xs"
                className="absolute right-1"
                onClick={() => setSearch("")}
              >
                <X className="size-3.5" />
              </IconButton>
            )}
          </div>
        </div>

        {tab === "groups" && !isSearching && breadcrumb.length > 0 && (
          <div className="flex min-w-0 items-center gap-2 border-b border-border px-2 py-1.5">
            <IconButton
              aria-label="Back"
              variant="ghost-muted"
              size="xs"
              className="shrink-0"
              onClick={handleBack}
            >
              <ChevronLeft className="size-3.5" />
            </IconButton>
            <nav
              aria-label="breadcrumb"
              className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-xs"
            >
              <button
                type="button"
                onClick={() => setBreadcrumb([])}
                className="shrink-0 cursor-pointer whitespace-nowrap text-muted hover:text-foreground"
              >
                Groups
              </button>
              {breadcrumb.map((entry, index) => {
                const isLast = index === breadcrumb.length - 1;
                return (
                  <span key={entry.id} className="inline-flex min-w-0 items-center gap-1">
                    <ChevronRight className="size-3 shrink-0 text-muted/70" />
                    {isLast ? (
                      <span aria-current="page" className="truncate text-foreground">
                        {entry.name}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleBreadcrumbJump(index)}
                        className="cursor-pointer truncate text-muted hover:text-foreground"
                      >
                        {entry.name}
                      </button>
                    )}
                  </span>
                );
              })}
            </nav>
          </div>
        )}

        <div className="max-h-[320px] min-h-[260px] overflow-y-auto p-1">
          {!hasConnection && (
            <div className="px-3 py-10 text-center text-sm text-muted">
              Select a GitLab Connection above to browse projects.
            </div>
          )}

          {hasConnection && tab === "groups" && isSearching && (
            <SearchResultsList
              query={debouncedSearch}
              isLoading={groupsAndProjectsSearchQuery.isLoading || groupNameSearchQuery.isLoading}
              groups={groupNameSearchQuery.data ?? []}
              projects={searchedGroupProjects}
              selectedProjectId={selectedProjectId}
              onSelectGroup={handleSearchGroupSelect}
              onSelectProject={handleProjectSelect}
            />
          )}

          {hasConnection && tab === "groups" && !isSearching && isLoadingGroupsView && (
            <ListSkeleton />
          )}

          {hasConnection &&
            tab === "groups" &&
            !isSearching &&
            !isLoadingGroupsView &&
            !currentGroup && (
              <GroupList
                groups={rootGroupsQuery.data ?? []}
                onDrillIn={handleDrillIn}
                emptyMessage="No groups available."
                emptyHint="Your GitLab account isn't a member of any group."
              />
            )}

          {hasConnection &&
            tab === "groups" &&
            !isSearching &&
            !isLoadingGroupsView &&
            currentGroup && (
              <GroupDetailList
                subgroups={subgroupsQuery.data ?? []}
                projects={groupProjectsQuery.data ?? []}
                selectedProjectId={selectedProjectId}
                onDrillIn={handleDrillIn}
                onSelectProject={handleProjectSelect}
              />
            )}

          {hasConnection && tab === "yours" && (
            <PersonalProjectsList
              isLoading={personalProjectsQuery.isLoading}
              projects={paginatedPersonalProjects}
              selectedProjectId={selectedProjectId}
              onSelect={handleProjectSelect}
              isSearching={isSearching}
              searchQuery={debouncedSearch}
            />
          )}
        </div>

        {tab === "yours" && hasConnection && personalTotalCount > PERSONAL_PROJECTS_PER_PAGE && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-2 py-2 text-xs text-muted">
            <span className="whitespace-nowrap">
              Page {personalPage} of {personalTotalPages}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="xs"
                isDisabled={personalPage <= 1 || personalProjectsQuery.isFetching}
                onClick={() => setPersonalPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-3.5" /> Prev
              </Button>
              <Button
                variant="ghost"
                size="xs"
                isDisabled={personalPage >= personalTotalPages || personalProjectsQuery.isFetching}
                onClick={() => setPersonalPage((p) => p + 1)}
              >
                Next <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          {tab === "yours"
            ? "Projects owned directly by your GitLab user."
            : "Browse groups, then pick a project."}
        </span>
        {selectedProjectId && selectedProjectName && (
          <Badge variant="project" className="font-mono">
            <span className="truncate">{selectedProjectName}</span>
          </Badge>
        )}
      </div> */}
    </div>
  );
};
