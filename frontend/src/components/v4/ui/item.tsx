import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { Separator } from "@app/components/v4/ui/separator";

import { cn } from "../lib/utils";
import { Icon, type IconName } from "./icon";

import controlStyles from "./controls.module.css";
import helperStyles from "./helpers.module.css";
import itemStyles from "./item.module.css";

const ItemGroupContext = React.createContext(false);

const ItemGroup = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  return (
    <ItemGroupContext.Provider value>
      <div
        ref={ref}
        role="list"
        data-slot="item-group"
        className={cn(
          "group/item-group flex w-full flex-col gap-4 has-data-[size=sm]:gap-2.5 has-data-[size=xs]:gap-2",
          className
        )}
        {...props}
      />
    </ItemGroupContext.Provider>
  );
});
ItemGroup.displayName = "ItemGroup";

const ItemSeparator = React.forwardRef<
  React.ComponentRef<typeof Separator>,
  React.ComponentPropsWithoutRef<typeof Separator>
>(({ className, ...props }, ref) => {
  return (
    <Separator
      ref={ref}
      data-slot="item-separator"
      orientation="horizontal"
      className={cn("my-2", className)}
      {...props}
    />
  );
});
ItemSeparator.displayName = "ItemSeparator";

const itemVariants = cva(
  [
    controlStyles.focusOutline,
    "group/item flex w-full flex-wrap rounded-lg text-sm transition-colors duration-(--v4-duration-fast) [a]:transition-colors [a]:hover:bg-muted"
  ],
  {
    variants: {
      variant: {
        default: "border border-transparent",
        outline: "border border-[color:var(--v4-line)]",
        muted: "border border-transparent bg-muted/50"
      },
      size: {
        default: "gap-2.5 px-3 py-2.5",
        md: "gap-2.5 px-3 py-2.5",
        sm: "gap-2.5 px-3 py-2.5",
        xs: "gap-2 px-3 py-2 in-data-[slot=dropdown-menu-content]:p-0"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export type ItemProps = Omit<React.ComponentPropsWithoutRef<"div">, "title"> &
  VariantProps<typeof itemVariants> & {
    asChild?: boolean;
    title?: React.ReactNode;
    description?: React.ReactNode;
    icon?: IconName;
    media?: React.ReactNode;
    badge?: React.ReactNode;
    meta?: React.ReactNode;
    error?: React.ReactNode;
    actions?: React.ReactNode;
    actionsPlacement?: "end" | "below";
    unread?: boolean;
    resolved?: boolean;
    truncate?: boolean;
    mono?: boolean;
  };
const Item = React.forwardRef<HTMLDivElement, ItemProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      asChild = false,
      title,
      description,
      icon,
      media,
      badge,
      meta,
      error,
      actions,
      actionsPlacement = "end",
      unread,
      resolved,
      truncate = true,
      mono = false,
      children,
      ...props
    },
    ref
  ) => {
    const inList = React.useContext(ItemGroupContext);
    const Comp = asChild ? Slot.Root : "div";
    const composed = title !== undefined || media || icon || description || actions;
    const body = composed ? (
      <>
        {unread && (
          <>
            <span className={itemStyles.unread} aria-hidden="true" />
            <span className="sr-only">Unread</span>
          </>
        )}
        {(media || icon) && (
          <span className={itemStyles.lead}>
            {media ?? <Media icon={icon} size={size === "sm" ? "sm" : "md"} />}
          </span>
        )}
        <div className={itemStyles.main}>
          <div className={itemStyles.copy}>
            <div className={itemStyles.titleLine}>
              <span
                className={cn(itemStyles.title, mono && itemStyles.mono)}
                title={typeof title === "string" ? title : undefined}
              >
                {title}
              </span>
              {badge}
            </div>
            {description && (
              <div
                className={itemStyles.description}
                title={typeof description === "string" ? description : undefined}
              >
                {description}
              </div>
            )}
            {error && (
              <div className={itemStyles.error}>
                <Icon name="alert" size={14} />
                {error}
              </div>
            )}
            {children && !asChild && <div className={itemStyles.body}>{children}</div>}
          </div>
          {(actions || meta) && (
            <div
              className={cn(
                itemStyles.actions,
                actionsPlacement === "below" && size !== "sm" && itemStyles.below
              )}
            >
              {meta && (
                <span className={cn(itemStyles.meta, typeof meta === "string" && itemStyles.mono)}>
                  {meta}
                </span>
              )}
              {actions}
            </div>
          )}
        </div>
      </>
    ) : (
      children
    );
    const content =
      composed && asChild && React.isValidElement<{ children?: React.ReactNode }>(children)
        ? React.cloneElement(children, undefined, body)
        : body;
    const item = (
      <Comp
        ref={ref}
        role={inList && !asChild ? "listitem" : undefined}
        data-slot="item"
        data-variant={variant}
        data-size={size}
        data-unread={unread || undefined}
        data-resolved={resolved || undefined}
        className={cn(
          itemVariants({ variant, size }),
          composed ? itemStyles.layout : "items-center",
          !truncate && itemStyles.wrap,
          className
        )}
        {...props}
      >
        {content}
      </Comp>
    );
    return inList && asChild ? <div role="listitem">{item}</div> : item;
  }
);
Item.displayName = "Item";

const itemMediaVariants = cva(
  "flex shrink-0 items-center justify-center gap-2 group-has-data-[slot=item-description]/item:translate-y-0.5 group-has-data-[slot=item-description]/item:self-start [&_svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "[&_svg:not([class*='size-'])]:size-4",
        image:
          "size-10 overflow-hidden rounded-sm group-data-[size=sm]/item:size-8 group-data-[size=xs]/item:size-6 [&_img]:size-full [&_img]:object-cover"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

const ItemMedia = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div"> & VariantProps<typeof itemMediaVariants>
>(({ className, variant = "default", ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="item-media"
      data-variant={variant}
      className={cn(itemMediaVariants({ variant, className }))}
      {...props}
    />
  );
});
ItemMedia.displayName = "ItemMedia";

const ItemContent = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="item-content"
      className={cn(
        "flex flex-1 flex-col gap-1 group-data-[size=xs]/item:gap-0 [&+[data-slot=item-content]]:flex-none",
        className
      )}
      {...props}
    />
  );
});
ItemContent.displayName = "ItemContent";

