import {
  FilterIcon,
  FingerprintIcon,
  FolderIcon,
  ImportIcon,
  KeyIcon,
  RefreshCwIcon
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { WsTag } from "@app/hooks/api/tags/types";
import { RowType } from "@app/pages/secret-manager/OverviewPage/OverviewPage";

import { ResourceFilterMenuContent, type ResourceTypeOption } from "./ResourceFilterMenuContent";

// Use string literals to avoid circular dependency with OverviewPage at module init time
const OVERVIEW_RESOURCE_TYPES: ResourceTypeOption[] = [
  { type: "folder", label: "Folders", icon: <FolderIcon className="text-folder" /> },
  {
    type: "dynamic",
    label: "Dynamic Secrets",
    icon: <FingerprintIcon className="text-dynamic-secret" />
  },
  {
    type: "rotation",
    label: "Secret Rotations",
    icon: <RefreshCwIcon className="text-secret-rotation" />
  },
  {
    type: "import",
    label: "Secret Imports",
    icon: <ImportIcon className="text-import" />
  },
  { type: "secret", label: "Secrets", icon: <KeyIcon className="text-accent" /> }
];

type Props = {
  onToggleRowType: (resource: RowType) => void;
  rowTypeFilter: Record<RowType, boolean>;
  tags?: WsTag[];
  selectedTagSlugs: Record<string, boolean>;
  onToggleTag: (tagSlug: string) => void;
  onClearTags: () => void;
};

export function ResourceFilter({
  onToggleRowType,
  rowTypeFilter,
  tags,
  selectedTagSlugs,
  onToggleTag,
  onClearTags
}: Props) {
  const filterCount = Object.values(rowTypeFilter).filter(Boolean).length;
  const tagCount = Object.values(selectedTagSlugs).filter(Boolean).length;
  const isActive = filterCount > 0 || tagCount > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="outline-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton className="relative" size="md" variant={isActive ? "project" : "outline"}>
              <FilterIcon />
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>Filter resources</TooltipContent>
        </Tooltip>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ResourceFilterMenuContent
          resourceTypes={OVERVIEW_RESOURCE_TYPES}
          resourceTypeFilter={rowTypeFilter}
          onToggleResourceType={onToggleRowType as (type: string) => void}
          tags={tags}
          selectedTagSlugs={selectedTagSlugs}
          onToggleTag={onToggleTag}
          onClearTags={onClearTags}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
