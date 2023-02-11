import { forwardRef, ReactNode } from 'react';
import { faCheck, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import * as SelectPrimitive from '@radix-ui/react-select';
import { twMerge } from 'tailwind-merge';

import { Spinner } from '../Spinner';

type Props = {
  children: ReactNode;
  placeholder?: string;
  className?: string;
  dropdownContainerClassName?: string;
  isLoading?: boolean;
  position?: 'item-aligned' | 'popper';
};

export type SelectProps = SelectPrimitive.SelectProps & Props;

export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  (
    { children, placeholder, className, isLoading, dropdownContainerClassName, position, ...props },
    ref
  ): JSX.Element => {
    return (
      <SelectPrimitive.Root {...props}>
        <SelectPrimitive.Trigger
          ref={ref}
          className={twMerge(
            `inline-flex items-center justify-between rounded-md
            bg-bunker-800 px-3 py-2 font-inter text-sm font-normal text-bunker-200 outline-none data-[placeholder]:text-gray-500`,
            className
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          {!props.disabled && (
            <SelectPrimitive.Icon className="ml-3">
              <FontAwesomeIcon icon={faChevronDown} size="sm" />
            </SelectPrimitive.Icon>
          )}
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className={twMerge(
              'relative left-4 top-1 overflow-hidden rounded-md bg-bunker-800 font-inter text-bunker-100 shadow-md z-[100]',
              dropdownContainerClassName
            )}
            position={position}
            style={{ width: 'var(--radix-select-trigger-width)' }}
          >
            <SelectPrimitive.ScrollUpButton>
              <FontAwesomeIcon icon={faChevronUp} size="sm" />
            </SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport className="p-1">
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <Spinner size="xs" />
                  <span className="ml-2 text-xs text-gray-500">Loading...</span>
                </div>
              ) : (
                children
              )}
            </SelectPrimitive.Viewport>
            <SelectPrimitive.ScrollDownButton>
              <FontAwesomeIcon icon={faChevronDown} size="sm" />
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    );
  }
);

Select.displayName = 'Select';

export type SelectItemProps = Omit<SelectPrimitive.SelectItemProps, 'disabled'> & {
  isDisabled?: boolean;
  isSelected?: boolean;
};

export const SelectItem = forwardRef<HTMLDivElement, SelectItemProps>(
  ({ children, className, isSelected, isDisabled, ...props }, forwardedRef) => {
    return (
      <SelectPrimitive.Item
        {...props}
        className={twMerge(
          `relative flex cursor-pointer
          select-none items-center rounded-md py-2 pl-10 pr-4 mb-0.5 text-sm
          outline-none transition-all hover:bg-mineshaft-500`,
          isSelected && 'bg-primary',
          isDisabled && 'cursor-not-allowed text-gray-600 hover:bg-transparent hover:text-gray-600',
          className
        )}
        ref={forwardedRef}
      >
        <SelectPrimitive.ItemIndicator className="absolute left-3.5 text-primary">
          <FontAwesomeIcon icon={faCheck} />
        </SelectPrimitive.ItemIndicator>
        <SelectPrimitive.ItemText className="">{children}</SelectPrimitive.ItemText>
      </SelectPrimitive.Item>
    );
  }
);

SelectItem.displayName = 'SelectItem';
