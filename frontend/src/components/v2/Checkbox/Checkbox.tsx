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
  indicatorClassName?: string;
  allowMultilineLabel?: boolean;
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
  indicatorClassName,
  allowMultilineLabel,
  ...props
}: CheckboxProps): JSX.Element => {
  return (
    <div className={twMerge("flex items-center font-inter text-bunker-300", containerClassName)}>
      <CheckboxPrimitive.Root
        className={twMerge(
          "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-mineshaft-400/50 bg-mineshaft-600 shadow transition-all hover:bg-mineshaft-500",
          isDisabled && "bg-bunker-400 hover:bg-bunker-400",
          isChecked && "border-primary/30 bg-primary/10",
          Boolean(children) && "mr-3",
          className
        )}
        required={isRequired}
        checked={isChecked}
        disabled={isDisabled}
        {...props}
        id={id}
      >
        <CheckboxPrimitive.Indicator
          className={twMerge(
            `${checkIndicatorBg || "mt-[0.1rem] text-mineshaft-200"}`,
            indicatorClassName
          )}
        >
          {isIndeterminate ? (
            <FontAwesomeIcon icon={faMinus} size="sm" />
          ) : (
            <FontAwesomeIcon icon={faCheck} size="sm" />
          )}
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <label
        className={twMerge(
          "text-sm",
          !allowMultilineLabel && "truncate whitespace-nowrap",
          isError && "text-red-400"
        )}
        htmlFor={id}
      >
        {children}
        {isRequired && <span className="pl-1 text-red">*</span>}
      </label>
    </div>
  );
};
