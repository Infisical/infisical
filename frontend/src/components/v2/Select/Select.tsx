import { forwardRef, ReactNode } from "react";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faCaretDown, faCaretUp, faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as SelectPrimitive from "@radix-ui/react-select";
import { twMerge } from "tailwind-merge";

import { Spinner } from "../Spinner";

type Props = {
  children: ReactNode;
  placeholder?: string;
  className?: string;
  dropdownContainerClassName?: string;
  containerClassName?: string;
  isLoading?: boolean;
  position?: "item-aligned" | "popper";
  isDisabled?: boolean;
  icon?: IconProp;
  isMulti?: boolean;
  iconClassName?: string;
  dropdownContainerStyle?: React.CSSProperties;
  side?: SelectPrimitive.SelectContentProps["side"];
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
      containerClassName,
      iconClassName,
      dropdownContainerStyle,
      side,
      ...props
    },
    ref
  ): JSX.Element => {
    return (
      <div className={twMerge("flex items-center space-x-2", containerClassName)}>
        <SelectPrimitive.Root
          {...props}
          onValueChange={(value) => {
            if (!props.onValueChange) return;

            const newValue = value === "EMPTY-VALUE" ? "" : value;
            props.onValueChange(newValue);
          }}
          disabled={isDisabled}
        >
          <SelectPrimitive.Trigger
            ref={ref}
            className={twMerge(
              "inline-flex items-center justify-between rounded-md border border-mineshaft-600 bg-mineshaft-900 px-3 py-2 font-inter text-sm font-normal text-bunker-200 outline-none focus:bg-mineshaft-700/80 data-[placeholder]:text-mineshaft-400",
              className,
              isDisabled && "cursor-not-allowed opacity-50"
            )}
          >
            <div className="flex items-center space-x-2 overflow-hidden text-ellipsis whitespace-nowrap">
              {props.icon && <FontAwesomeIcon icon={props.icon} className={iconClassName} />}
              <div className="flex-1 truncate">
                <SelectPrimitive.Value placeholder={placeholder} />
              </div>
            </div>

            <SelectPrimitive.Icon className="ml-3">
              <FontAwesomeIcon
                icon={faCaretDown}
                size="sm"
                className={twMerge(isDisabled && "opacity-30")}
              />
            </SelectPrimitive.Icon>
          </SelectPrimitive.Trigger>
          <SelectPrimitive.Portal>
            <SelectPrimitive.Content
              side={side}
              className={twMerge(
                "relative top-1 z-[100] max-w-sm overflow-hidden rounded-md border border-mineshaft-600 bg-mineshaft-900 font-inter text-bunker-100 shadow-md",
                position === "popper" && "max-h-72",
                dropdownContainerClassName
              )}
              position={position}
              style={dropdownContainerStyle ?? { width: "var(--radix-select-trigger-width)" }}
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
      </div>
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
        disabled={isDisabled}
        className={twMerge(
          "relative mb-0.5 cursor-pointer select-none items-center overflow-hidden truncate rounded-md py-2 pl-10 pr-4 text-sm outline-none transition-all hover:bg-mineshaft-500 data-[highlighted]:bg-mineshaft-700/80",
          isSelected && "bg-primary",
          isDisabled && "cursor-not-allowed text-gray-600 opacity-80 hover:!bg-transparent",
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

export type SelectClearProps = Omit<SelectItemProps, "disabled" | "value"> & {
  onClear: () => void;
  selectValue: string;
};

export const SelectClear = forwardRef<HTMLDivElement, SelectClearProps>(
  (
    { children, className, isSelected, isDisabled, onClear, selectValue, ...props },
    forwardedRef
  ) => {
    return (
      <SelectPrimitive.Item
        {...props}
        value="EMPTY-VALUE"
        onSelect={() => onClear()}
        onClick={() => onClear()}
        className={twMerge(
          "relative mb-0.5 flex cursor-pointer select-none items-center rounded-md py-2 pl-10 pr-4 text-sm outline-none transition-all hover:bg-mineshaft-500 data-[highlighted]:bg-mineshaft-700/80",
          isSelected && "bg-primary",
          isDisabled &&
            "cursor-not-allowed text-gray-600 hover:bg-transparent hover:text-mineshaft-600",
          className
        )}
        ref={forwardedRef}
      >
        <div
          className={twMerge(
            "absolute left-3.5 text-primary",
            selectValue === "" ? "visible" : "hidden"
          )}
        >
          <FontAwesomeIcon icon={faCheck} />
        </div>
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      </SelectPrimitive.Item>
    );
  }
);
SelectClear.displayName = "SelectClear";
