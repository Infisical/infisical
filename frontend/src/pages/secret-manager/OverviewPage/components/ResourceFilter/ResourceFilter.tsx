import { useState } from "react";
import {
  FilterIcon,
  FingerprintIcon,
  FolderIcon,
  ImportIcon,
  KeyIcon,
  RefreshCwIcon,
  SearchIcon,
  TagsIcon
} from "lucide-react";

import {
  Badge,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableDropdownMenu,
  UnstableDropdownMenuCheckboxItem,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuLabel,
  UnstableDropdownMenuSeparator,
  UnstableDropdownMenuSub,
  UnstableDropdownMenuSubContent,
  UnstableDropdownMenuSubTrigger,
  UnstableDropdownMenuTrigger,
  UnstableIconButton
} from "@app/components/v3";
import { WsTag } from "@app/hooks/api/tags/types";
import { RowType } from "@app/pages/secret-manager/OverviewPage/OverviewPage";

type Props = {
  onToggleRowType: (resource: RowType) => void;
  rowTypeFilter: Record<RowType, boolean>;
  tags?: WsTag[];
  selectedTagSlugs: Record<string, boolean>;
  onToggleTag: (tagSlug: string) => void;
};

export function ResourceFilter({
  onToggleRowType,
  rowTypeFilter,
  tags,
  selectedTagSlugs,
  onToggleTag
}: Props) {
  const [tagSearch, setTagSearch] = useState("");

  const filterCount = Object.values(rowTypeFilter).filter(Boolean).length;
  const tagCount = Object.values(selectedTagSlugs).filter(Boolean).length;
  const isActive = filterCount > 0 || tagCount > 0;

  const filteredTags = tags?.filter((tag) =>
    tag.slug.toLowerCase().includes(tagSearch.toLowerCase())
  );

  return (
    <UnstableDropdownMenu>
      <UnstableDropdownMenuTrigger className="outline-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <UnstableIconButton
              className="relative"
              size="md"
              variant={isActive ? "project" : "outline"}
            >
              <FilterIcon />
            </UnstableIconButton>
          </TooltipTrigger>
          <TooltipContent>Filter resources</TooltipContent>
        </Tooltip>
      </UnstableDropdownMenuTrigger>
      <UnstableDropdownMenuContent align="end">
        <UnstableDropdownMenuLabel>Filter by Resource</UnstableDropdownMenuLabel>
        <UnstableDropdownMenuCheckboxItem
          onClick={(e) => {
            e.preventDefault();
            onToggleRowType(RowType.Folder);
          }}
          checked={Boolean(rowTypeFilter[RowType.Folder])}
        >
          <FolderIcon className="text-folder" />
          Folders
        </UnstableDropdownMenuCheckboxItem>
        <UnstableDropdownMenuCheckboxItem
          onClick={(e) => {
            e.preventDefault();
            onToggleRowType(RowType.DynamicSecret);
          }}
          checked={Boolean(rowTypeFilter[RowType.DynamicSecret])}
        >
          <FingerprintIcon className="text-dynamic-secret" />
          Dynamic Secrets
        </UnstableDropdownMenuCheckboxItem>
        <UnstableDropdownMenuCheckboxItem
          onClick={(e) => {
            e.preventDefault();
            onToggleRowType(RowType.SecretRotation);
          }}
          checked={rowTypeFilter[RowType.SecretRotation]}
        >
          <RefreshCwIcon className="text-secret-rotation" />
          Secret Rotations
        </UnstableDropdownMenuCheckboxItem>
        <UnstableDropdownMenuCheckboxItem
          onClick={(e) => {
            e.preventDefault();
            onToggleRowType(RowType.SecretImport);
          }}
          checked={Boolean(rowTypeFilter[RowType.SecretImport])}
        >
          <ImportIcon className="text-import" />
          Secret Imports
        </UnstableDropdownMenuCheckboxItem>
        <UnstableDropdownMenuCheckboxItem
          onClick={(e) => {
            e.preventDefault();
            onToggleRowType(RowType.Secret);
          }}
          checked={Boolean(rowTypeFilter[RowType.Secret])}
        >
          <KeyIcon className="text-accent" />
          Secrets
        </UnstableDropdownMenuCheckboxItem>
        <UnstableDropdownMenuSeparator />
        <UnstableDropdownMenuSub onOpenChange={(open) => !open && setTagSearch("")}>
          <UnstableDropdownMenuSubTrigger className="gap-2">
            <TagsIcon className="size-4 shrink-0 text-muted" />
            <span className="flex-1">Tags</span>
            {tagCount > 0 && (
              <Badge variant="project" isSquare>
                {tagCount}
              </Badge>
            )}
          </UnstableDropdownMenuSubTrigger>
          <UnstableDropdownMenuSubContent
            alignOffset={-5}
            className="flex max-h-72 flex-col overflow-hidden p-0"
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-border px-2.5 py-2.5">
              <SearchIcon className="size-3.5 shrink-0 text-muted" />
              <input
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
                placeholder="Search tags..."
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
            <div className="thin-scrollbar overflow-y-auto p-1">
              {!tags?.length && (
                <p className="px-2 py-1.5 text-sm text-muted">No tags in this project</p>
              )}
              {Boolean(tags?.length) && !filteredTags?.length && (
                <p className="px-2 py-1.5 text-sm text-muted">No tags found</p>
              )}
              {filteredTags?.map((tag) => (
                <UnstableDropdownMenuCheckboxItem
                  key={tag.id}
                  onClick={(e) => {
                    e.preventDefault();
                    onToggleTag(tag.slug);
                  }}
                  checked={Boolean(selectedTagSlugs[tag.slug])}
                >
                  {tag.slug}
                </UnstableDropdownMenuCheckboxItem>
              ))}
            </div>
          </UnstableDropdownMenuSubContent>
        </UnstableDropdownMenuSub>
      </UnstableDropdownMenuContent>
    </UnstableDropdownMenu>
  );
}
