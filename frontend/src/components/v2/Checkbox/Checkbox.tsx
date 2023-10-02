import { ReactNode } from "react";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
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
};

export const Checkbox = ({
  children,
  className,
  id,
  isChecked,
  isDisabled,
  isRequired,
  checkIndicatorBg,
  ...props
}: CheckboxProps): JSX.Element => {
  return (
    <div className="flex items-center font-inter text-bunker-300">
      <CheckboxPrimitive.Root
        className={twMerge(
          "flex items-center justify-center w-4 h-4 transition-all rounded shadow border border-mineshaft-400 hover:bg-mineshaft-500 bg-mineshaft-600",
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
          <FontAwesomeIcon icon={faCheck} size="sm" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <label className="text-sm whitespace-nowrap" htmlFor={id}>
        {children}
        {isRequired && <span className="pl-1 text-red">*</span>}
      </label>
    </div>
  );
};
