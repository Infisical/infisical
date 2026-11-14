import * as React from "react";
import { createLink } from "@tanstack/react-router";

import { cn } from "@app/components/v3/utils";

// Applied by `linked` on TableRow and Card. The container positions the RowLink overlay, and
// every control inside it is lifted above that overlay so it keeps its own click instead of
// opening the row. A non-interactive tooltip anchor (a span badge) opts in with
// data-row-interactive. Absolutely positioned controls are skipped so they keep their layout.
const rowLinkContainerClassName = cn(
  "group relative cursor-pointer",
  "[&_:is(button,input,select,textarea,a:not([data-row-link]),[role=checkbox],[role=combobox],[data-slot=tooltip-trigger],[data-row-interactive]):not(.absolute,.fixed)]:relative",
  "[&_:is(button,input,select,textarea,a:not([data-row-link]),[role=checkbox],[role=combobox],[data-slot=tooltip-trigger],[data-row-interactive]):not(.absolute,.fixed)]:z-10",
  "[&>td[data-variant=action]]:relative [&>td[data-variant=action]]:z-10"
);

const rowLinkClassName =
  "block truncate outline-0 after:absolute after:inset-0 after:z-[1] after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring";

type RowLinkAnchorProps = React.ComponentProps<"a"> & { disabled?: boolean };

const RowLinkAnchor = React.forwardRef<HTMLAnchorElement, RowLinkAnchorProps>(
  ({ className, disabled, children, ...props }, ref) => {
    if (disabled) {
      return <span className={cn("block truncate", className)}>{children}</span>;
    }
    return (
      <a ref={ref} data-row-link className={cn(rowLinkClassName, className)} {...props}>
        {children}
      </a>
    );
  }
);

RowLinkAnchor.displayName = "RowLinkAnchor";

const RowLink = createLink(RowLinkAnchor);

export { RowLink, rowLinkClassName, rowLinkContainerClassName };
