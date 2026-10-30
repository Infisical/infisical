import * as React from "react";

import { cn } from "../lib/utils";

import styles from "./detail.module.css";

function Detail({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"dl"> & { ref?: React.Ref<HTMLDListElement> }) {
  return <dl ref={ref} data-slot="detail" className={cn(styles.detail, className)} {...props} />;
}

function DetailLabel({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"dt"> & { ref?: React.Ref<HTMLElement> }) {
  return (
    <dt ref={ref} data-slot="detail-label" className={cn(styles.label, className)} {...props} />
  );
}

function DetailValue({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"dd"> & { ref?: React.Ref<HTMLElement> }) {
  return (
    <dd ref={ref} data-slot="detail-value" className={cn(styles.value, className)} {...props} />
  );
}

function DetailGroup({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} data-slot="detail-group" className={cn(styles.group, className)} {...props} />
  );
}

function DetailGroupHeader({
  className,
  level = 3,
  action,
  children,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  level?: 2 | 3 | 4 | 5 | 6;
  action?: React.ReactNode;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const Heading = `h${level}` as const;
  return (
    <div
      ref={ref}
      data-slot="detail-group-header"
      className={cn(styles.header, className)}
      {...props}
    >
      <Heading className={styles.title}>{children}</Heading>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

export { Detail, DetailGroup, DetailGroupHeader, DetailLabel, DetailValue };
