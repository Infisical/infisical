import { CircleHelpIcon, ExternalLinkIcon } from "lucide-react";

import { FieldLabel, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

export const TtlFieldLabel = ({ htmlFor, label }: { htmlFor?: string; label: string }) => (
  <div className="flex items-center gap-1.5">
    <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="More information"
          className="rounded-sm text-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CircleHelpIcon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-lg">
        <span>
          Examples: 30m, 1h, 3d, etc.{" "}
          <a
            href="https://github.com/vercel/ms?tab=readme-ov-file#examples"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium"
          >
            <span className="underline underline-offset-2">See More Examples</span>{" "}
            <ExternalLinkIcon className="mb-0.5 inline size-3" />
          </a>
        </span>
      </TooltipContent>
    </Tooltip>
  </div>
);
