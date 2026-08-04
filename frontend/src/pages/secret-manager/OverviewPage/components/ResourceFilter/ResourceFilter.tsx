import {
  ChevronsLeftRightEllipsisIcon,
  FilterIcon,
  FingerprintIcon,
  FolderIcon,
  HexagonIcon,
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
import { RowType } from "@app/pages/secret-manager/OverviewPage/types";

import { ResourceFilterMenuContent, type ResourceTypeOption } from "./ResourceFilterMenuContent";

const OVERVIEW_RESOURCE_TYPES: ResourceTypeOption[] = [
  { type: RowType.Folder, label: "Folders", icon: <FolderIcon className="text-folder" /> },
  {
    type: RowType.DynamicSecret,
    label: "Dynamic Secrets",
    icon: <FingerprintIcon className="text-dynamic-secret" />
  },
  {
    type: RowType.SecretRotation,
    label: "Secret Rotations",
    icon: <RefreshCwIcon className="text-secret-rotation" />
  },
  {
    type: RowType.SecretImport,
    label: "Secret Imports",
    icon: <ImportIcon className="text-import" />
  },
  {
    type: RowType.HoneyToken,
    label: "Honey Tokens",
    icon: <HexagonIcon className="text-yellow-700" />
  },
  {
    type: RowType.ProxiedService,
    label: "Proxied Services",
    icon: <ChevronsLeftRightEllipsisIcon className="text-proxied-service" />
  },
  { type: RowType.Secret, label: "Secrets", icon: <KeyIcon className="text-accent" /> }
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
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <IconButton className="relative" size="md" variant={isActive ? "project" : "outline"}>
              <FilterIcon />
            </IconButton>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Filter resources</TooltipContent>
      </Tooltip>
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
