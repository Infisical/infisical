import { ComponentPropsWithRef, ElementType, ReactNode, Ref } from "react";
import { twMerge } from "tailwind-merge";

export type MenuProps = {
  children: ReactNode;
  className?: string;
};

export const Menu = ({ children, className }: MenuProps): JSX.Element => {
  return <ul className={twMerge("p-2", className)}>{children}</ul>;
};

export type MenuItemProps<T extends ElementType> = {
  // Kudos to https://itnext.io/react-polymorphic-components-with-typescript-f7ce72ea7af2
  as?: T;
  children?: ReactNode;
  leftIcon?: ReactNode;
  description?: ReactNode;
  isDisabled?: boolean;
  isSelected?: boolean;
  className?: string;
  inputRef?: Ref<T>;
};

export const MenuItem = <T extends ElementType = "button">({
  children,
  leftIcon,
  iconMode,
  className,
  isDisabled,
  isSelected,
  as: Item = "div",
  description,
  // wrapping in forward ref with generic component causes the loss of ts definitions on props
  inputRef,
  ...props
}: MenuItemProps<T> & ComponentPropsWithRef<T>): JSX.Element => {
  return (
    <Item
      type="button"
      role="menuitem"
      className={twMerge(
        "duration-50 group relative mt-0.5 flex w-full cursor-pointer items-center rounded px-2 py-2 font-inter text-sm text-bunker-100 transition-all hover:bg-mineshaft-700",
        isSelected && "bg-mineshaft-600 hover:bg-mineshaft-600",
        isDisabled && "cursor-not-allowed hover:bg-transparent",
        className
      )}
      ref={inputRef}
      {...props}
    >
      {leftIcon}
      {children && <span className="flex-grow whitespace-nowrap text-left">{children}</span>}
      {description && <span className="mt-2 text-xs">{description}</span>}
    </Item>
  );
};

MenuItem.displayName = "MenuItem";

export type MenuGroupProps = {
  children: ReactNode;
  title: ReactNode;
  className?: string;
};

export const MenuGroup = ({ children, title, className }: MenuGroupProps): JSX.Element => (
  <>
    <li className={twMerge("px-2 pt-3 text-xs font-medium uppercase text-gray-400", className)}>
      {title}
    </li>
    {children}
  </>
);
