import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { animate, motion, useMotionValue } from "motion/react";
import { Slot } from "radix-ui";

import { spring } from "../lib/motion";
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
        primary: styles.material,
        accent: styles.material,
        "danger-ghost": "text-destructive hover:bg-destructive/10",
        default: styles.material,
        outline: [
          "border-[color:var(--v4-action-outline-border)] bg-[color:var(--v4-action-outline-surface)] hover:bg-[color:var(--v4-action-outline-hover)] hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
          styles.neutralSelection
        ],
        secondary: [
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
          styles.neutralSelection
        ],
        ghost: [
          "hover:bg-[color:var(--v4-action-ghost-hover)] hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
          styles.neutralSelection
        ],
        destructive:
          "bg-[color:var(--v4-action-danger-surface)] text-destructive hover:bg-[color:var(--v4-action-danger-hover)]",
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
        variant: ["danger-ghost", "outline", "secondary", "ghost", "destructive", "link"],
        className: [styles.paintTransition, "disabled:opacity-50"]
      }
    ],
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

const MotionButton = motion.create("button");
const MotionSlot = motion.create(Slot.Root);

const Button = React.forwardRef<
  React.ElementRef<"button">,
  React.ComponentPropsWithoutRef<"button"> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean;
      loading?: boolean;
      icon?: IconName;
      iconRight?: IconName;
      iconOnly?: boolean;
      selected?: boolean;
    }
>(
  (
    {
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
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? MotionSlot : MotionButton;
    const scaleX = useMotionValue(1);
    const scaleY = useMotionValue(1);
    const press = (event: React.PointerEvent<HTMLElement>) => {
      if (variant === "link" || event.button !== 0) return;
      const { width, height } = event.currentTarget.getBoundingClientRect();
      animate(scaleX, (width - 2) / width, spring.fast);
      animate(scaleY, (height - 2) / height, spring.fast);
    };
    const release = () => {
      animate(scaleX, 1, spring.moderate);
      animate(scaleY, 1, spring.moderate);
    };
    const loading = loadingProp ?? false;
    const inactive =
      loading ||
      props.disabled ||
      props["aria-disabled"] === true ||
      props["aria-disabled"] === "true";
    const material = variant === "default" || variant === "primary" || variant === "accent";
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
          {icon && !(loading && iconOnly) && (
            <Icon name={icon} size={iconSize} data-button-icon="" />
          )}
          {iconOnly && (icon || iconRight || loading) ? (
            <span className="sr-only">{label}</span>
          ) : (
            label
          )}
          {iconRight && !(loading && iconOnly) && <Icon name={iconRight} size={iconSize} />}
        </>
      );
      if (loadingProp === undefined || iconOnly)
        return (
          <>
            {loading && iconOnly && progress}
            {labelGroup}
          </>
        );
      return (
        <>
          {progress}
          <span className={styles.labelGroup}>{labelGroup}</span>
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
      }>(children)
        ? React.cloneElement(
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
            content(children.props.children)
          )
        : content(children);

    return (
      <Comp
        ref={ref}
        data-slot="button"
        data-variant={variant}
        data-size={size}
        {...props}
        data-v4-button=""
        data-leading-icon={icon && loadingProp !== undefined && !iconOnly ? "" : undefined}
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
        style={{ ...style, scaleX, scaleY }}
        onPointerDown={(event) => {
          if (!inactive) press(event);
          onPointerDown?.(event);
        }}
        onPointerUp={(event) => {
          release();
          onPointerUp?.(event);
        }}
        onPointerLeave={(event) => {
          release();
          onPointerLeave?.(event);
        }}
        onPointerCancel={(event) => {
          release();
          onPointerCancel?.(event);
        }}
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
);
Button.displayName = "Button";

export { Button, buttonVariants };
