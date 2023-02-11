import { ComponentPropsWithRef, ElementType, ReactNode, Ref } from 'react';
import { twMerge } from 'tailwind-merge';

export type MenuProps = {
  children: ReactNode;
  className?: string;
};

export const Menu = ({ children, className }: MenuProps): JSX.Element => {
  return <ul className={twMerge('p-2', className)}>{children}</ul>;
};

export type MenuItemProps<T extends ElementType> = {
  // Kudos to https://itnext.io/react-polymorphic-components-with-typescript-f7ce72ea7af2
  as?: T;
  children: ReactNode;
  icon?: ReactNode;
  description?: ReactNode;
  isDisabled?: boolean;
  isSelected?: boolean;
  className?: string;
  inputRef?: Ref<T>;
};

export const MenuItem = <T extends ElementType = 'button'>({
  children,
  icon,
  className,
  isDisabled,
  isSelected,
  as: Item = 'button',
  description,
  // wrapping in forward ref with generic component causes the loss of ts definitions on props
  inputRef,
  ...props
}: MenuItemProps<T> & ComponentPropsWithRef<T>): JSX.Element => (
  <li
    className={twMerge(
      'px-1 py-2.5 mt-0.5 font-inter flex flex-col text-sm text-bunker-100 transition-all rounded cursor-pointer hover:bg-mineshaft-600 duration-50',
      isSelected && 'bg-mineshaft-500',
      isDisabled && 'hover:bg-transparent cursor-not-allowed',
      className
    )}
  >
    <Item type="button" role="menuitem" className="flex items-center relative" ref={inputRef} {...props}>
      <div className={`${isSelected ? "visisble" : "invisible"} absolute w-[0.25rem] rounded-md h-8 bg-primary`}/>
      {icon && <span className="mr-3 ml-4 w-5">{icon}</span>}
      <span className="flex-grow text-left">{children}</span>
    </Item>
    {description && <span className="mt-2 text-xs">{description}</span>}
  </li>
);

MenuItem.displayName = 'MenuItem';

export type MenuGroupProps = {
  children: ReactNode;
  title: ReactNode;
};

export const MenuGroup = ({ children, title }: MenuGroupProps): JSX.Element => (
  <>
    <li className="p-2 text-xs text-gray-400">{title}</li>
    {children}
  </>
);
