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
            px-3 py-2 font-inter text-sm text-bunker-200 font-normal rounded-md bg-mineshaft-800 outline-none`,
            className
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          {!props.disabled && <SelectPrimitive.Icon className="ml-3">
            <FontAwesomeIcon icon={faChevronDown} size="sm" />
          </SelectPrimitive.Icon>}
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            // position="popper"
            sideOffset={4}
            className="overflow-hidden text-bunker-100 rounded-md shadow-md font-inter bg-mineshaft-800"
            style={{ width: 'var(--radix-select-trigger-width) + 6' }}
          >
            <SelectPrimitive.ScrollUpButton>
              <FontAwesomeIcon icon={faChevronUp} size="sm" />
            </SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport className="p-1.5">
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
          `text-sm rounded-sm transition-all hover:bg-mineshaft-500
          flex items-center pl-10 pr-4 py-2 cursor-pointer rounded-md
          select-none outline-none relative`,
          isSelected && 'bg-primary',
          isDisabled && 'text-gray-600 hover:bg-transparent cursor-not-allowed hover:text-gray-600',
          className
        )}
        ref={forwardedRef}
      >
        <SelectPrimitive.ItemIndicator className="absolute left-3.5">
          <FontAwesomeIcon icon={faCheck} size="sm" />
        </SelectPrimitive.ItemIndicator>
        <SelectPrimitive.ItemText className="">{children}</SelectPrimitive.ItemText>
      </SelectPrimitive.Item>
    );
  }
);

SelectItem.displayName = 'SelectItem';
