import { ExternalLinkIcon } from "lucide-react";

import { Badge } from "@app/components/v3";

type TDocumentationLinkBadgeProps = {
  href: string;
  className?: string;
};

export function DocumentationLinkBadge({ href, className }: TDocumentationLinkBadgeProps) {
  return (
    <Badge variant="info" className={className} asChild>
      <a href={href} target="_blank" rel="noopener noreferrer">
        Documentation
        <ExternalLinkIcon />
      </a>
    </Badge>
  );
}
