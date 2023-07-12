import { ComponentPropsWithRef, ElementType, forwardRef, ReactNode, Ref } from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { twMerge } from "tailwind-merge";

// Main menu or parent container
export type DropdownMenuProps = DropdownMenuPrimitive.DropdownMenuProps;
export const DropdownMenu = DropdownMenuPrimitive.Root;

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
            "min-w-[220px] bg-bunker will-change-auto text-bunker-300 rounded-md shadow data-[side=top]:animate-slideDownAndFade data-[side=left]:animate-slideRightAndFade data-[side=right]:animate-slideLeftAndFade data-[side=bottom]:animate-slideUpAndFade",
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
  };

export const DropdownMenuItem = <T extends ElementType = "button">({
  children,
  inputRef,
  className,
  icon,
  as: Item = "button",
  ...props
}: DropdownMenuItemProps<T> & ComponentPropsWithRef<T>) => (
  <DropdownMenuPrimitive.Item
    {...props}
    className={twMerge(
      "text-sm block font-inter px-4 py-2 data-[highlighted]:bg-gray-700 outline-none cursor-pointer",
      className
    )}
  >
    <Item type="button" role="menuitem" class="flex w-full items-center" ref={inputRef}>
      {icon && <span className="flex items-center mr-2">{icon}</span>}
      <span className="flex-grow text-left">{children}</span>
    </Item>
  </DropdownMenuPrimitive.Item>
);

// grouping items into 1
export type DropdownMenuGroupProps = DropdownMenuPrimitive.DropdownMenuGroupProps;

export const DropdownMenuGroup = forwardRef<HTMLDivElement, DropdownMenuGroupProps>(
  ({ ...props }, ref) => <DropdownMenuPrimitive.Group {...props} ref={ref} />
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
