import * as React from "react";
import { createLink } from "@tanstack/react-router";

import { cn } from "../lib/utils";

import styles from "./row-link.module.css";

function RowLinkAnchor({
  className,
  disabled,
  title,
  children,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"a"> & {
  disabled?: boolean;
  ref?: React.Ref<HTMLAnchorElement>;
}) {
  if (disabled)
    return (
      <span
        role="link"
        aria-disabled="true"
        title={title}
        data-slot="row-link"
        data-disabled=""
        className={cn(styles.rowLink, className)}
      >
        {children}
      </span>
    );
  return (
    <a
      ref={ref}
      title={title}
      data-slot="row-link"
      data-row-link=""
      className={cn(styles.rowLink, styles.stretched, className)}
      {...props}
    >
      {children}
    </a>
  );
}

const RowLink = createLink(RowLinkAnchor);

export { RowLink };
