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
export type DropdownMenuContentProps = DropdownMenuPrimitive.MenuContentProps;
export const DropdownMenuContent = forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ children, className, ...props }, forwardedRef) => {
    return (
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          sideOffset={10}
          {...props}
          ref={forwardedRef}
          className={twMerge(
            "min-w-[220px] z-30 bg-mineshaft-900 border border-mineshaft-600 will-change-auto text-bunker-300 rounded-md shadow data-[side=top]:animate-slideDownAndFade data-[side=left]:animate-slideRightAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade",
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
export type DropdownSubMenuContentProps = DropdownMenuPrimitive.MenuSubContentProps;
export const DropdownSubMenuContent = forwardRef<HTMLDivElement, DropdownSubMenuContentProps>(
  ({ children, className, ...props }, forwardedRef) => {
    return (
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.SubContent
          sideOffset={2}
          {...props}
          ref={forwardedRef}
          className={twMerge(
            "min-w-[220px] z-30 bg-mineshaft-900 border border-mineshaft-600 will-change-auto text-bunker-300 rounded-md shadow data-[side=top]:animate-slideDownAndFade data-[side=left]:animate-slideRightAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade",
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
export type DropdownLabelProps = DropdownMenuPrimitive.MenuLabelProps;
export const DropdownMenuLabel = ({ className, ...props }: DropdownLabelProps) => (
  <DropdownMenuPrimitive.Label
    {...props}
    className={twMerge("text-xs text-bunker-400 px-4 pt-2 pb-1", className)}
  />
);

// dropdown items
export type DropdownMenuItemProps<T extends ElementType> =
  DropdownMenuPrimitive.MenuContentProps & {
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
  ...props
}: DropdownMenuItemProps<T> & ComponentPropsWithRef<T>) => (
  <DropdownMenuPrimitive.Item
    {...props}
    className={twMerge(
      "text-xs text-mineshaft-200 block font-inter px-4 py-2 data-[highlighted]:bg-mineshaft-700 rounded-sm outline-none cursor-pointer",
      className
    )}
  >
    <Item type="button" role="menuitem" className="flex w-full items-center" ref={inputRef}>
      {icon && iconPos === "left" && <span className="flex items-center mr-2">{icon}</span>}
      <span className="flex-grow text-left">{children}</span>
      {icon && iconPos === "right" && <span className="flex items-center ml-2">{icon}</span>}
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
      "text-xs text-mineshaft-200 block font-inter px-4 py-2 data-[highlighted]:bg-mineshaft-700 rounded-sm outline-none cursor-pointer",
      className
    )}
  >
    <Item type="button" role="menuitem" className="flex w-full items-center" ref={inputRef}>
      {icon && iconPos === "left" && <span className="flex items-center mr-2">{icon}</span>}
      <span className="flex-grow text-left">{children}</span>
      {icon && iconPos === "right" && <span className="flex items-center ml-2">{icon}</span>}
    </Item>
  </DropdownMenuPrimitive.SubTrigger>
);

// grouping items into 1
export type DropdownMenuGroupProps = DropdownMenuPrimitive.DropdownMenuGroupProps;

export const DropdownMenuGroup = forwardRef<HTMLDivElement, DropdownMenuGroupProps>(
  ({ ...props }, ref) => (
    <DropdownMenuPrimitive.Group
      {...props}
      className={twMerge("text-xs py-2 pl-3", props.className)}
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
    className={twMerge("h-[1px] bg-gray-700 m-1", className)}
  />
));

DropdownMenuSeparator.displayName = "DropdownMenuSeperator";

DropdownMenuSeparator.displayName = "DropdownMenuSeperator";
