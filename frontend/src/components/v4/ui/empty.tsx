import * as React from "react";

import { cn } from "../lib/utils";
import { Icon, type IconName } from "./icon";

import controlStyles from "./controls.module.css";
import styles from "./empty.module.css";

type EmptySize = "default" | "sm";

function Empty({
  className,
  size = "default",
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { size?: EmptySize } & {
  ref?: React.Ref<React.ComponentRef<"div">>;
}) {
  return (
    <div
      ref={ref}
      data-slot="empty"
      data-size={size}
      className={cn(styles.root, className)}
      {...props}
    />
  );
}
Empty.displayName = "Empty";

function EmptyHeader({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div ref={ref} data-slot="empty-header" className={cn(styles.header, className)} {...props} />
  );
}
EmptyHeader.displayName = "EmptyHeader";

export type EmptyMediaVariant = "tile" | "bare";

function EmptyMedia({
  className,
  variant = "tile",
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { variant?: EmptyMediaVariant } & {
  ref?: React.Ref<React.ComponentRef<"div">>;
}) {
  return (
    <div
      ref={ref}
      data-slot="empty-media"
      data-variant={variant}
      className={cn(styles.media, className)}
      {...props}
    />
  );
}
EmptyMedia.displayName = "EmptyMedia";

function EmptyTitle({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      data-slot="empty-title"
      className={cn(controlStyles.sectionTitle, styles.title, className)}
      {...props}
    />
  );
}
EmptyTitle.displayName = "EmptyTitle";

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <div
      data-slot="empty-description"
      className={cn(controlStyles.supporting, styles.description, className)}
      {...props}
    />
  );
}

function EmptyContent({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div ref={ref} data-slot="empty-content" className={cn(styles.content, className)} {...props} />
  );
}
EmptyContent.displayName = "EmptyContent";

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle };

export const EmptyState = ({
  title,
  description,
  actions,
  icon = "inbox",
  media = "tile",
  size = "default"
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  icon?: IconName;
  media?: EmptyMediaVariant;
  size?: EmptySize;
}) => (
  <Empty size={size}>
    <EmptyMedia variant={media}>
      <Icon name={icon} />
    </EmptyMedia>
    <EmptyHeader>
      <EmptyTitle>{title}</EmptyTitle>
      {description && <EmptyDescription>{description}</EmptyDescription>}
    </EmptyHeader>
    {actions && <EmptyContent>{actions}</EmptyContent>}
  </Empty>
);
