import * as React from "react";
import { Slot } from "radix-ui";

import { CipherLink, type CipherLinkTarget } from "../lib/link";
import { useControllableState } from "../lib/use-controllable-state";
import { cn } from "../lib/utils";
import { Icon } from "./icon";
import { Switcher, type SwitcherProps } from "./switcher";

import breadcrumbStyles from "./breadcrumb.module.css";

export type BreadcrumbSwitcher = Omit<SwitcherProps, "trigger" | "anchor">;

export type BreadcrumbCrumb = {
  label: React.ReactNode;
  link?: CipherLinkTarget;
  href?: string;
  onNavigate?: React.MouseEventHandler<HTMLElement>;
  mono?: boolean;
  media?: React.ReactNode;
  switcher?: BreadcrumbSwitcher;
};

const hasPage = (crumb: BreadcrumbCrumb) => Boolean(crumb.link || crumb.href || crumb.onNavigate);

const CrumbName = ({
  crumb,
  className,
  labelId,
  children
}: {
  crumb: BreadcrumbCrumb;
  className: string;
  labelId: string;
  children: React.ReactNode;
}) => {
  if (crumb.link)
    return (
      <CipherLink
        link={crumb.link}
        onClick={crumb.onNavigate}
        data-slot="breadcrumb-name"
        className={className}
        aria-labelledby={labelId}
      >
        {children}
      </CipherLink>
    );
  if (crumb.href)
    return (
      <a
        href={crumb.href}
        onClick={crumb.onNavigate}
        data-slot="breadcrumb-name"
        className={className}
        aria-labelledby={labelId}
      >
        {children}
      </a>
    );
  return (
    <button
      type="button"
      onClick={crumb.onNavigate}
      data-slot="breadcrumb-name"
      className={className}
      aria-labelledby={labelId}
    >
      {children}
    </button>
  );
};

function BandDivider({ className }: { className?: string }) {
  return (
    <span
      data-slot="band-divider"
      className={cn(breadcrumbStyles.separator, className)}
      aria-hidden="true"
    />
  );
}
BandDivider.displayName = "BandDivider";

