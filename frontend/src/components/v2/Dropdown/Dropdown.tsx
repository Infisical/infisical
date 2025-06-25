import { ComponentPropsWithRef, ElementType, forwardRef, ReactNode, Ref } from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { twMerge } from "tailwind-merge";

// Main menu or parent container
export type DropdownMenuProps = DropdownMenuPrimitive.DropdownMenuProps;
export const DropdownMenu = DropdownMenuPrimitive.Root;

export type DropdownSubMenuProps = DropdownMenuPrimitive.DropdownMenuSubProps;
export const DropdownSubMenu = DropdownMenuPrimitive.Sub;

// trigger
export type DropdownMenuTriggerProps = DropdownMenuPrimitive.DropdownMenuTriggerProps;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

// item container
export type DropdownMenuContentProps = DropdownMenuPrimitive.DropdownMenuContentProps;
export const DropdownMenuContent = forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ children, className, ...props }, forwardedRef) => {
    return (
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          sideOffset={-8}
          {...props}
          ref={forwardedRef}
          className={twMerge(
            "z-30 min-w-[220px] overflow-y-auto rounded-md border border-mineshaft-600 bg-mineshaft-900 text-bunker-300 shadow will-change-auto data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade data-[side=right]:animate-slideLeftAndFade data-[side=top]:animate-slideDownAndFade",
            className
          )}
        >
          {children}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    );
  }
);

DropdownMenuContent.displayName = "DropdownMenuContent";

// item container
export type DropdownSubMenuContentProps = DropdownMenuPrimitive.DropdownMenuSubContentProps;
export const DropdownSubMenuContent = forwardRef<HTMLDivElement, DropdownSubMenuContentProps>(
  ({ children, className, ...props }, forwardedRef) => {
    return (
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.SubContent
          sideOffset={2}
          {...props}
          ref={forwardedRef}
          className={twMerge(
            "z-30 min-w-[220px] rounded-md border border-mineshaft-600 bg-mineshaft-900 text-bunker-300 shadow will-change-auto data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade data-[side=right]:animate-slideLeftAndFade data-[side=top]:animate-slideDownAndFade",
            className
          )}
        >
          {children}
        </DropdownMenuPrimitive.SubContent>
      </DropdownMenuPrimitive.Portal>
    );
  }
);

DropdownSubMenuContent.displayName = "DropdownMenuContent";

// item label component
export type DropdownLabelProps = DropdownMenuPrimitive.DropdownMenuLabelProps;
export const DropdownMenuLabel = ({ className, ...props }: DropdownLabelProps) => (
  <DropdownMenuPrimitive.Label
    {...props}
    className={twMerge("px-4 pb-1 pt-2 text-xs text-bunker-400", className)}
  />
);

// dropdown items
export type DropdownMenuItemProps<T extends ElementType> =
  DropdownMenuPrimitive.DropdownMenuContentProps & {
    icon?: ReactNode;
    as?: T;
    inputRef?: Ref<T>;
    iconPos?: "left" | "right";
  };

export const DropdownMenuItem = <T extends ElementType = "button">({
  children,
  inputRef,
  className,
  icon,
  as: Item = "button",
  iconPos = "left",
  isDisabled = false,
  ...props
}: DropdownMenuItemProps<T> & ComponentPropsWithRef<T> & { isDisabled?: boolean }) => (
  <DropdownMenuPrimitive.Item
    {...props}
    className={twMerge(
      "block cursor-pointer rounded-sm px-4 py-2 font-inter text-xs text-mineshaft-200 outline-none data-[highlighted]:bg-mineshaft-700",
      className,
      isDisabled ? "pointer-events-none cursor-not-allowed opacity-50" : ""
    )}
  >
    <Item type="button" role="menuitem" className="flex w-full items-center" ref={inputRef}>
      {icon && iconPos === "left" && <span className="mr-2 flex items-center">{icon}</span>}
      <span className="flex-grow text-left">{children}</span>
      {icon && iconPos === "right" && <span className="ml-2 flex items-center">{icon}</span>}
    </Item>
  </DropdownMenuPrimitive.Item>
);

// trigger
export type DropdownSubMenuTriggerProps<T extends ElementType> =
  DropdownMenuPrimitive.DropdownMenuSubTriggerProps & {
    icon?: ReactNode;
    as?: T;
    inputRef?: Ref<T>;
    iconPos?: "left" | "right";
  };

export const DropdownSubMenuTrigger = <T extends ElementType = "button">({
  children,
  inputRef,
  className,
  icon,
  as: Item = "button",
  iconPos = "left",
  ...props
}: DropdownMenuItemProps<T> & ComponentPropsWithRef<T>) => (
  <DropdownMenuPrimitive.SubTrigger
    {...props}
    className={twMerge(
      "block cursor-pointer rounded-sm px-4 py-2 font-inter text-xs text-mineshaft-200 outline-none data-[highlighted]:bg-mineshaft-700",
      className
    )}
  >
    <Item type="button" role="menuitem" className="flex w-full items-center" ref={inputRef}>
      {icon && iconPos === "left" && <span className="mr-2 flex items-center">{icon}</span>}
      <span className="flex-grow text-left">{children}</span>
      {icon && iconPos === "right" && <span className="ml-2 flex items-center">{icon}</span>}
    </Item>
  </DropdownMenuPrimitive.SubTrigger>
);

// grouping items into 1
export type DropdownMenuGroupProps = DropdownMenuPrimitive.DropdownMenuGroupProps;

export const DropdownMenuGroup = forwardRef<HTMLDivElement, DropdownMenuGroupProps>(
  ({ ...props }, ref) => (
    <DropdownMenuPrimitive.Group
      {...props}
      className={twMerge("py-2 pl-3 text-xs", props.className)}
      ref={ref}
    />
  )
);

DropdownMenuGroup.displayName = "DropdownMenuGroup";

// Divider
export const DropdownMenuSeparator = forwardRef<
  HTMLDivElement,
  DropdownMenuPrimitive.DropdownMenuSeparatorProps
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    {...props}
    className={twMerge("m-1 h-[1px] bg-gray-700", className)}
  />
));

DropdownMenuSeparator.displayName = "DropdownMenuSeperator";

DropdownMenuSeparator.displayName = "DropdownMenuSeperator";
