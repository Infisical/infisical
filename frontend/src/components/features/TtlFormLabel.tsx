import { CircleHelpIcon, ExternalLinkIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "../v3";

// To give users example of possible values of TTL
export const TtlFormLabel = ({ label }: { label: string }) => (
  <span className="inline-flex items-center gap-1">
    {label}
    <Tooltip>
      <TooltipTrigger asChild>
        <CircleHelpIcon className="size-3.5 text-muted" />
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
  </span>
);
