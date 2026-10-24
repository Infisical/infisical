import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "motion/react";
import { Slot } from "radix-ui";

import { cn } from "../lib/utils";
import { Icon, type IconName } from "./icon";
import { Spinner } from "./spinner";

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
          "border-[color:var(--v4-action-outline-border)] bg-[color:var(--v4-action-outline-surface)] hover:bg-[color:var(--v4-action-outline-hover)] hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
          styles.neutralSelection
        ],
        secondary: [
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
          styles.neutralSelection
        ],
        ghost: [
          "hover:bg-[color:var(--v4-action-ghost-hover)] hover:text-foreground aria-expanded:bg-[color:var(--v4-action-ghost-hover)] aria-expanded:text-foreground",
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
        "icon-lg": geometry.iconLarge
      }
    },
    compoundVariants: [
      {
        variant: ["primary", "default", "danger-ghost", "outline", "secondary", "ghost", "link"],
        className: [styles.paintTransition, "disabled:opacity-50"]
      },
      { variant: "destructive", className: styles.paintTransition }
    ],
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

const MotionButton = motion.create("button");
const MotionSlot = motion.create(Slot.Root);

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
  children,
  onClickCapture,
  onPointerDownCapture,
  onKeyDownCapture,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  style,
  onDrag: _onDrag,
  onDragStart: _onDragStart,
  onDragEnd: _onDragEnd,
  onAnimationStart: _onAnimationStart,
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
  } & { ref?: React.Ref<React.ComponentRef<"button">> }) {
  const Comp = asChild ? MotionSlot : MotionButton;
  const loading = loadingProp ?? false;
  const inactive =
    loading ||
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
  const iconSize =
    size === "xs" || size === "icon-xs" ? 12 : size === "md" || size === "lg" ? 16 : 14;
  const content = (label: React.ReactNode) => {
    const labelGroup = (
      <>
        {icon && <Icon name={icon} size={iconSize} data-button-icon="" />}
        {iconOnly && (icon || iconRight) ? <span className="sr-only">{label}</span> : label}
        {iconRight && <Icon name={iconRight} size={iconSize} />}
      </>
    );
    if (loadingProp === undefined) return labelGroup;
    return (
      <>
        <span className={styles.labelGroup}>{labelGroup}</span>
        {progress}
      </>
    );
  };
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
        <span data-press="">{content(children.props.children)}</span>
      )
    ) : (
      <span data-press="">{content(children)}</span>
    );

  return (
    <Comp
      ref={ref}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      {...props}
      data-v4-button=""
      data-v4-button-material={material ? "" : undefined}
      aria-busy={loading || undefined}
      aria-disabled={loading || props.disabled || props["aria-disabled"] || undefined}
      aria-pressed={selected ?? props["aria-pressed"]}
      className={cn(
        buttonVariants({ variant, size }),
        iconOnly && geometry.iconOnly,
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
}
Button.displayName = "Button";

export { Button, buttonVariants };
