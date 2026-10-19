import * as React from "react";
import { ChevronRightIcon, MoreHorizontalIcon } from "lucide-react";
import { Slot } from "radix-ui";

import { useControllableState } from "../lib/use-controllable-state";
import { cn } from "../lib/utils";
import { Icon } from "./icon";
import { Switcher, type SwitcherProps } from "./switcher";

import breadcrumbStyles from "./breadcrumb.module.css";

export type BreadcrumbCrumb = {
  label: React.ReactNode;
  href?: string;
  onClick?: React.MouseEventHandler<HTMLElement>;
  mono?: boolean;
  media?: React.ReactNode;
  menu?: Omit<SwitcherProps, "trigger" | "anchor">;
};

const MenuCrumb = ({
  crumb,
  labelId,
  purposeId
}: {
  crumb: BreadcrumbCrumb & { menu: NonNullable<BreadcrumbCrumb["menu"]> };
  labelId: string;
  purposeId: string;
}) => {
  const { menu } = crumb;
  const [open, setOpen] = useControllableState({
    value: menu.open,
    defaultValue: menu.defaultOpen ?? false,
    onChange: menu.onOpenChange
  });
  const openAtPress = React.useRef(false);
  return (
    <Switcher
      {...menu}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          data-slot="breadcrumb-switcher"
          className={breadcrumbStyles.chevron}
          aria-label={menu.label}
          aria-labelledby={`${purposeId} ${labelId}`}
        >
          <span id={purposeId} className="sr-only">
            {menu.label}
          </span>
          <span id={labelId} className="sr-only">
            {crumb.label}
          </span>
          <Icon name="chev-ud" size={14} />
        </button>
      }
      anchor={(trigger) => (
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Pointer convenience; the chevron button is the keyboard trigger for the same popover.
        <span
          className={breadcrumbStyles.segment}
          onPointerDown={() => {
            openAtPress.current = open;
          }}
          onClick={(event) => {
            if ((event.target as Element).closest("button")) return;
            setOpen(!openAtPress.current);
          }}
        >
          {crumb.media && (
            <span className={breadcrumbStyles.media} aria-hidden="true">
              {crumb.media}
            </span>
          )}
          <span
            aria-hidden="true"
            className={cn(breadcrumbStyles.label, crumb.mono && breadcrumbStyles.mono)}
            title={typeof crumb.label === "string" ? crumb.label : undefined}
          >
            {crumb.label}
          </span>
          {trigger}
        </span>
      )}
    />
  );
};
export type BreadcrumbProps = React.ComponentPropsWithoutRef<"nav"> & {
  items?: readonly BreadcrumbCrumb[];
  variant?: "default" | "product";
  maxItems?: number;
  lastIsCurrent?: boolean;
};
const Breadcrumb = React.forwardRef<HTMLElement, BreadcrumbProps>(
  (
    { className, items, variant = "default", maxItems, lastIsCurrent = true, children, ...props },
    ref
  ) => {
    const [expanded, setExpanded] = React.useState(false);
    const nameId = React.useId();
    const collapsible = Boolean(
      items && maxItems !== undefined && items.length > Math.max(3, maxItems)
    );
    const renderCrumb = (crumb: BreadcrumbCrumb, index: number) => {
      const last = lastIsCurrent && index === (items?.length ?? 0) - 1;
      const content = (
        <>
          {crumb.media && <span className={breadcrumbStyles.media}>{crumb.media}</span>}
          <span
            id={`${nameId}-${index}-label`}
            className={cn(breadcrumbStyles.label, crumb.mono && breadcrumbStyles.mono)}
            title={typeof crumb.label === "string" ? crumb.label : undefined}
          >
            {crumb.label}
          </span>
        </>
      );
      return (
        <li
          key={index}
          className={breadcrumbStyles.entry}
          data-current={last || undefined}
          data-menu={Boolean(crumb.menu) || undefined}
          data-media={Boolean(crumb.media) || undefined}
        >
          {index > 0 && (
            <span className={breadcrumbStyles.separator} aria-hidden="true">
              /
            </span>
          )}
          {crumb.menu ? (
            <MenuCrumb
              crumb={{ ...crumb, menu: crumb.menu }}
              labelId={`${nameId}-${index}-label`}
              purposeId={`${nameId}-${index}-purpose`}
            />
          ) : last ? (
            <span
              aria-current="page"
              className={cn(
                breadcrumbStyles.link,
                breadcrumbStyles.current,
                breadcrumbStyles.static
              )}
            >
              {content}
            </span>
          ) : crumb.href ? (
            <a
              href={crumb.href}
              onClick={crumb.onClick}
              className={breadcrumbStyles.link}
              aria-labelledby={`${nameId}-${index}-label`}
            >
              {content}
            </a>
          ) : crumb.onClick ? (
            <button
              type="button"
              onClick={crumb.onClick}
              className={breadcrumbStyles.link}
              aria-labelledby={`${nameId}-${index}-label`}
            >
              {content}
            </button>
          ) : (
            <span className={cn(breadcrumbStyles.link, breadcrumbStyles.static)}>{content}</span>
          )}
        </li>
      );
    };
    return (
      <nav
        ref={ref}
        aria-label="Breadcrumb"
        data-slot="breadcrumb"
        data-variant={variant}
        className={cn(breadcrumbStyles.root, className)}
        {...props}
      >
        {items ? (
          <ol
            className={cn(
              breadcrumbStyles.trail,
              variant === "product" && breadcrumbStyles.product
            )}
          >
            {items.map((crumb, index) => {
              if (collapsible && index === 1)
                return (
                  <React.Fragment key="middle">
                    <li className={breadcrumbStyles.entry}>
                      <span className={breadcrumbStyles.separator} aria-hidden="true">
                        /
                      </span>
                      <button
                        type="button"
                        className={breadcrumbStyles.link}
                        aria-label={
                          expanded ? "Hide middle levels" : `Show ${items.length - 2} middle levels`
                        }
                        aria-expanded={expanded}
                        onClick={() => setExpanded(!expanded)}
                      >
                        <MoreHorizontalIcon className="size-4" />
                      </button>
                    </li>
                    {expanded && renderCrumb(crumb, index)}
                  </React.Fragment>
                );
              if (collapsible && index > 1 && index < items.length - 1 && !expanded) return null;
              return renderCrumb(crumb, index);
            })}
          </ol>
        ) : (
          children
        )}
      </nav>
    );
  }
);
Breadcrumb.displayName = "Breadcrumb";

