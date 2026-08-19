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
    <div className={twMerge("flex items-center font-inter text-label", containerClassName)}>
      <CheckboxPrimitive.Root
        className={twMerge(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-border/50 bg-container-hover shadow-sm transition-all hover:bg-foreground/10",
          isDisabled && "cursor-not-allowed bg-foreground/10 opacity-40",
          isChecked && "border-project/50 bg-project/30",
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
            `${checkIndicatorBg || "mt-[0.1rem] text-foreground"}`,
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
          isError && "text-danger"
        )}
        htmlFor={id}
      >
        {children}
        {isRequired && <span className="pl-1 text-danger">*</span>}
      </label>
    </div>
  );
};
