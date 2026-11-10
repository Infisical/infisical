import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "../lib/utils";
import { Icon, type IconName } from "./icon";
import { Spinner } from "./spinner";
import { Tooltip } from "./tooltip";

import geometry from "./button-geometry.module.css";
import styles from "./button-material.module.css";
import controlStyles from "./controls.module.css";

const buttonVariants = cva(
  [
    geometry.button,
    controlStyles.focusOutline,
    "group/button inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-border whitespace-nowrap select-none disabled:pointer-events-none aria-invalid:border-[color:var(--v4-control-invalid-border)] [&_svg]:pointer-events-none [&_svg]:shrink-0"
  ],
  {
    variants: {
      variant: {
        primary: styles.ink,
        accent: styles.material,
        "danger-ghost": "text-destructive hover:bg-destructive/10",
        default: styles.ink,
        outline: [
          "border-[color:var(--v4-action-outline-border)] bg-[color:var(--v4-action-outline-surface)] hover:bg-[color:var(--v4-action-outline-hover)] hover:text-foreground [&[aria-haspopup]:is([data-state=open],[aria-expanded=true])]:bg-muted [&[aria-haspopup]:is([data-state=open],[aria-expanded=true])]:text-foreground",
          styles.neutralSelection
        ],
        secondary: [
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] [&[aria-haspopup]:is([data-state=open],[aria-expanded=true])]:bg-secondary [&[aria-haspopup]:is([data-state=open],[aria-expanded=true])]:text-secondary-foreground",
          styles.neutralSelection
        ],
        ghost: [
          "hover:bg-[color:var(--v4-action-ghost-hover)] hover:text-foreground [&[aria-haspopup]:is([data-state=open],[aria-expanded=true])]:bg-[color:var(--v4-action-ghost-hover)] [&[aria-haspopup]:is([data-state=open],[aria-expanded=true])]:text-foreground",
          styles.neutralSelection
        ],
        destructive: styles.danger,
        link: styles.link
      },
      size: {
        md: geometry.regular,
        default: geometry.default,
        xs: geometry.extraSmall,
        sm: geometry.default,
        lg: geometry.large,
        icon: geometry.icon,
        "icon-xs": geometry.iconExtraSmall,
        "icon-sm": geometry.iconSmall,
        "icon-lg": geometry.iconLarge,
        "icon-row": geometry.iconRow
      }
    },
    compoundVariants: [
      {
        variant: ["primary", "default", "danger-ghost", "outline", "secondary", "ghost", "link"],
        className: [styles.paintTransition, "disabled:opacity-50", styles.reasonDisabled]
      },
      { variant: "destructive", className: styles.paintTransition }
    ],
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading: loadingProp,
  icon,
  iconRight,
  iconOnly = false,
  selected,
  disabledReason,
  cornerBadge,
  layout,
  underline,
  children,
  onClickCapture,
  onPointerDownCapture,
  onKeyDownCapture,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  style,
  type,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
    icon?: IconName;
    iconRight?: IconName;
    iconOnly?: boolean;
    selected?: boolean;
    /** Disables the action and says why: it stays focusable, shows the reason in a tooltip and exposes it as the accessible description. */
    disabledReason?: string;
    /** A small Badge pinned to the top-right corner, straddling the border. It is part of the accessible name and never changes the button's size or hit area. */
    cornerBadge?: React.ReactNode;
    /** trigger: the label sits at the start and truncates and a chevron (iconRight, chev-down by default) sits at the end, with SelectTrigger's padding, for a Button that opens a menu, popover or picker. */
    layout?: "trigger";
    /** For variant link: always (the default) keeps the underline at rest; hover draws it only on hover and keyboard focus, for a record name in a table row. */
    underline?: "always" | "hover";
  } & { ref?: React.Ref<React.ComponentRef<"button">> }) {
  const Comp = asChild ? Slot.Root : "button";
  const loading = loadingProp ?? false;
  const reason = disabledReason || undefined;
  const inactive =
    loading ||
    Boolean(reason) ||
    props.disabled ||
    props["aria-disabled"] === true ||
    props["aria-disabled"] === "true";
  const material = variant === "accent";
  const preventActivation = (event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const popup = props["aria-haspopup"];
  const hasPopup = popup !== undefined && popup !== false && popup !== "false";
  const activationKey = (key: string) =>
    key === "Enter" || key === " " || (hasPopup && (key === "ArrowDown" || key === "ArrowUp"));
  const progress = (
    <Spinner
      data-slot="button-progress"
      className={styles.progress}
      data-active={loading || undefined}
    />
  );
  let iconSize: number | undefined = 14;
  if (size === "xs" || size === "icon-xs") iconSize = 12;
  else if (size === "md" || size === "lg") iconSize = 16;
  else if (size === "icon-row") iconSize = undefined;
  const trigger = layout === "trigger";
  const content = (label: React.ReactNode) => {
    const labelGroup = trigger ? (
      <>
        {icon && <Icon name={icon} size={iconSize} data-button-icon="" />}
        <span data-slot="button-label" className={geometry.triggerLabel}>
          {label}
        </span>
        <Icon
          name={iconRight ?? "chev-down"}
          data-slot="button-chevron"
          className={geometry.triggerChevron}
        />
      </>
    ) : (
      <>
        {icon && <Icon name={icon} size={iconSize} data-button-icon="" />}
        {iconOnly && (icon || iconRight) ? <span className="sr-only">{label}</span> : label}
        {iconRight && <Icon name={iconRight} size={iconSize} />}
      </>
    );
    if (loadingProp === undefined) return labelGroup;
    return (
      <>
        <span data-slot="button-label-group" className={styles.labelGroup}>
          {labelGroup}
        </span>
        {progress}
      </>
    );
  };
  const badge = cornerBadge ? (
    <span data-slot="button-corner-badge" className={geometry.cornerBadge}>
      {cornerBadge}
    </span>
  ) : null;
  const child =
    asChild &&
    React.isValidElement<{
      children?: React.ReactNode;
      onClickCapture?: React.MouseEventHandler<HTMLElement>;
      onPointerDownCapture?: React.PointerEventHandler<HTMLElement>;
      onKeyDownCapture?: React.KeyboardEventHandler<HTMLElement>;
    }>(children) ? (
      React.cloneElement(
        children,
        inactive
          ? {
              onClickCapture: preventActivation,
              onPointerDownCapture: preventActivation,
              onKeyDownCapture: (event: React.KeyboardEvent<HTMLElement>) => {
                if (activationKey(event.key)) preventActivation(event);
                else children.props.onKeyDownCapture?.(event);
              }
            }
          : undefined,
        <>
          <span data-press="">{content(children.props.children)}</span>
          {badge}
        </>
      )
    ) : (
      <>
        <span data-press="">{content(children)}</span>
        {badge}
      </>
    );

  const button = (
    <Comp
      ref={ref}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-layout={layout}
      data-underline={variant === "link" ? (underline ?? "always") : undefined}
      type={asChild ? type : (type ?? "button")}
      {...props}
      disabled={reason ? undefined : props.disabled}
      data-v4-button=""
      data-v4-button-material={material ? "" : undefined}
      data-disabled-reason={reason ? "" : undefined}
      aria-busy={loading || undefined}
      aria-disabled={
        loading || Boolean(reason) || props.disabled || props["aria-disabled"] || undefined
      }
      aria-description={reason ?? props["aria-description"]}
      aria-pressed={selected ?? props["aria-pressed"]}
      className={cn(
        buttonVariants({ variant, size }),
        iconOnly && geometry.iconOnly,
        badge && geometry.badged,
        trigger && geometry.triggerLayout,
        loadingProp !== undefined && !iconOnly && styles.pendable,
        loading && styles.pending,
        className
      )}
      style={style}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
      onPointerDownCapture={(event) => {
        if (inactive) preventActivation(event);
        else onPointerDownCapture?.(event);
      }}
      onKeyDownCapture={(event) => {
        if (inactive && activationKey(event.key)) preventActivation(event);
        else onKeyDownCapture?.(event);
      }}
      onClickCapture={(event) => {
        if (inactive) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClickCapture?.(event);
      }}
    >
      {child}
    </Comp>
  );
  return reason ? <Tooltip content={reason}>{button}</Tooltip> : button;
}
Button.displayName = "Button";

export { Button, buttonVariants };
