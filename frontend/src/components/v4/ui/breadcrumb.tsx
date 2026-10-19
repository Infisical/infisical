import * as React from "react";
import { cn } from "cn";
import { ChevronRightIcon, MoreHorizontalIcon } from "lucide-react";
import { Slot } from "radix-ui";

import { Switcher, type SwitcherProps } from "./switcher";

import breadcrumbStyles from "./breadcrumb.module.css";

export type BreadcrumbCrumb = {
  label: React.ReactNode;
  href?: string;
  onClick?: React.MouseEventHandler<HTMLElement>;
  mono?: boolean;
  media?: React.ReactNode;
  menu?: Omit<SwitcherProps, "trigger">;
};
export type BreadcrumbProps = React.ComponentPropsWithoutRef<"nav"> & {
  items?: readonly BreadcrumbCrumb[];
  variant?: "default" | "product";
  maxItems?: number;
};
const Breadcrumb = React.forwardRef<HTMLElement, BreadcrumbProps>(
  ({ className, items, variant = "default", maxItems, children, ...props }, ref) => {
    const [expanded, setExpanded] = React.useState(false);
    const nameId = React.useId();
    const collapsible = Boolean(
      items && maxItems !== undefined && items.length > Math.max(3, maxItems)
    );
    const renderCrumb = (crumb: BreadcrumbCrumb, index: number) => {
      const last = index === (items?.length ?? 0) - 1;
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
          {crumb.menu && <ChevronRightIcon className="size-3 rotate-90" aria-hidden="true" />}
        </>
      );
      const trigger = (
        <button
          type="button"
          className={breadcrumbStyles.link}
          aria-label={crumb.menu?.label}
          aria-labelledby={
            crumb.menu ? `${nameId}-${index}-purpose ${nameId}-${index}-label` : undefined
          }
        >
          {crumb.menu && (
            <span id={`${nameId}-${index}-purpose`} className="sr-only">
              {crumb.menu.label}
            </span>
          )}
          {content}
        </button>
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
            <Switcher {...crumb.menu} trigger={trigger} />
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