const BreadcrumbList = React.forwardRef<
  React.ComponentRef<"ol">,
  React.ComponentPropsWithoutRef<"ol">
>(({ className, ...props }, ref) => {
  return (
    <ol
      ref={ref}
      data-slot="breadcrumb-list"
      className={cn(
        "text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm wrap-break-word",
        className
      )}
      {...props}
    />
  );
});
BreadcrumbList.displayName = "BreadcrumbList";

const BreadcrumbItem = React.forwardRef<
  React.ComponentRef<"li">,
  React.ComponentPropsWithoutRef<"li">
>(({ className, ...props }, ref) => {
  return (
    <li
      ref={ref}
      data-slot="breadcrumb-item"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  );
});
BreadcrumbItem.displayName = "BreadcrumbItem";

const BreadcrumbLink = React.forwardRef<
  React.ComponentRef<"a">,
  React.ComponentPropsWithoutRef<"a"> & {
    asChild?: boolean;
  }
>(({ asChild, className, ...props }, ref) => {
  const Comp = asChild ? Slot.Root : "a";

  return (
    <Comp
      ref={ref}
      data-slot="breadcrumb-link"
      className={cn("transition-colors hover:text-foreground", className)}
      {...props}
    />
  );
});
BreadcrumbLink.displayName = "BreadcrumbLink";

const BreadcrumbPage = React.forwardRef<
  React.ComponentRef<"span">,
  React.ComponentPropsWithoutRef<"span">
>(({ className, ...props }, ref) => {
  return (
    <span
      ref={ref}
      data-slot="breadcrumb-page"
      aria-current="page"
      className={cn("font-normal text-foreground", className)}
      {...props}
    />
  );
});
BreadcrumbPage.displayName = "BreadcrumbPage";

const BreadcrumbSeparator = React.forwardRef<
  React.ComponentRef<"li">,
  React.ComponentPropsWithoutRef<"li">
>(({ children, className, ...props }, ref) => {
  return (
    <li
      ref={ref}
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("[&>svg]:size-3.5", className)}
      {...props}
    >
      {children ?? <ChevronRightIcon />}
    </li>
  );
});
BreadcrumbSeparator.displayName = "BreadcrumbSeparator";

const BreadcrumbEllipsis = React.forwardRef<
  React.ComponentRef<"span">,
  React.ComponentPropsWithoutRef<"span">
>(({ className, ...props }, ref) => {
  return (
    <span
      ref={ref}
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn("flex size-5 items-center justify-center [&>svg]:size-4", className)}
      {...props}
    >
      <MoreHorizontalIcon />
      <span className="sr-only">More</span>
    </span>
  );
});
BreadcrumbEllipsis.displayName = "BreadcrumbEllipsis";

export {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
};
