import * as React from "react";
import { Avatar as AvatarPrimitive } from "radix-ui";

import { cn } from "../lib/utils";
import { Icon } from "./icon";

import helperStyles from "./helpers.module.css";

function Avatar({
  className,
  size = "default",
  name,
  initials,
  label,
  kind = "person",
  status,
  ring,
  children,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> & {
  size?: "default" | "sm" | "lg" | number;
  name?: string;
  initials?: string;
  label?: string;
  status?: "ok" | "warn" | "off";
  ring?: boolean;
  kind?: "person" | "machine" | "agent" | "fallback";
} & { ref?: React.Ref<React.ComponentRef<typeof AvatarPrimitive.Root>> }) {
  if (!["person", "machine", "agent", "fallback"].includes(kind)) return null;
  const dimension =
    typeof size === "number" && Number.isFinite(size) && size > 0
      ? size
      : size === "sm"
        ? 24
        : size === "lg"
          ? 40
          : 32;
  return (
    <AvatarPrimitive.Root
      ref={ref}
      data-slot="avatar"
      data-kind={kind}
      data-size={typeof size === "number" ? undefined : size}
      role={name || label ? "img" : undefined}
      aria-label={label ?? name}
      style={{
        width: dimension,
        height: dimension,
        fontSize: dimension <= 24 ? 10 : dimension <= 32 ? 12 : Math.round(dimension * 0.35),
        ...props.style
      }}
      className={cn(
        "group/avatar relative flex shrink-0 select-none",
        helperStyles.avatarShape,
        ring && helperStyles.avatarRing,
        className
      )}
      {...props}
    >
      {children ?? (
        <AvatarFallback>
          {kind === "machine" || kind === "agent" || kind === "fallback" ? (
            <Icon name={kind === "machine" ? "machine" : kind === "agent" ? "agent" : "user"} />
          ) : (
            (initials ??
            name
              ?.trim()
              .split(/[\s._-]+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase() ??
            "?")
          )}
        </AvatarFallback>
      )}
      {status && (
        <span aria-hidden="true" data-status={status} className={helperStyles.avatarStatus} />
      )}
    </AvatarPrimitive.Root>
  );
}
Avatar.displayName = "Avatar";

function AvatarImage({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      ref={ref}
      data-slot="avatar-image"
      className={cn("aspect-square size-full object-cover", className)}
      {...props}
    />
  );
}
AvatarImage.displayName = "AvatarImage";

function AvatarFallback({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      ref={ref}
      data-slot="avatar-fallback"
      className={cn(
        helperStyles.avatarFallback,
        "flex size-full items-center justify-center",
        className
      )}
      {...props}
    />
  );
}
AvatarFallback.displayName = "AvatarFallback";

function AvatarBadge({ className, ref, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      ref={ref}
      data-slot="avatar-badge"
      className={cn(
        "text-primary-foreground absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary bg-blend-color ring-2 ring-background select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        className
      )}
      {...props}
    />
  );
}
AvatarBadge.displayName = "AvatarBadge";

function AvatarGroup({
  className,
  children,
  max,
  size = 32,
  label,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { max?: number; size?: number; label?: string } & {
  ref?: React.Ref<HTMLDivElement>;
}) {
  const all = React.Children.toArray(children);
  const limit = max === undefined ? all.length : Math.max(0, Math.floor(max));
  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      data-slot="avatar-group"
      className={cn(helperStyles.avatarGroup, className)}
      {...props}
    >
      {all
        .slice(0, limit)
        .map((child) =>
          React.isValidElement<{ size?: number | "sm" | "lg" | "default"; ring?: boolean }>(
            child
          ) && child.type === Avatar
            ? React.cloneElement(child, { size: child.props.size ?? size, ring: true })
            : child
        )}
      {all.length > limit && (
        <Avatar
          size={size}
          initials={`+${all.length - limit}`}
          label={`${all.length - limit} more`}
          ring
        />
      )}
    </div>
  );
}
AvatarGroup.displayName = "AvatarGroup";

function AvatarGroupCount({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      data-slot="avatar-group-count"
      className={cn(
        "relative flex size-8 shrink-0 items-center justify-center group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4",
        helperStyles.avatarCount,
        className
      )}
      {...props}
    />
  );
}
AvatarGroupCount.displayName = "AvatarGroupCount";

export { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage };

export const Identity = ({
  name,
  description,
  mono = false,
  media,
  title,
  kind = "person",
  className
}: {
  name: string;
  description?: string;
  mono?: boolean;
  media?: React.ReactNode;
  title?: React.ReactNode;
  kind?: "person" | "machine" | "agent" | "fallback";
  className?: string;
}) => (
  <div data-slot="identity" className={cn(helperStyles.identity, className)}>
    {media ?? <Avatar name={name} kind={kind} />}
    <div className={helperStyles.identityText}>
      <span className={cn(helperStyles.identityTitle, mono && helperStyles.mono)}>
        {title ?? name}
      </span>
      {description && <span className={helperStyles.identityDescription}>{description}</span>}
    </div>
  </div>
);
