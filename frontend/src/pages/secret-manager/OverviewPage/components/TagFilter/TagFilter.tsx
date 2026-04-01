import { useState } from "react";
import { SearchIcon, TagIcon } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableDropdownMenu,
  UnstableDropdownMenuCheckboxItem,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuTrigger,
  UnstableIconButton
} from "@app/components/v3";
import { WsTag } from "@app/hooks/api/tags/types";

type Props = {
  tags?: WsTag[];
  selectedTagSlugs: Record<string, boolean>;
  onToggleTag: (tagSlug: string) => void;
};

export function TagFilter({ tags, selectedTagSlugs, onToggleTag }: Props) {
  const [search, setSearch] = useState("");
  const selectedCount = Object.values(selectedTagSlugs).filter(Boolean).length;
  const hasTags = Boolean(tags?.length);

  const filteredTags = tags?.filter((tag) => tag.slug.toLowerCase().includes(search.toLowerCase()));

  return (
    <UnstableDropdownMenu onOpenChange={(open) => !open && setSearch("")}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <UnstableDropdownMenuTrigger className="outline-0" disabled={!hasTags} asChild>
              <UnstableIconButton
                className="relative"
                size="md"
                variant={selectedCount ? "project" : "outline"}
                isDisabled={!hasTags}
              >
                <TagIcon />
              </UnstableIconButton>
            </UnstableDropdownMenuTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent>{hasTags ? "Filter by tag" : "No tags in this project"}</TooltipContent>
      </Tooltip>
      <UnstableDropdownMenuContent align="end" className="w-48">
        <div className="flex items-center gap-2 border-b border-border px-2 pt-0.5 pb-1.5">
          <SearchIcon className="size-3.5 shrink-0 text-muted" />
          <input
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none"
            placeholder="Search tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <div className="mt-1">
          {filteredTags?.length ? (
            filteredTags.map((tag) => (
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
            ))
          ) : (
            <p className="px-2 py-1.5 text-sm text-muted">No tags found</p>
          )}
        </div>
      </UnstableDropdownMenuContent>
    </UnstableDropdownMenu>
  );
}
