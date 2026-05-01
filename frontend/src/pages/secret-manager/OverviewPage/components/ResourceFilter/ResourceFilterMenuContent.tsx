import { type ReactNode, useState } from "react";
import { SearchIcon, TagsIcon, XIcon } from "lucide-react";

import {
  Badge,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { WsTag } from "@app/hooks/api/tags/types";

export type ResourceTypeOption = {
  type: string;
  label: string;
  icon: ReactNode;
};

type Props = {
  resourceTypes: ResourceTypeOption[];
  resourceTypeFilter: Record<string, boolean>;
  onToggleResourceType: (type: string) => void;
  tags?: WsTag[];
  selectedTagSlugs: Record<string, boolean>;
  onToggleTag: (tagSlug: string) => void;
  onClearTags: () => void;
  menuLabel?: string;
};

export function ResourceFilterMenuContent({
  resourceTypes,
  resourceTypeFilter,
  onToggleResourceType,
  tags,
  selectedTagSlugs,
  onToggleTag,
  onClearTags,
  menuLabel = "Filter by Resource"
}: Props) {
  const [tagSearch, setTagSearch] = useState("");

  const tagCount = Object.values(selectedTagSlugs).filter(Boolean).length;

  const filteredTags = tags?.filter((tag) =>
    tag.slug.toLowerCase().includes(tagSearch.toLowerCase())
  );

  return (
    <>
      <DropdownMenuLabel>{menuLabel}</DropdownMenuLabel>
      {resourceTypes.map((rt) => (
        <DropdownMenuCheckboxItem
          key={rt.type}
          onClick={(e) => {
            e.preventDefault();
            onToggleResourceType(rt.type);
          }}
          checked={Boolean(resourceTypeFilter[rt.type])}
        >
          {rt.icon}
          {rt.label}
        </DropdownMenuCheckboxItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuSub onOpenChange={(open) => !open && setTagSearch("")}>
        <DropdownMenuSubTrigger className="gap-2">
          <TagsIcon className="size-4 shrink-0 text-muted" />
          <span className="flex-1">Tags</span>
          {tagCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant="project"
                  className="cursor-pointer gap-0.5"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClearTags();
                  }}
                >
                  {tagCount}
                  <XIcon className="size-2.5" />
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Clear tag filters</TooltipContent>
            </Tooltip>
          )}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent
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
              <DropdownMenuCheckboxItem
                key={tag.id}
                onClick={(e) => {
                  e.preventDefault();
                  onToggleTag(tag.slug);
                }}
                checked={Boolean(selectedTagSlugs[tag.slug])}
              >
                {tag.slug}
              </DropdownMenuCheckboxItem>
            ))}
          </div>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  );
}