const ItemTitle = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="item-title"
      className={cn(
        itemStyles.title,
        "line-clamp-1 flex w-fit items-center gap-2 underline-offset-4",
        className
      )}
      {...props}
    />
  );
});
ItemTitle.displayName = "ItemTitle";

const ItemDescription = React.forwardRef<
  React.ComponentRef<"p">,
  React.ComponentPropsWithoutRef<"p">
>(({ className, ...props }, ref) => {
  return (
    <p
      ref={ref}
      data-slot="item-description"
      className={cn(
        itemStyles.partDescription,
        "text-muted-foreground line-clamp-2 text-left [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className
      )}
      {...props}
    />
  );
});
ItemDescription.displayName = "ItemDescription";

const ItemActions = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="item-actions"
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  );
});
ItemActions.displayName = "ItemActions";

const ItemHeader = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="item-header"
      className={cn("flex basis-full items-center justify-between gap-2", className)}
      {...props}
    />
  );
});
ItemHeader.displayName = "ItemHeader";

const ItemFooter = React.forwardRef<
  React.ComponentRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="item-footer"
      className={cn("flex basis-full items-center justify-between gap-2", className)}
      {...props}
    />
  );
});
ItemFooter.displayName = "ItemFooter";

export {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
  ItemMedia,
  ItemSeparator,
  ItemTitle
};

export const Media = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<"span"> & {
    icon?: IconName;
    size?: "sm" | "md" | number;
    tone?: "ok" | "warn" | "bad" | "info";
  }
>(({ icon, size = "md", tone, children, className, style, ...props }, ref) => (
  <span
    ref={ref}
    data-slot="media"
    data-size={typeof size === "number" ? undefined : size}
    data-tone={tone}
    className={cn(
      helperStyles.media,
      itemStyles.media,
      size === "sm" && helperStyles.mediaSmall,
      className
    )}
    style={{ ...(typeof size === "number" ? { width: size, height: size } : {}), ...style }}
    {...props}
  >
    {icon ? (
      <Icon
        name={icon}
        size={size === "sm" || (typeof size === "number" && size <= 28) ? 14 : 18}
      />
    ) : (
      children
    )}
  </span>
));
Media.displayName = "Media";
export const Tile = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentPropsWithoutRef<"button">, "title"> & {
    selected?: boolean;
    title?: React.ReactNode;
    description?: React.ReactNode;
    media?: React.ReactNode;
  }
>(
  (
    { selected, title, description, media, children, className, type = "button", ...props },
    ref
  ) => (
    <button
      ref={ref}
      type={type}
      data-slot="tile"
      aria-pressed={selected}
      className={cn(helperStyles.tile, className)}
      {...props}
    >
      {media && <span className={itemStyles.lead}>{media}</span>}
      <span className={helperStyles.tileBody}>
        {title !== undefined ? (
          <>
            <span
              className={itemStyles.tileTitle}
              title={typeof title === "string" ? title : undefined}
            >
              {title}
            </span>
            {description && <span className={itemStyles.description}>{description}</span>}
            {children}
          </>
        ) : (
          children
        )}
      </span>
      <Icon name={selected ? "check" : "chev-right"} />
    </button>
  )
);
Tile.displayName = "Tile";
