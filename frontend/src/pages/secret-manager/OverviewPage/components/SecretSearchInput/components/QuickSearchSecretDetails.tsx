import { TagsIcon } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

type Props = {
  tags?: { id: string; slug: string }[];
};

export const QuickSearchSecretDetails = ({ tags = [] }: Props) => {
  if (tags.length === 0) return null;

  return (
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
  );
};
