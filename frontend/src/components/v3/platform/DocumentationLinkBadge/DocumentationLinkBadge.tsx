import { ExternalLinkIcon } from "lucide-react";

import { Badge } from "../../generic/Badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../generic/Tooltip";
import { cn } from "../../utils";

const LABEL = "Documentation";

type TDocumentationLinkBadgeProps = {
  href: string;
  className?: string;
  /** `minified` renders the external-link icon alone, without the badge chrome. */
  variant?: "default" | "minified";
};

export function DocumentationLinkBadge({
  href,
  className,
  variant = "default"
}: TDocumentationLinkBadgeProps) {
  const linkProps = { href, target: "_blank", rel: "noopener noreferrer" } as const;

  if (variant === "minified") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            {...linkProps}
            aria-label={LABEL}
            className={cn(
              "inline-flex items-center p-0.5 text-info transition-colors hover:text-info/75",
              className
            )}
          >
            <ExternalLinkIcon className="size-3.5" />
          </a>
        </TooltipTrigger>
        <TooltipContent>{LABEL}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Badge variant="info" iconPosition="right" className={className} asChild>
      <a {...linkProps}>
        {LABEL}
        <ExternalLinkIcon />
      </a>
    </Badge>
  );
}
