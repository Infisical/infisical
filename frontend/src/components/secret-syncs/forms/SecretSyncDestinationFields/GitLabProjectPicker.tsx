import { useState } from "react";
import { Box, Folder, Search, User, X } from "lucide-react";

import {
  BrowserRow,
  IconButton,
  InlineEmpty,
  Input,
  ListSkeleton,
  SectionHeading,
  TREE_PICKER_SCROLL_CLASS,
  TreePicker,
  TTreePickerDataSource,
  TTreePickerItem,
  TTreePickerPathEntry
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  useGitLabConnectionListGroupProjects,
  useGitLabConnectionListProjects,
  useGitLabConnectionListRootGroups,
  useGitLabConnectionListSubgroups,
  useGitLabConnectionSearchGroups,
  useGitLabConnectionSearchProjects
} from "@app/hooks/api/appConnections/gitlab";
import { useDebounce } from "@app/hooks/useDebounce";

const SEARCH_ITEMS_LIMIT = 25;

type TabKey = "groups" | "yours";

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

const PersonalProjectsList = ({
  isLoading,
  projects,
  selectedProjectId,
  onSelect,
  isSearching,
  searchQuery
}: {
  isLoading: boolean;
  projects: TTreePickerItem[];
  selectedProjectId: string;
  onSelect: (project: TTreePickerItem) => void;
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
  groups: { id: string; fullPath: string }[];
  projects: TTreePickerItem[];
  selectedProjectId: string;
  onSelectGroup: (group: { id: string; fullPath: string }) => void;
  onSelectProject: (project: TTreePickerItem) => void;
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
                label={<span className="font-mono text-xs">{group.fullPath}</span>}
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
                label={<span className="font-mono text-xs">{project.name}</span>}
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
  const [path, setPath] = useState<TTreePickerPathEntry[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search.trim(), 300);

  const hasConnection = Boolean(connectionId);
  const isSearching = debouncedSearch.length > 0;

  const treeDataSource: TTreePickerDataSource = {
    useRootContainers: (opts) => useGitLabConnectionListRootGroups(connectionId, opts),
    useSubContainers: (groupId, opts) =>
      useGitLabConnectionListSubgroups(connectionId, groupId, opts),
    useContainerItems: (groupId, opts) =>
      useGitLabConnectionListGroupProjects(connectionId, groupId, opts)
  };

  const rootGroupsQuery = useGitLabConnectionListRootGroups(connectionId, {
    enabled: hasConnection
  });

  const personalProjectsQuery = useGitLabConnectionListProjects(connectionId, {
    enabled: hasConnection
  });

  const projectSearchQuery = useGitLabConnectionSearchProjects(connectionId, debouncedSearch, {
    enabled: hasConnection && tab === "groups" && isSearching
  });

  const groupNameSearchQuery = useGitLabConnectionSearchGroups(connectionId, debouncedSearch, {
    enabled: hasConnection && tab === "groups" && isSearching
  });

  const handleTabChange = (next: TabKey) => {
    if (next === tab) return;
    setTab(next);
    setSearch("");
    setPath([]);
  };

  const handleProjectSelect = (project: { id: string; name: string }) => {
    onChange({ id: project.id, name: project.name });
  };

  const handleSearchGroupSelect = (group: { id: string; fullPath: string }) => {
    setSearch("");
    setPath([{ id: group.id, name: group.fullPath }]);
  };

  const normalizedSearch = debouncedSearch.toLowerCase();
  const personalProjects = personalProjectsQuery.data ?? [];
  const filteredPersonalProjects = personalProjects.filter((project) =>
    project.name.toLowerCase().includes(normalizedSearch)
  );

  const searchedProjects = (projectSearchQuery.data ?? [])
    .filter((project) => project.name.toLowerCase().includes(normalizedSearch))
    .map((project) => ({ id: project.id, name: project.name }))
    .slice(0, SEARCH_ITEMS_LIMIT);

  return (
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
            label="Projects"
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
              <X />
            </IconButton>
          )}
        </div>
      </div>

      {!hasConnection && (
        <div className={cn(TREE_PICKER_SCROLL_CLASS, "px-3 py-10 text-center text-sm text-muted")}>
          Select a GitLab Connection above to browse projects.
        </div>
      )}

      {hasConnection && tab === "groups" && isSearching && (
        <div className={cn(TREE_PICKER_SCROLL_CLASS, "p-1")}>
          <SearchResultsList
            query={debouncedSearch}
            isLoading={projectSearchQuery.isLoading || groupNameSearchQuery.isLoading}
            groups={groupNameSearchQuery.data ?? []}
            projects={searchedProjects}
            selectedProjectId={selectedProjectId}
            onSelectGroup={handleSearchGroupSelect}
            onSelectProject={handleProjectSelect}
          />
        </div>
      )}

      {hasConnection && tab === "groups" && !isSearching && (
        <TreePicker
          dataSource={treeDataSource}
          path={path}
          onPathChange={setPath}
          selectedItemId={selectedProjectId}
          onSelectItem={handleProjectSelect}
          rootLabel="Groups"
          subContainersHeading="Subgroups"
          itemsHeading="Projects"
          emptyRoot={{
            title: "No groups available.",
            description: "Your GitLab account isn't a member of any group."
          }}
          emptyContainer={{
            title: "This group is empty.",
            description: "No subgroups or projects available to your token here."
          }}
        />
      )}

      {hasConnection && tab === "yours" && (
        <div className={cn(TREE_PICKER_SCROLL_CLASS, "p-1")}>
          <PersonalProjectsList
            isLoading={personalProjectsQuery.isLoading}
            projects={filteredPersonalProjects}
            selectedProjectId={selectedProjectId}
            onSelect={handleProjectSelect}
            isSearching={isSearching}
            searchQuery={debouncedSearch}
          />
        </div>
      )}
    </div>
  );
};
