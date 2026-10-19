import * as React from "react";

import { cn } from "../lib/utils";
import { Breadcrumb, type BreadcrumbCrumb } from "./breadcrumb";

import styles from "./page-header.module.css";

export type PageHeaderProps = Omit<React.ComponentPropsWithoutRef<"header">, "title"> & {
  title: React.ReactNode;
  size?: "lg" | "md";
  mono?: boolean;
  breadcrumb?: readonly BreadcrumbCrumb[];
  maxItems?: number;
  badges?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  media?: React.ReactNode;
};

export const PageHeader = React.forwardRef<HTMLElement, PageHeaderProps>(
  (
    {
      title,
      size = "lg",
      mono = false,
      breadcrumb,
      maxItems,
      badges,
      description,
      actions,
      tabs,
      media,
      className,
      ...props
    },
    ref
  ) => (
    <header
      ref={ref}
      data-slot="page-header"
      data-size={size}
      className={cn(styles.header, className)}
      {...props}
    >
      {breadcrumb && breadcrumb.length > 0 && (
        <Breadcrumb
          aria-label="Page path"
          items={breadcrumb}
          maxItems={maxItems}
          lastIsCurrent={false}
          className={styles.trail}
        />
      )}
      <div className={styles.main}>
        {media && <span className={styles.media}>{media}</span>}
        <div className={styles.copy}>
          <div className={styles.titleLine}>
            <h1 className={cn(styles.title, mono && styles.mono)}>{title}</h1>
            {badges && <span className={styles.badges}>{badges}</span>}
          </div>
          {description && <p className={styles.description}>{description}</p>}
        </div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {tabs && <div className={styles.tabs}>{tabs}</div>}
    </header>
  )
);
PageHeader.displayName = "PageHeader";
