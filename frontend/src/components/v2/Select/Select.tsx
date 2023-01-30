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
  isLoading?: boolean;
};

export type SelectProps = SelectPrimitive.SelectProps & Props;

export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  ({ children, placeholder, className, isLoading, ...props }, ref): JSX.Element => {
    return (
      <SelectPrimitive.Root {...props}>
        <SelectPrimitive.Trigger
          ref={ref}
          className={twMerge(
            `inline-flex items-center justify-between data-[placeholder]:text-gray-500
            px-4 py-2.5 font-inter text-sm text-white rounded-md bg-mineshaft-800`,
            className
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon className="ml-3">
            <FontAwesomeIcon icon={faChevronDown} size="sm" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={5}
            className="overflow-hidden text-white rounded-md shadow-md font-inter bg-mineshaft-800"
            style={{ width: 'var(--radix-select-trigger-width)' }}
          >
            <SelectPrimitive.ScrollUpButton>
              <FontAwesomeIcon icon={faChevronUp} size="sm" />
            </SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport className="p-2">
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
          `text-sm rounded-sm transition-all hover:text-primary 
          hover:bg-mineshaft-700 flex items-center pl-10 pr-4 py-2 cursor-pointer 
          select-none outline-none relative`,
          isSelected && 'text-primary',
          isDisabled && 'text-gray-600 hover:bg-transparent cursor-not-allowed hover:text-gray-600',
          className
        )}
        ref={forwardedRef}
      >
        <SelectPrimitive.ItemIndicator className="absolute left-2">
          <FontAwesomeIcon icon={faCheck} size="sm" />
        </SelectPrimitive.ItemIndicator>
        <SelectPrimitive.ItemText className="">{children}</SelectPrimitive.ItemText>
      </SelectPrimitive.Item>
    );
  }
);

SelectItem.displayName = 'SelectItem';
