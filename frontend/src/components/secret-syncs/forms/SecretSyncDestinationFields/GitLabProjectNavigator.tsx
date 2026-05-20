import { useEffect, useRef, useState } from "react";
import { faCheck, faChevronRight, faCodeBranch, faFolder } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Spinner } from "@app/components/v2";
import {
  TGitLabGroupTreeItem,
  TGitLabProject,
  useGitLabConnectionListGroupProjects,
  useGitLabConnectionListGroupSubgroups,
  useGitLabConnectionListRootGroups
} from "@app/hooks/api/appConnections/gitlab";

type ColumnProps = {
  connectionId: string;
  groupId: string | null;
  selectedGroupId: string | null;
  selectedProjectId: string;
  onGroupClick: (group: TGitLabGroupTreeItem) => void;
  onProjectClick: (id: string, name: string) => void;
  isLastColumn: boolean;
};

const GitLabFinderColumn = ({
  connectionId,
  groupId,
  selectedGroupId,
  selectedProjectId,
  onGroupClick,
  onProjectClick,
  isLastColumn
}: ColumnProps) => {
  const isRoot = !groupId;

  const { data: rootGroups, isLoading: isLoadingRoot } = useGitLabConnectionListRootGroups(connectionId, {
    enabled: isRoot && Boolean(connectionId)
  });

  const { data: subgroups, isLoading: isLoadingSubgroups } = useGitLabConnectionListGroupSubgroups(
    connectionId,
    groupId ?? "",
    { enabled: !isRoot && Boolean(connectionId) }
  );

  const { data: groupProjects, isLoading: isLoadingProjects } = useGitLabConnectionListGroupProjects(
    connectionId,
    groupId ?? "",
    { enabled: !isRoot && Boolean(connectionId) }
  );

  const isLoading = isRoot ? isLoadingRoot : isLoadingSubgroups || isLoadingProjects;
  const groups: TGitLabGroupTreeItem[] = isRoot ? (rootGroups ?? []) : (subgroups ?? []);
  const projects: TGitLabProject[] = isRoot ? [] : (groupProjects ?? []);

  return (
    <div
      className={`flex w-48 shrink-0 flex-col overflow-y-auto border-r border-mineshaft-700 ${isLastColumn ? "border-r-0" : ""}`}
    >
      {isLoading && (
        <div className="flex items-center justify-center py-6">
          <Spinner size="sm" />
        </div>
      )}

      {!isLoading && (
        <>
          {groups.map((group) => {
            const isSelected = group.id === selectedGroupId;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => onGroupClick(group)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  isSelected ? "bg-primary/20 text-primary" : "text-mineshaft-200 hover:bg-mineshaft-800"
                }`}
              >
                <FontAwesomeIcon
                  icon={faFolder}
                  size="sm"
                  className={isSelected ? "shrink-0 text-primary" : "shrink-0 text-yellow-600/70"}
                />
                <span className="truncate">{group.name}</span>
                <FontAwesomeIcon
                  icon={faChevronRight}
                  size="xs"
                  className="ml-auto shrink-0 text-mineshaft-500"
                />
              </button>
            );
          })}

          {projects.map((project) => {
            const isSelected = project.id === selectedProjectId;
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => onProjectClick(project.id, project.name)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  isSelected ? "bg-primary/20 text-primary" : "text-mineshaft-200 hover:bg-mineshaft-800"
                }`}
              >
                <FontAwesomeIcon
                  icon={faCodeBranch}
                  size="sm"
                  className={isSelected ? "shrink-0 text-primary" : "shrink-0 text-mineshaft-400"}
                />
                <span className="truncate">{project.name}</span>
                {isSelected && (
                  <FontAwesomeIcon icon={faCheck} size="xs" className="ml-auto shrink-0 text-primary" />
                )}
              </button>
            );
          })}

          {groups.length === 0 && projects.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-mineshaft-400">Nothing here</p>
          )}
        </>
      )}
    </div>
  );
};

type Props = {
  connectionId: string;
  value: string;
  projectName: string;
  onChange: (projectId: string, projectName: string) => void;
  isDisabled?: boolean;
};

export const GitLabProjectNavigator = ({ connectionId, value, projectName, onChange, isDisabled }: Props) => {
  const [navStack, setNavStack] = useState<TGitLabGroupTreeItem[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ left: scrollRef.current.scrollWidth, behavior: "smooth" });
    }
  }, [navStack.length]);

  const handleGroupClick = (group: TGitLabGroupTreeItem, columnIndex: number) => {
    setNavStack((prev) => [...prev.slice(0, columnIndex), group]);
  };

  // columnGroupIds[0] = null (root), columnGroupIds[1] = navStack[0].id, etc.
  const columnGroupIds: (string | null)[] = [null, ...navStack.map((g) => g.id)];

  return (
    <div
      className={`rounded-md border border-mineshaft-600 bg-mineshaft-900 ${isDisabled ? "pointer-events-none opacity-50" : ""}`}
    >
      <div ref={scrollRef} className="flex h-52 overflow-x-auto">
        {columnGroupIds.map((groupId, i) => (
          <GitLabFinderColumn
            key={groupId ?? "root"}
            connectionId={connectionId}
            groupId={groupId}
            selectedGroupId={navStack[i]?.id ?? null}
            selectedProjectId={value}
            onGroupClick={(group) => handleGroupClick(group, i)}
            onProjectClick={onChange}
            isLastColumn={i === columnGroupIds.length - 1}
          />
        ))}
      </div>

      {value && (
        <div className="flex items-center gap-2 border-t border-mineshaft-600 px-3 py-2 text-xs text-mineshaft-300">
          <FontAwesomeIcon icon={faCheck} size="xs" className="text-primary" />
          <span className="truncate">
            Selected: <span className="text-bunker-200">{projectName}</span>
          </span>
        </div>
      )}
    </div>
  );
};