const SwitcherCrumb = ({
  crumb,
  current,
  labelId,
  purposeId
}: {
  crumb: BreadcrumbCrumb & { switcher: BreadcrumbSwitcher };
  current: boolean;
  labelId: string;
  purposeId: string;
}) => {
  const { switcher } = crumb;
  const [open, setOpen] = useControllableState({
    value: switcher.open,
    defaultValue: switcher.defaultOpen ?? false,
    onChange: switcher.onOpenChange
  });
  const navigates = !current && hasPage(crumb);
  const media = crumb.media && (
    <span className={breadcrumbStyles.media} aria-hidden="true">
      {crumb.media}
    </span>
  );
  const label = (
    <span
      id={labelId}
      className={cn(breadcrumbStyles.label, crumb.mono && breadcrumbStyles.mono)}
      title={typeof crumb.label === "string" ? crumb.label : undefined}
    >
      {crumb.label}
    </span>
  );
  const purpose = (
    <span id={purposeId} className="sr-only">
      {switcher.label}
    </span>
  );
  if (!navigates)
    return (
      <Switcher
        {...switcher}
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button
            type="button"
            data-slot="breadcrumb-switcher"
            data-name-target="switcher"
            className={breadcrumbStyles.segment}
            aria-current={current ? "page" : undefined}
            aria-labelledby={`${purposeId} ${labelId}`}
          >
            {purpose}
            {media}
            {label}
            <span className={breadcrumbStyles.chevron} aria-hidden="true">
              <Icon name="chev-ud" size={14} />
            </span>
          </button>
        }
      />
    );
  return (
    <Switcher
      {...switcher}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button
          type="button"
          data-slot="breadcrumb-switcher"
          className={breadcrumbStyles.chevron}
          aria-labelledby={`${purposeId} ${labelId}`}
        >
          {purpose}
          <Icon name="chev-ud" size={14} />
        </button>
      }
      anchor={(trigger) => (
        <span className={breadcrumbStyles.segment} data-name-target="page">
          <CrumbName crumb={crumb} className={breadcrumbStyles.name} labelId={labelId}>
            {media}
            {label}
          </CrumbName>
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
function Breadcrumb({
  className,
  items,
  variant = "default",
  maxItems,
  lastIsCurrent = true,
  children,
  ref,
  ...props
}: BreadcrumbProps & { ref?: React.Ref<HTMLElement> }) {
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
        data-switcher={Boolean(crumb.switcher) || undefined}
        data-media={Boolean(crumb.media) || undefined}
      >
        {index > 0 && <BandDivider />}
        {crumb.switcher ? (
          <SwitcherCrumb
            crumb={{ ...crumb, switcher: crumb.switcher }}
            current={last}
            labelId={`${nameId}-${index}-label`}
            purposeId={`${nameId}-${index}-purpose`}
          />
        ) : last ? (
          <span
            aria-current="page"
            className={cn(breadcrumbStyles.link, breadcrumbStyles.current, breadcrumbStyles.static)}
          >
            {content}
          </span>
        ) : hasPage(crumb) ? (
          <CrumbName
            crumb={crumb}
            className={breadcrumbStyles.link}
            labelId={`${nameId}-${index}-label`}
          >
            {content}
          </CrumbName>
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
          className={cn(breadcrumbStyles.trail, variant === "product" && breadcrumbStyles.product)}
        >
          {items.map((crumb, index) => {
            if (collapsible && index === 1)
              return (
                <React.Fragment key="middle">
                  <li className={breadcrumbStyles.entry}>
                    <BandDivider />
                    <button
                      type="button"
                      className={breadcrumbStyles.link}
                      aria-label={
                        expanded ? "Hide middle levels" : `Show ${items.length - 2} middle levels`
                      }
                      aria-expanded={expanded}
                      onClick={() => setExpanded(!expanded)}
                    >
                      <Icon name="more" className="size-4" />
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
Breadcrumb.displayName = "Breadcrumb";

function BreadcrumbList({ className, ref, ...props }: React.ComponentProps<"ol">) {
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
}
BreadcrumbList.displayName = "BreadcrumbList";

function BreadcrumbItem({ className, ref, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      ref={ref}
      data-slot="breadcrumb-item"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  );
}
BreadcrumbItem.displayName = "BreadcrumbItem";

function BreadcrumbLink({
  asChild,
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"a"> & {
  asChild?: boolean;
} & { ref?: React.Ref<React.ComponentRef<"a">> }) {
  const Comp = asChild ? Slot.Root : "a";

  return (
    <Comp
      ref={ref}
      data-slot="breadcrumb-link"
      className={cn("transition-colors hover:text-foreground", className)}
      {...props}
    />
  );
}
BreadcrumbLink.displayName = "BreadcrumbLink";

function BreadcrumbPage({ className, ref, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      ref={ref}
      data-slot="breadcrumb-page"
      aria-current="page"
      className={cn("font-normal text-foreground", className)}
      {...props}
    />
  );
}
BreadcrumbPage.displayName = "BreadcrumbPage";

function BreadcrumbSeparator({ children, className, ref, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      ref={ref}
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("[&>svg]:size-3.5", className)}
      {...props}
    >
      {children ?? <BandDivider />}
    </li>
  );
}
BreadcrumbSeparator.displayName = "BreadcrumbSeparator";

function BreadcrumbEllipsis({ className, ref, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      ref={ref}
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn("flex size-5 items-center justify-center [&>svg]:size-4", className)}
      {...props}
    >
      <Icon name="more" />
      <span className="sr-only">More</span>
    </span>
  );
}
BreadcrumbEllipsis.displayName = "BreadcrumbEllipsis";

export {
  BandDivider,
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
};
