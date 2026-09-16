import { BracesIcon, TagsIcon } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

type Props = {
  tags?: { id: string; slug: string }[];
  metadata?: { key: string; value: string | null }[];
};

export const QuickSearchSecretDetails = ({ tags = [], metadata = [] }: Props) => (
  <>
    {tags.length > 0 && (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="neutral" tabIndex={0} aria-label={`${tags.length} tags`}>
            <TagsIcon />
            {tags.length}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-lg">
          <div className="flex flex-col gap-1">
            {tags.map((tag) => (
              <span key={tag.id} className="break-all">
                {tag.slug}
              </span>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    )}
    {metadata.length > 0 && (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="neutral" tabIndex={0} aria-label={`${metadata.length} metadata entries`}>
            <BracesIcon />
            {metadata.length}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-lg">
          <div className="flex flex-col gap-1 font-mono">
            {metadata.map((entry) => (
              <span key={entry.key} className="break-all">
                {entry.key}: {entry.value ?? ""}
              </span>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    )}
  </>
);
