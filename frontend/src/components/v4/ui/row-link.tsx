import * as React from "react";
import { createLink } from "@tanstack/react-router";

import { cn } from "../lib/utils";
import { Icon } from "./icon";

import styles from "./row-link.module.css";

function RowLinkAnchor({
  className,
  disabled,
  chevron = true,
  title,
  children,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"a"> & {
  disabled?: boolean;
  chevron?: boolean;
  ref?: React.Ref<HTMLAnchorElement>;
}) {
  const content = chevron ? (
    <>
      <span className={styles.label}>{children}</span>
      <Icon name="chev-right" className={styles.chevron} data-row-link-chevron="" />
    </>
  ) : (
    children
  );
  if (disabled)
    return (
      <span
        role="link"
        aria-disabled="true"
        title={title}
        data-slot="row-link"
        data-disabled=""
        data-chevron={chevron || undefined}
        className={cn(styles.rowLink, className)}
      >
        {content}
      </span>
    );
  return (
    <a
      ref={ref}
      title={title}
      data-slot="row-link"
      data-row-link=""
      data-chevron={chevron || undefined}
      className={cn(styles.rowLink, styles.stretched, className)}
      {...props}
    >
      {content}
    </a>
  );
}

const RowLink = createLink(RowLinkAnchor);

export { RowLink };
