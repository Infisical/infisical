import { useState } from "react";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, FolderIcon } from "lucide-react";

import { Button, IconButton, Popover, PopoverContent, PopoverTrigger } from "@app/components/v3";
import { useGetProjectFolders } from "@app/hooks/api/secretFolders/queries";

type FolderNodeProps = {
  projectId: string;
  environment: string;
  path: string;
  name: string;
  value: string;
  onSelect: (path: string) => void;
};

const FolderNode = ({ projectId, environment, path, name, value, onSelect }: FolderNodeProps) => {
  const [isExpanded, setIsExpanded] = useState(
    path === "/" || value === path || value.startsWith(`${path}/`)
  );
  const {
    data: folders,
    isPending,
    isError,
    refetch
  } = useGetProjectFolders({
    projectId,
    environment,
    path,
    options: { enabled: isExpanded }
  });

  return (
    <li>
      <div className="flex min-w-0 items-center gap-1">
        <IconButton
          variant="ghost"
          size="xs"
          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${path}`}
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((previous) => !previous)}
        >
          {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </IconButton>
        <Button
          variant={value === path ? "project" : "ghost"}
          size="sm"
          className="min-w-0 flex-1 justify-start"
          title={path}
          aria-label={`Search in ${path}`}
          aria-pressed={value === path}
          onClick={() => onSelect(path)}
        >
          <FolderIcon className="shrink-0 text-folder" />
          <span className="truncate">{name}</span>
          {value === path && <CheckIcon className="ml-auto shrink-0" />}
        </Button>
      </div>
      {isExpanded && (
        <ul className="ml-3.5 border-l border-border pl-2">
          {isPending && (
            <li role="status" className="px-2 py-1.5 text-xs text-accent">
              Loading folders...
            </li>
          )}
          {isError && (
            <li className="px-2 py-1.5 text-xs text-accent">
              Could not load folders.
              <Button variant="ghost" size="xs" onClick={() => refetch()}>
                Retry
              </Button>
            </li>
          )}
          {!isPending && !isError && folders?.length === 0 && (
            <li className="px-2 py-1.5 text-xs text-accent">No subfolders</li>
          )}
          {folders
            ?.slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((folder) => (
              <FolderNode
                key={folder.id}
                projectId={projectId}
                environment={environment}
                path={`${path === "/" ? "" : path}/${folder.name}`}
                name={folder.name}
                value={value}
                onSelect={onSelect}
              />
            ))}
        </ul>
      )}
    </li>
  );
};

type Props = {
  projectId: string;
  environment?: string;
  value: string;
  onChange: (path: string) => void;
};

export const QuickSearchFolderPicker = ({ projectId, environment, value, onChange }: Props) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          id="quick-search-folder-path"
          variant="outline"
          className="w-full min-w-0 justify-start font-mono"
          isDisabled={!environment}
          aria-describedby="quick-search-folder-help"
          title={value}
        >
          <FolderIcon className="shrink-0 text-folder" />
          <span className="truncate">{value}</span>
          <ChevronDownIcon className="ml-auto shrink-0 text-accent" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        style={{ width: "var(--radix-popover-trigger-width)" }}
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        {environment && isOpen && (
          <ul aria-label="Folders" className="max-h-64 thin-scrollbar overflow-auto">
            <FolderNode
              projectId={projectId}
              environment={environment}
              path="/"
              name="All folders"
              value={value}
              onSelect={(path) => {
                onChange(path);
                setIsOpen(false);
              }}
            />
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
};
