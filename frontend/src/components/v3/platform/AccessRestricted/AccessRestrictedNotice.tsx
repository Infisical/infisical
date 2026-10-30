import { ReactNode } from "react";
import { LockIcon } from "lucide-react";

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../../generic/Empty";
import { cn } from "../../utils";

type Props = {
  title?: string;
  description?: ReactNode;
  className?: string;
};

/**
 * Section-level restriction notice: sits where the section's content would go while the rest of
 * the page stays usable. Page- and tab-level gates use AccessRestrictedDialog instead.
 */
export const AccessRestrictedNotice = ({
  title = "Access Restricted",
  description = (
    <>
      Your role doesn&apos;t include permission to view this section.
      <br />
      An administrator can grant it.
    </>
  ),
  className
}: Props) => (
  <Empty className={cn("border", className)}>
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <LockIcon />
      </EmptyMedia>
      <EmptyTitle>{title}</EmptyTitle>
      <EmptyDescription>{description}</EmptyDescription>
    </EmptyHeader>
  </Empty>
);
