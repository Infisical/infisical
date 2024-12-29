import { ReactNode } from "react";
import { faCheck, faMinus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { twMerge } from "tailwind-merge";

export type CheckboxProps = Omit<
  CheckboxPrimitive.CheckboxProps,
  "checked" | "disabled" | "required"
> & {
  children?: ReactNode;
  id: string;
  isDisabled?: boolean;
  isChecked?: boolean;
  isRequired?: boolean;
  checkIndicatorBg?: string | undefined;
  isError?: boolean;
  isIndeterminate?: boolean;
  containerClassName?: string;
};

export const Checkbox = ({
  children,
  className,
  id,
  isChecked,
  isDisabled,
  isRequired,
  checkIndicatorBg,
  isError,
  isIndeterminate,
  containerClassName,
  ...props
}: CheckboxProps): JSX.Element => {
  return (
    <div className={twMerge("flex items-center font-inter text-bunker-300", containerClassName)}>
      <CheckboxPrimitive.Root
        className={twMerge(
          "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-mineshaft-400 bg-mineshaft-600 shadow transition-all hover:bg-mineshaft-500",
          isDisabled && "bg-bunker-400 hover:bg-bunker-400",
          isChecked && "bg-primary hover:bg-primary",
          Boolean(children) && "mr-3",
          className
        )}
        required={isRequired}
        checked={isChecked}
        disabled={isDisabled}
        {...props}
        id={id}
      >
        <CheckboxPrimitive.Indicator className={`${checkIndicatorBg || "text-bunker-800"}`}>
          {isIndeterminate ? (
            <FontAwesomeIcon icon={faMinus} size="sm" />
          ) : (
            <FontAwesomeIcon icon={faCheck} size="sm" />
          )}
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <label
        className={twMerge("truncate whitespace-nowrap text-sm", isError && "text-red-400")}
        htmlFor={id}
      >
        {children}
        {isRequired && <span className="pl-1 text-red">*</span>}
      </label>
    </div>
  );
};
