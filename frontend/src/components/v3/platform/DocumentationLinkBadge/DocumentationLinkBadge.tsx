import { BookOpenIcon } from "lucide-react";

import { Badge } from "@app/components/v3";

type TDocumentationLinkBadgeProps = {
  href: string;
};

export function DocumentationLinkBadge({ href }: TDocumentationLinkBadgeProps) {
  return (
    <Badge variant="neutral" asChild>
      <a href={href} target="_blank" rel="noopener noreferrer">
        <BookOpenIcon />
        Documentation
      </a>
    </Badge>
  );
}
