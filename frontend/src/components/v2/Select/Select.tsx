import { forwardRef, ReactNode } from "react";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faCaretDown, faCaretUp,faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as SelectPrimitive from "@radix-ui/react-select";
import { twMerge } from "tailwind-merge";

import { Spinner } from "../Spinner";

type Props = {
  children: ReactNode;
  placeholder?: string;
  className?: string;
  dropdownContainerClassName?: string;
  isLoading?: boolean;
  position?: "item-aligned" | "popper";
  isDisabled?: boolean;
  icon?: IconProp;
  isMulti?: boolean;
};

export type SelectProps = Omit<SelectPrimitive.SelectProps, "disabled"> & Props;

export const Select = forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      children,
      placeholder,
      className,
      isLoading,
      isDisabled,
      dropdownContainerClassName,
      position,
      ...props
    },
    ref
  ): JSX.Element => {
    return (
      <SelectPrimitive.Root {...props} disabled={isDisabled}>
        <SelectPrimitive.Trigger
          ref={ref}
          className={twMerge(
            `inline-flex items-center justify-between rounded-md
            bg-mineshaft-900 px-3 py-2 font-inter text-sm font-normal text-bunker-200 outline-none data-[placeholder]:text-mineshaft-200`,
            className
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder}>
            {props.icon ? <FontAwesomeIcon icon={props.icon} /> : placeholder}
          </SelectPrimitive.Value>
          {!isDisabled && (
            <SelectPrimitive.Icon className="ml-3">
              <FontAwesomeIcon icon={faCaretDown} size="sm" />
            </SelectPrimitive.Icon>
          )}
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className={twMerge(
              "relative top-1 z-[100] overflow-hidden rounded-md bg-mineshaft-900 border border-mineshaft-600 font-inter text-bunker-100 shadow-md",
              dropdownContainerClassName
            )}
            position={position}
            style={{ width: "var(--radix-select-trigger-width)" }}
          >
            <SelectPrimitive.ScrollUpButton>
              <div className="flex items-center justify-center">
                <FontAwesomeIcon icon={faCaretUp} size="sm" />
              </div>
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
              <div className="flex items-center justify-center">
                <FontAwesomeIcon icon={faCaretDown} size="sm" />
              </div>
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    );
  }
);

Select.displayName = "Select";

export type SelectItemProps = Omit<SelectPrimitive.SelectItemProps, "disabled"> & {
  isDisabled?: boolean;
  isSelected?: boolean;
  customIcon?: IconProp;
};

export const SelectItem = forwardRef<HTMLDivElement, SelectItemProps>(
  ({ children, className, isSelected, isDisabled, ...props }, forwardedRef) => {
    return (
      <SelectPrimitive.Item
        {...props}
        className={twMerge(
          `relative mb-0.5 flex
          cursor-pointer select-none items-center rounded-md py-2 pl-10 pr-4 text-sm
          outline-none transition-all hover:bg-mineshaft-500`,
          isSelected && "bg-primary",
          isDisabled &&
            "cursor-not-allowed text-gray-600 hover:bg-transparent hover:text-mineshaft-600",
          className
        )}
        ref={forwardedRef}
      >
        <SelectPrimitive.ItemIndicator className="absolute left-3.5 text-primary">
          <FontAwesomeIcon icon={props.customIcon ? props.customIcon : faCheck} />
        </SelectPrimitive.ItemIndicator>
        <SelectPrimitive.ItemText className="">{children}</SelectPrimitive.ItemText>
      </SelectPrimitive.Item>
    );
  }
);

SelectItem.displayName = "SelectItem";
